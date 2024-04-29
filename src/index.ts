/* eslint-disable @typescript-eslint/naming-convention */

import { Context, escapeRegExp, h, Session } from 'koishi'

import { Config, IConfig } from './config'
import { logger } from './const'
import {
  getRetFileByResp,
  MemeSource,
  MemeUserInfo,
  ReturnFile,
  returnFileToElem,
} from './data-source'
import { formatError, MemeError, paramErrorTypes } from './error'
import { locale } from './locale'
import {
  CanNotGetAvatarError,
  getInfoFromID,
  ImageAndUserInfo,
} from './user-info'
import { extractPlaintext, formatRange, getI18N, splitArg } from './utils'

export { name } from './const'
export { Config }

export const usage = `
如果插件没有注册 \`meme\` 指令，请检查你的请求设置是否正确，以及 \`meme-generator\` 是否正常部署。  
[点我跳转 meme-generator 部署文档](https://github.com/MeetWq/meme-generator#%E6%9C%AC%E5%9C%B0%E5%AE%89%E8%A3%85)

如果插件报错，相关错误信息可以在日志中查看。  
如果想要刷新表情列表，请重载本插件。
`.trim()

declare module 'koishi' {
  interface Session {
    memePfxMatched?: string
    memeRegexMatched?: string[]
  }
}

function wrapError<TA extends any[], TR>(
  action: (...args: TA) => Promise<TR>,
): (...args: TA) => Promise<TR | h> {
  return async (...args) => {
    try {
      return await action(...args)
    } catch (e) {
      const err = e instanceof MemeError ? e : new MemeError(e)
      logger.error(err)
      return err.format()
    }
  }
}

export async function apply(ctx: Context, config: IConfig) {
  ctx.i18n.define('zh-CN', locale as any)
  ctx.i18n.define('zh', locale as any)

  const http = ctx.http.extend(config.requestConfig)
  const source = new MemeSource(config, http)
  try {
    await source.init()
  } catch (e) {
    logger.error(`MemeSource init failed!`)
    logger.error(e)
    return
  }

  const command = ctx
    .command('meme')
    .alias('memes')
    .action(({ session }) => session?.execute('help meme'))

  const cmdList = command
    .subcommand('.list')
    .action(
      wrapError(async () => [
        h.i18n(
          config.enableShortcut
            ? 'memes-api.list.tip'
            : 'memes-api.list.tip-no-shortcut',
        ),
        returnFileToElem(await source.renderList()),
      ]),
    )

  const cmdInfo = command.subcommand('.info <name:string>').action(
    wrapError(async ({ session }, name) => {
      if (!name) return session?.execute('help meme.info')

      const [meme, isIndex] = source.getMemeByKeywordOrIndex(name)
      if (!meme) {
        return formatError(isIndex ? 'no-such-index' : 'no-such-meme', {
          name,
        })
      }

      const {
        key,
        keywords,
        patterns,
        params: {
          max_images,
          max_texts,
          min_images,
          min_texts,
          default_texts,
          args,
        },
      } = meme

      const msg: any[] = []

      msg.push(h.i18n('memes-api.info.name', [key]))
      msg.push('\n')

      msg.push(h.i18n('memes-api.info.keywords', [keywords.join(', ')]))
      msg.push('\n')

      if (patterns.length) {
        msg.push(h.i18n('memes-api.info.patterns', [patterns.join(', ')]))
        msg.push('\n')
      }

      msg.push(
        h.i18n('memes-api.info.image-num', [
          formatRange(min_images, max_images),
        ]),
      )
      msg.push('\n')

      msg.push(
        h.i18n('memes-api.info.text-num', [formatRange(min_texts, max_texts)]),
      )
      msg.push('\n')

      if (default_texts.length) {
        msg.push(
          h.i18n('memes-api.info.default-texts', [
            default_texts.map((x) => `"${x}"`).join(', '),
          ]),
        )
        msg.push('\n')
      }

      if (args.length) {
        const help = await source.getHelpText(meme.key)
        if (help) {
          msg.push(h.i18n('memes-api.info.args-info', [help]))
          msg.push('\n')
        }
      }

      msg.push(
        h.i18n('memes-api.info.preview', [
          returnFileToElem(await source.renderPreview(meme.key)),
        ]),
      )

      return msg
    }),
  )

  // TODO 重构屎山，用 `h.parse` 解析消息元素
  const generateMeme = wrapError(
    async (
      session: Session<any, any>,
      name: string,
      prefix: string,
      matched?: string[],
    ) => {
      if (!session.elements) return undefined

      const [meme, isIndex] = source.getMemeByKeywordOrIndex(name)
      if (!meme) {
        return formatError(isIndex ? 'no-such-index' : 'no-such-meme', {
          name,
        })
      }
      const { key, params } = meme

      const imageInfoTasks: (ImageAndUserInfo | Promise<ImageAndUserInfo>)[] =
        []
      const texts: string[] = []
      const args: Record<string, string> = {}

      const getSenderInfo = () => getInfoFromID(session, session.author.id)

      if (matched) {
        texts.push(...matched)
      } else {
        const splitted = splitArg(
          extractPlaintext(session.elements).replace(prefix, ''),
        )
        const realArgs = splitted.filter((x) => {
          if (x === '自己' || x === '@自己') {
            imageInfoTasks.push(getSenderInfo())
            return false
          }
          if (x.startsWith('@')) {
            imageInfoTasks.push(getInfoFromID(session, x.slice(1)))
            return false
          }
          return true
        })

        const parsedParams = await source.parseArgs(key, realArgs)
        texts.push(...parsedParams.texts)
        delete parsedParams.texts

        Object.assign(args, parsedParams)
      }

      if (session.quote?.elements) {
        imageInfoTasks.push(
          ...session.quote.elements
            .filter((x) => x.type === 'img')
            .map((x) => ({ url: x.attrs.src as string })),
        )
      }
      for (const ele of session.elements.slice(1)) {
        // 需要忽略回复转化为的 at，第一个不是 at 就是指令，可以放心忽略（应该
        if (ele.type === 'img') {
          imageInfoTasks.push({ url: ele.attrs.src as string })
        }
        if (ele.type === 'at') {
          imageInfoTasks.push(getInfoFromID(session, ele.attrs.id as string))
        }
      }

      const imageArgLen = imageInfoTasks.length
      const autoUseAvatar = !!(
        (config.autoUseSenderAvatarWhenOnlyOne &&
          !imageArgLen &&
          meme.params.min_images === 1) ||
        (config.autoUseSenderAvatarWhenOneLeft &&
          imageArgLen &&
          imageArgLen + 1 === meme.params.min_images)
      )
      if (autoUseAvatar) {
        imageInfoTasks.unshift(getSenderInfo())
      }

      if (!texts.length && config.autoUseDefaultTexts) {
        texts.push(...params.default_texts)
      }
      const currentImgNum = imageInfoTasks.length
      const currentTextNum = texts.length
      if (
        currentImgNum < params.min_images ||
        currentImgNum > params.max_images
      ) {
        return formatError('image-number-mismatch', { params, currentImgNum })
      }
      if (
        currentTextNum < params.min_texts ||
        currentTextNum > params.max_texts
      ) {
        return formatError('text-number-mismatch', { params, currentTextNum })
      }

      let images: ReturnFile[]
      let userInfos: MemeUserInfo[]
      try {
        const imageInfos = await Promise.all(imageInfoTasks)
        const avatars = await Promise.all(imageInfos.map((x) => x.url))
        const tasks = avatars.map((url) =>
          ctx.http(url, { responseType: 'arraybuffer' }),
        )
        images = (await Promise.all(tasks)).map(getRetFileByResp)
        userInfos = imageInfos.map(
          (x) => x.user_info ?? { name: '', gender: 'unknown' },
        )
      } catch (e) {
        if (e instanceof CanNotGetAvatarError) {
          return h.i18n('memes-api.errors.can-not-get-avatar', [
            e.platform,
            e.userId,
          ])
        }
        logger.error(e)
        return h.i18n('memes-api.errors.download-avatar-failed')
      }

      let img
      try {
        img = await source.renderMeme(key, {
          images,
          texts,
          args: { ...args, user_infos: userInfos },
        })
      } catch (e) {
        // 这个时候出错可能需要给格式化函数传参，单独 catch 一下
        if (!(e instanceof MemeError)) throw e
        logger.error(e)
        return e.format({ name, params, currentImgNum, currentTextNum })
      }

      return returnFileToElem(img)
    },
  )

  command
    .subcommand('.generate <name:string> [...args]')
    .action(async ({ session }, name) => {
      if (!session || !session.elements) return undefined
      if (!name) return session.execute('help meme.generate')

      const rh = await (() => {
        if (session.memeRegexMatched) {
          return generateMeme(session, name, '', session.memeRegexMatched)
        }
        const plainTxt = extractPlaintext(session.elements)
        const pfx =
          session.memePfxMatched ??
          plainTxt.slice(0, plainTxt.indexOf(name) + name.length)
        return generateMeme(session, name, pfx)
      })()
      const fromShortcut = session.memeRegexMatched || session.memePfxMatched
      if (!fromShortcut || rh?.type !== 'i18n') return rh

      const errPfx = 'memes-api.errors.'
      const i18nPath = rh.attrs.path as string
      const i18nArgs = rh.children as any[]
      if (i18nPath && i18nPath.startsWith(errPfx)) {
        const errType = i18nPath.slice(errPfx.length)
        if (
          config.silentShortcut &&
          (config.moreSilent || paramErrorTypes.includes(errType as any))
        ) {
          logger.warn(`Silenced error: ${getI18N(ctx, i18nPath, i18nArgs)}`)
          return undefined
        }
      }
      return rh
    })

  if (config.enableShortcut) {
    cmdList.alias('表情包制作').alias('头像表情包').alias('文字表情包')
    cmdInfo.alias('表情详情').alias('表情帮助').alias('表情示例')

    const { prefix: cmdPrefix } = ctx.root.config ?? ''
    const cmdPrefixes =
      cmdPrefix instanceof Array ? cmdPrefix : [cmdPrefix as string]
    const cmdPrefixRegex = cmdPrefixes.map(escapeRegExp).join('|')

    type Match = { key: string; prefixes: string[]; patterns: RegExp[] }
    const matches: Match[] = []

    for (const meme of Object.values(source.memes)) {
      const { key, keywords, patterns } = meme

      const tmpPfx = []
      const tmpPtn = []
      for (const pfx of cmdPrefixes) {
        for (const keyword of keywords) {
          tmpPfx.push(`${pfx}${keyword}`)
        }
      }
      for (const pattern of patterns) {
        tmpPtn.push(new RegExp(`(${cmdPrefixRegex})${pattern}`, 'i'))
      }

      matches.push({ key, prefixes: tmpPfx, patterns: tmpPtn })
    }

    ctx.middleware(async (session, next) => {
      if (!session.elements) return undefined

      const content = extractPlaintext(session.elements).trim()

      for (const match of matches) {
        const { key, prefixes, patterns } = match

        for (const pfx of prefixes) {
          if (content.startsWith(pfx)) {
            session.memePfxMatched = pfx
            return session.execute(`meme.generate ${key}`)
          }
        }
        for (const ptn of patterns) {
          const ptnMatch = content.match(ptn)
          if (ptnMatch) {
            session.memeRegexMatched = ptnMatch.slice(2)
            return session.execute(`meme.generate ${key}`)
          }
        }
      }

      return next()
    })
  }

  logger.info(`Plugin setup successfully, loaded ${source.count} memes.`)
}
