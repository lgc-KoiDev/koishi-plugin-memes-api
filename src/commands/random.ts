import { Context, h, Random } from 'koishi'

import { Config } from '../config'
import { checkInRange } from '../utils'
import { ImagesAndInfos, ResolvedArgs } from './generate'

export async function apply(ctx: Context, config: Config) {
  const subCmd = ctx.$.cmd.subcommand('.random [args:el]')

  if (config.enableShortcut) {
    subCmd.alias('随机表情')
  }

  subCmd.action(async ({ session }, args) => {
    if (!session) return

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
    const { imageInfos, texts } = resolvedArgs

    // enable auto use sender avatar and default texts when no image and text provided
    const autoUse = !imageInfos.length && !texts.length
    if (autoUse) imageInfos.push({ userId: session.userId })

    const suitableMemes = Object.values(ctx.$.infos).filter((info) => {
      const {
        params_type: {
          min_images: minImages,
          max_images: maxImages,
          min_texts: minTexts,
          max_texts: maxTexts,
        },
      } = info
      return (
        checkInRange(imageInfos.length, minImages, maxImages) &&
        (autoUse || checkInRange(texts.length, minTexts, maxTexts))
      )
    })

    if (!suitableMemes.length) {
      return session.text('memes-api.random.no-suitable-meme')
    }

    let imagesAndInfos: ImagesAndInfos
    try {
      imagesAndInfos = await ctx.$.resolveImagesAndInfos(session, imageInfos)
    } catch (e) {
      return ctx.$.handleResolveImagesAndInfosError(session, e)
    }
    const { images, userInfos } = imagesAndInfos

    while (suitableMemes.length) {
      const index = Random.int(0, suitableMemes.length)
      const info = suitableMemes[index]
      suitableMemes.splice(index, 1)

      let img: Blob
      try {
        img = await ctx.$.api.renderMeme(info.key, {
          texts: autoUse ? info.params_type.default_texts : texts,
          images,
          args: { user_infos: userInfos },
        })
      } catch (e) {
        ctx.logger.warn(e)
        continue
      }

      const elems = [h.image(await img.arrayBuffer(), img.type)]
      if (config.randomMemeShowInfo) {
        elems.unshift(
          ...session.i18n('memes-api.random.info', [
            info.keywords.map((v) => `“${v}”`).join('、'),
          ]),
        )
      }
      return elems
    }

    return session.text('memes-api.random.no-suitable-meme')
  })
}
