import type {} from '@koishijs/plugin-help'
import type { Notifier } from '@koishijs/plugin-notifier'
import { Context } from 'koishi'
import { MemeAPI, MemeInfo } from 'meme-generator-rs-api'

import * as Commands from './commands'
import { Config } from './config'
import zhCNLocale from './locales/zh-CN.yml'
import * as Utils from './utils'

export { Config }

export const name = 'memes-api'

export const inject = {
  required: ['http'],
  optional: ['notifier'],
}

export interface MemePublic {
  api: MemeAPI
  infos: Record<string, MemeInfo>
}
export interface MemeInternal {
  $public: MemePublic
  notifier?: Notifier
}
declare module 'koishi' {
  interface Context {
    $: MemeInternal
    memesApi: MemePublic
  }
}

export async function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh-CN', zhCNLocale)
  ctx.i18n.define('zh', zhCNLocale)

  // isolate new context for plugin internal use
  ctx = ctx.isolate('$')
  ctx.set('$', {})

  await Utils.apply(ctx, config)

  ctx.inject(['notifier'], () => {
    ctx.$.notifier = ctx.notifier.create()
  })
  ctx.$.notifier?.update({ type: 'primary', content: '插件初始化中……' })

  try {
    await ctx.$.updateInfos()
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
    await Commands.apply(ctx, config)
    await ctx.$.reRegisterGenerateCommands()
    await ctx.$.refreshShortcuts?.()
  } catch (e) {
    try {
      ctx.$.cmd?.dispose()
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

  ctx.$.$public = {
    get api() {
      return ctx.$.api
    },
    get infos() {
      return ctx.$.infos
    },
  }
  ctx.set('memesApi', ctx.$.$public)

  const memeCount = Object.keys(ctx.$.infos).length
  ctx.$.notifier?.update({
    type: 'success',
    content: <p>插件初始化完毕，共载入 {memeCount} 个表情。</p>,
  })
  ctx.logger.info(`Plugin initialized successfully, loaded ${memeCount} memes`)
}
