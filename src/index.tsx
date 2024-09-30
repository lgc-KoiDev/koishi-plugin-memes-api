import { Context } from 'koishi'
import { MemeAPI, MemeInfoResponse } from 'meme-generator-api'
import pLimit from 'p-limit'

import * as Commands from './commands'
import { Config } from './config'
import { name } from './const'
import zhCNLocale from './locales/zh-CN.yml'
import * as UserInfo from './user-info'

import type {} from '@koishijs/plugin-help'
import type { Notifier } from '@koishijs/plugin-notifier'

export { Config, name }

export const inject = {
  required: ['http'],
  optional: ['notifier'],
}

export interface MemeInternal {
  notifier?: Notifier
  api: MemeAPI
  infos: Record<string, MemeInfoResponse>
  updateInfos: (
    progressCallback?: (now: number, total: number) => void,
  ) => Promise<void>
}
export interface MemePublic {}
declare module 'koishi' {
  interface Context {
    $: MemeInternal
    memesApi: MemePublic
  }
}

export async function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh-CN', zhCNLocale)
  ctx.i18n.define('zh', zhCNLocale)

  ctx.set('memesApi', {})

  // isolate new context for plugin internal use
  ctx = ctx.isolate('$')
  ctx.set('$', {})

  ctx.inject(['notifier'], () => {
    ctx.$.notifier = ctx.notifier.create()
  })

  ctx.$.api = new MemeAPI(ctx.http.extend(config.requestConfig))

  ctx.$.infos = {}
  ctx.$.updateInfos = async (progressCallback) => {
    const keys = await ctx.$.api.getKeys()
    const len = keys.length
    progressCallback?.(0, len)

    let ok = 0
    const limit = pLimit(config.getInfoConcurrency)
    const newEntries = await Promise.all(
      keys.map((key) => {
        return limit(async () => {
          const v = await ctx.$.api.getInfo(key)
          ok += 1
          progressCallback?.(ok, len)
          return [key, v] as const
        })
      }),
    )
    for (const k in ctx.$.infos) delete ctx.$.infos[k]
    Object.assign(ctx.$.infos, Object.fromEntries(newEntries))
  }

  await UserInfo.apply(ctx, config)
  await Commands.apply(ctx, config)

  // init (and notify)
  const initMemeList = async () => {
    const tip = '获取表情信息中……'
    ctx.$.notifier?.update({ type: 'primary', content: tip })
    await ctx.$.updateInfos(
      ctx.timer.throttle((now, total) => {
        const p = Math.ceil((now / total) * 100)
        ctx.$.notifier?.update(
          <p>
            {tip}
            <progress percentage={p} duration={1}>
              {now} / {total} | {p}%
            </progress>
          </p>,
        )
      }, 250),
    )
  }
  try {
    await initMemeList()
  } catch (e) {
    ctx.logger.warn('Failed to fetch meme list, plugin will not work')
    ctx.logger.warn(e)
    ctx.$.notifier?.update({
      type: 'danger',
      content: (
        <p>
          获取表情信息失败，插件将不会工作！
          <br />
          请检查你的请求设置以及 meme-generator 的部署状态，更多信息请查看日志。
        </p>
      ),
    })
    return
  }

  try {
    await ctx.$.reRegisterGenerateCommands()
    await ctx.$.refreshShortcuts?.()
  } catch (e) {
    try {
      ctx.$.cmd.dispose()
    } catch (_) {}
    ctx.logger.warn('Failed to initialize commands, plugin will not work')
    ctx.logger.warn(e)
    ctx.$.notifier?.update({
      type: 'danger',
      content: (
        <p>
          注册插件指令时出错，插件将不会工作！
          <br />
          更多信息请查看日志。
        </p>
      ),
    })
    return
  }

  const memeCount = Object.keys(ctx.$.infos).length
  ctx.timer.setTimeout(() => {
    ctx.$.notifier?.update({
      type: 'success',
      content: <p>插件初始化完毕，共载入 {memeCount} 个表情。</p>,
    })
  }, 600)
  ctx.logger.info(`Plugin initialized successfully, loaded ${memeCount} memes`)
}
