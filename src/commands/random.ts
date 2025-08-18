import { Context, Random, h } from 'koishi'
import { MemeInfo, MemeOption } from 'meme-generator-rs-api'

import { Config } from '../config'
import { checkInRange, formatKeywords } from '../utils'
import { ImagesAndInfos, ResolvedArgs } from './generate'

export async function apply(ctx: Context, config: Config) {
  const subCmd = ctx.$.cmd.subcommand('.random [args:el]')

  if (config.enableShortcut) {
    subCmd.alias('随机表情')
  }

  subCmd.action(async ({ session, options }, args) => {
    if (!session || !session.userId) return

    if (config.randomCommandCountToGenerate) {
      const msg = await ctx.$.checkAndCountToGenerate(session)
      if (msg) return msg
    }

    let resolvedArgs: ResolvedArgs
    try {
      resolvedArgs = await ctx.$.resolveArgs(session, args ?? [])
    } catch (e) {
      return ctx.$.handleResolveArgsError(session, e)
    }
    const { imageInfos, texts, names } = resolvedArgs

    // enable auto use sender avatar and default texts when no image and text provided
    const autoUse = !imageInfos.length && !texts.length
    if (autoUse) imageInfos.push({ userId: session.userId })

    const checkOptionExists = (info: MemeInfo) => {
      if (!options) return true
      const {
        params: { options: memeOpts },
      } = info
      return !Object.keys(options).some(
        (k) =>
          // 在没找着时返回 true
          !memeOpts.some((x) => x.name === k),
      )
    }

    const castOpt = (opt: MemeOption) => {
      if (!options || !(opt.name in options)) return undefined
      const { type } = opt
      const raw = (options as Record<string, any>)[opt.name]
      switch (type) {
        case 'boolean':
          return ['true', '1'].includes(`${raw}`.toLowerCase())
        case 'integer':
          return parseInt(raw, 10)
        case 'float':
          return parseFloat(raw)
        default:
          return `${raw}`
      }
    }

    const castOptions = (info: MemeInfo) => {
      const newOpts: Record<string, any> = {}
      if (!options) return {}
      for (const k in options) {
        const opt = info.params.options.find((x) => x.name === k)
        if (opt) {
          newOpts[k] = castOpt(opt)
        }
      }
      return newOpts
    }

    const suitableMemes = Object.values(ctx.$.infos).filter((info) => {
      const {
        params: {
          min_images: minImages,
          max_images: maxImages,
          min_texts: minTexts,
          max_texts: maxTexts,
        },
      } = info
      return (
        checkInRange(imageInfos.length, minImages, maxImages) &&
        (autoUse || checkInRange(texts.length, minTexts, maxTexts)) &&
        checkOptionExists(info)
      )
    })

    if (!suitableMemes.length) {
      return session.text('memes-api.random.no-suitable-meme')
    }

    let uploadInfo: ImagesAndInfos
    try {
      uploadInfo = await ctx.$.resolveImagesAndInfos(session, imageInfos, names)
    } catch (e) {
      return ctx.$.handleResolveImagesAndInfosError(session, e)
    }

    while (suitableMemes.length) {
      const index = Random.int(0, suitableMemes.length)
      const info = suitableMemes[index]
      suitableMemes.splice(index, 1)

      let res: Blob
      try {
        const opts = castOptions(info)
        res = await ctx.$.uploadImgAndRenderMeme(info, texts, uploadInfo, opts)
      } catch (e) {
        ctx.logger.warn(e)
        continue
      }

      const el = [h.image(await res.arrayBuffer(), res.type)]
      if (config.randomMemeShowInfo) {
        el.unshift(
          ...session.i18n('memes-api.random.info', [formatKeywords(info.keywords)]),
        )
      }
      return el
    }

    return session.text('memes-api.random.no-suitable-meme')
  })
}
