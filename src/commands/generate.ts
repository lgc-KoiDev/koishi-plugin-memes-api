import { Argv, Command, Context, Session, h } from 'koishi'
import { MemeImage, MemeInfo, MemeOption, MemeOptionType } from 'meme-generator-rs-api'

import { Config } from '../config'
import {
  checkInRange,
  constructBlobFromFileResp,
  formatRange,
  splitArgString,
} from '../utils'
import { UserInfo, UserInfoGender } from '../utils/user-info'

export interface ResolvedShortcutInfo {
  rawMessage: h[]
  names?: string[]
  texts?: string[]
  options?: Record<string, any>
}

export interface SessionInternal {
  inGenerateSubCommand?: boolean
  shortcut?: boolean
}

declare module 'koishi' {
  interface Session {
    memesApi: SessionInternal
  }
}

export interface OptionInfo {
  names: string[]
  argName: string
  type: string
  description: string
}

export type ImageFetchInfo = { src: string } | { userId: string }
export interface ResolvedArgs {
  imageInfos: ImageFetchInfo[]
  texts: string[]
  names: string[]
}
export interface ImagesAndInfos {
  images: Blob[]
  names: string[]
  gender: UserInfoGender
}

declare module '../index' {
  interface MemeInternal {
    resolveArgs(session: Session, args: h[]): Promise<ResolvedArgs>
    resolveImagesAndInfos: (
      session: Session,
      imageInfos: ImageFetchInfo[],
      existingNames?: string[],
    ) => Promise<ImagesAndInfos>
    checkAndCountToGenerate(session: Session): Promise<h[] | undefined>
    uploadImages(images: Blob[]): Promise<string[]>
    uploadImagesAndProcess(
      meme: MemeInfo,
      uploadInfo: ImagesAndInfos,
      options?: Record<string, any>,
    ): Promise<MemeImage[]>
    normalizeOptionType(type: MemeOptionType): string
    checkOptions(
      session: Session,
      options: Record<string, any>,
      info: MemeInfo,
    ): Promise<h.Fragment | undefined>
    uploadImgAndRenderMeme(
      meme: MemeInfo,
      texts: string[],
      uploadInfo: ImagesAndInfos,
      options: Record<string, any>,
    ): Promise<Blob>
    reRegisterGenerateCommands: () => Promise<void>
  }
}

export async function apply(ctx: Context, config: Config) {
  const cmdGenerate = ctx.$.cmd.subcommand('.generate').action(async ({ session }) => {
    if (session?.memesApi.inGenerateSubCommand) return
    return session?.execute('help meme.generate')
  })

  const generateSubCommands: Command[] = []

  ctx.$.resolveArgs = async (session, args) => {
    const imageInfos: ImageFetchInfo[] = []
    const texts: string[] = []
    const names: string[] = []

    // append images from quote
    if (session.quote?.elements) {
      const visit = (e: h) => {
        if (e.children.length) {
          for (const child of e.children) visit(child)
        }
        if (e.type === 'img') {
          const src = e.attrs.src
          if (src) imageInfos.push({ src })
        }
      }
      for (const child of session.quote.elements) visit(child)
    }

    // resolve user images and additional images from args
    const textBuffer: string[] = []

    const resolveBuffer = () => {
      if (!textBuffer.length) return
      const bufferTexts = splitArgString(textBuffer.join('')).filter((v) => {
        if (v === '自己' || v === '@自己') {
          imageInfos.push({ userId: session.userId })
          return false
        }
        if (v.startsWith('@')) {
          const userId = v.slice(1)
          imageInfos.push({ userId })
          return false
        }
        if (v.startsWith('#')) {
          const name = v.slice(1)
          names.push(name)
          return false
        }
        return true
      })
      textBuffer.length = 0
      texts.push(...bufferTexts)
    }

    const visit = (e: h) => {
      if (e.children.length) {
        for (const child of e.children) visit(child)
      }

      if (e.type === 'text') {
        const t = e.attrs.content
        if (t) textBuffer.push(t)
        return
      }

      resolveBuffer() // other segments should split text args
      switch (e.type) {
        case 'img': {
          const src = e.attrs.src
          if (src) imageInfos.push({ src })
          break
        }
        case 'at': {
          const userId = e.attrs.id
          if (userId) imageInfos.push({ userId })
          break
        }
      }
    }

    for (const child of args) visit(child)
    resolveBuffer()

    return { imageInfos, texts, names }
  }

  ctx.$.resolveImagesAndInfos = async (session, imageInfos, existingNames) => {
    const imageInfoKeys = imageInfos.map((v) => JSON.stringify(v))

    const imageMap: Record<string, Blob> = {}
    const userInfoMap: Record<string, UserInfo> = {}

    const tasks = [...new Set(imageInfoKeys)].map(async (key) => {
      const index = imageInfoKeys.indexOf(key)
      const info = imageInfos[index]

      let url: string
      let userInfo: UserInfo
      if ('src' in info) {
        url = info.src
        userInfo = {}
      } else if ('userId' in info) {
        ;({ url, userInfo } = await ctx.$.getInfoFromID(session, info.userId))
      } else {
        throw new Error('Invalid image info')
      }

      imageMap[key] = constructBlobFromFileResp(await ctx.http.file(url))
      userInfoMap[key] = userInfo
    })
    await Promise.all(tasks)

    const images = imageInfoKeys.map((key) => imageMap[key])
    const userInfos = imageInfoKeys.map((key) => userInfoMap[key])
    const names = [
      ...(existingNames ?? []),
      ...userInfos
        .slice(existingNames?.length ?? 0)
        .map((x) => x.name ?? session.author.nick ?? session.username),
    ]
    const gender = userInfos.find((x) => x.gender)?.gender ?? 'unknown'
    return { images, names, gender }
  }

  ctx.$.checkAndCountToGenerate = async (session) => {
    ;(session.memesApi ??= {}).inGenerateSubCommand = true
    const fatherRet = await session.execute('meme.generate', true)
    delete session.memesApi.inGenerateSubCommand
    // father command should return empty array if inGenerateSubCommand is true
    return fatherRet.length ? fatherRet : undefined
  }

  ctx.$.uploadImages = async (images) => {
    const pLimit = (await import('p-limit')).default
    const sem = pLimit(config.requestConcurrency)
    return Promise.all(
      images.map((x) =>
        x
          .arrayBuffer()
          .then((x) => ({
            type: 'data' as const,
            data: Buffer.from(x).toString('base64'),
          }))
          .then((x) => sem(() => ctx.$.api.uploadImage(x)))
          .then((x) => x.image_id),
      ),
    )
  }

  ctx.$.uploadImagesAndProcess = async (meme, { images, names, gender }, options) => {
    const imageIds = await ctx.$.uploadImages(images)
    const imagesReq = imageIds.map((id, k) => ({ id, name: names[k] }))
    if (
      options &&
      meme.params.options.some((v) => v.name === 'gender') &&
      !('gender' in options)
    ) {
      options.gender = gender
    }
    return imagesReq
  }

  ctx.$.normalizeOptionType = (type) => {
    if (type === 'float') return 'number'
    return type
  }

  ctx.$.checkOptions = async (session, options, info) => {
    const {
      params: { options: memeOpts },
    } = info
    for (const opt of memeOpts) {
      if (!(opt.name in options)) continue
      if (opt.minimum || opt.maximum) {
        const curr = parseFloat(options[opt.name])
        if (isNaN(curr)) {
          return session.text('memes-api.errors.option-type-mismatch.number', [
            opt.name,
          ])
        }
        if (opt.minimum && curr < opt.minimum) {
          return session.text('memes-api.errors.option-number-too-small', [
            opt.name,
            opt.minimum,
          ])
        }
        if (opt.maximum && curr > opt.maximum) {
          return session.text('memes-api.errors.option-number-too-big', [
            opt.name,
            opt.maximum,
          ])
        }
      }
    }
  }

  ctx.$.uploadImgAndRenderMeme = async (meme, texts, uploadInfo, options) => {
    const imgResp = await ctx.$.api.renderMeme(meme.key, {
      texts,
      images: await ctx.$.uploadImagesAndProcess(meme, uploadInfo, options),
      options,
    })
    return await ctx.$.api.getImage(imgResp.image_id)
  }

  const registerGenerateOptions = (cmd: Command, options: MemeOption[]) => {
    for (const opt of options) {
      const {
        type,
        name,
        description,
        parser_flags: { short_aliases: sa, long_aliases: la },
        choices,
      } = opt
      const kType = ctx.$.normalizeOptionType(type)
      const cfg = { aliases: [...sa, ...la] } as Argv.OptionConfig
      if (choices && choices.length) {
        cfg.type = choices
      }
      cmd.option(name, `[${name}:${kType}] ${description}`, cfg)
    }
    return cmd
  }

  const registerGenerateCmd = (meme: MemeInfo) => {
    const { key, keywords } = meme

    const subCmd: Command<never, never, [h[], ...string[]], any> =
      cmdGenerate.subcommand(`.${key} [args:el]`, { strictOptions: true, hidden: true })
    for (const kw of keywords) {
      try {
        subCmd.alias(`.${kw}`)
      } catch (e) {
        ctx.logger.warn(`Failed to register alias ${kw} for meme ${key}`)
        ctx.logger.warn(e)
      }
    }
    registerGenerateOptions(subCmd, meme.params.options)

    return subCmd.action(async ({ session, options }, args) => {
      if (!session) return

      if (config.generateSubCommandCountToFather) {
        const msg = await ctx.$.checkAndCountToGenerate(session)
        if (msg) return msg
      }

      if (options) {
        const err = await ctx.$.checkOptions(session, options, meme)
        if (err) return err
      }

      let resolvedArgs: ResolvedArgs
      try {
        resolvedArgs = await ctx.$.resolveArgs(session, args ?? [])
      } catch (e) {
        return ctx.$.handleResolveArgsError(session, e)
      }

      const { imageInfos, texts, names } = resolvedArgs
      const {
        params: {
          min_images: minImages,
          max_images: maxImages,
          min_texts: minTexts,
          max_texts: maxTexts,
          default_texts: defaultTexts,
        },
      } = meme

      const autoUseAvatar = !!(
        (config.autoUseSenderAvatarWhenOnlyOne &&
          !imageInfos.length &&
          minImages === 1) ||
        (config.autoUseSenderAvatarWhenOneLeft &&
          imageInfos.length &&
          imageInfos.length + 1 === minImages)
      )
      if (autoUseAvatar) {
        imageInfos.unshift({ userId: session.userId })
      }
      if (!texts.length && config.autoUseDefaultTexts) {
        texts.push(...defaultTexts)
      }

      if (!checkInRange(imageInfos.length, minImages, maxImages)) {
        return config.silentShortcut && session.memesApi.shortcut
          ? undefined
          : session.text('memes-api.errors.image-number-mismatch', [
              formatRange(minImages, maxImages),
              imageInfos.length,
            ])
      }
      if (!checkInRange(texts.length, minTexts, maxTexts)) {
        return config.silentShortcut && session.memesApi.shortcut
          ? undefined
          : session.text('memes-api.errors.text-number-mismatch', [
              formatRange(minTexts, maxTexts),
              texts.length,
            ])
      }

      let uploadInfo: ImagesAndInfos
      try {
        uploadInfo = await ctx.$.resolveImagesAndInfos(session, imageInfos, names)
      } catch (e) {
        return ctx.$.handleResolveImagesAndInfosError(session, e)
      }

      let res: Blob
      try {
        res = await ctx.$.uploadImgAndRenderMeme(meme, texts, uploadInfo, options)
      } catch (e) {
        return ctx.$.handleRenderError(session, e)
      }
      return h.image(await res.arrayBuffer(), res.type)
    })
  }

  ctx.$.reRegisterGenerateCommands = async () => {
    for (const cmd of generateSubCommands) cmd.dispose()
    generateSubCommands.length = 0
    generateSubCommands.push(
      ...Object.values(ctx.$.infos).map((v) => registerGenerateCmd(v)),
    )
  }
}
