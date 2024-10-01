import { Command, Context, h, paramCase, Session } from 'koishi'
import {
  ActType,
  MemeError,
  MemeInfoResponse,
  ParserOption,
  UserInfo,
} from 'meme-generator-api'

import { Config } from '../config'
import { GetAvatarFailedError } from '../user-info'
import {
  ArgSyntaxError,
  checkInRange,
  constructBlobFromFileResp,
  formatRange,
  splitArgString,
} from '../utils'

declare module 'koishi' {
  interface Session {
    inGenerateSubCommand?: boolean
    inShortcut?: boolean
  }
}

export type ImageFetchInfo = { src: string } | { userId: string }
export interface ResolvedArgs {
  imageInfos: ImageFetchInfo[]
  texts: string[]
}
export interface ImagesAndInfos {
  images: Blob[]
  userInfos: UserInfo[]
}

declare module '../index' {
  interface MemeInternal {
    argTypeMap: Record<string, string>
    transformOptions: (
      session: Session,
      options: Record<string, any>,
      info: MemeInfoResponse,
    ) => Promise<Record<string, any>>
    resolveArgs(session: Session, args: h[]): Promise<ResolvedArgs>
    reRegisterGenerateCommands: () => Promise<void>
    resolveImagesAndInfos: (
      session: Session,
      imageInfos: ImageFetchInfo[],
    ) => Promise<ImagesAndInfos>
    handleResolveArgsError: (session: Session, e: any) => h.Fragment | undefined
    handleResolveImagesAndInfosError: (
      session: Session,
      e: any,
    ) => h.Fragment | undefined
    handleRenderError: (session: Session, e: any) => h.Fragment | undefined
  }
}

export async function apply(ctx: Context, config: Config) {
  const cmdGenerate = ctx.$.cmd.subcommand('.generate').action(async ({ session }) => {
    if (session?.inGenerateSubCommand) return
    return session?.execute('help meme.generate')
  })

  const generateSubCommands: Command[] = []

  ctx.$.argTypeMap = {
    str: 'string',
    int: 'integer',
    float: 'number',
    bool: 'boolean',
  }

  ctx.$.transformOptions = async (session, options, info) => {
    const parserOptions = info.params_type.args_type?.parser_options
    if (!parserOptions) return options

    options = { ...options }

    const executeAction = (optName: string, opt: ParserOption) => {
      const { action, dest } = opt
      if (!action || !dest) return

      const { type, value } = action
      switch (type) {
        case ActType.STORE: {
          options[dest] = value
          break
        }
        case ActType.APPEND: {
          options[dest] = (options[dest] ?? []).concat(value)
          break
        }
        case ActType.COUNT: {
          options[dest] = (options[dest] ?? 0) + 1
          break
        }
      }
      delete options[optName]
    }

    for (const opt of parserOptions) {
      const optName = opt.names
        .map((v) => v.replace(/^-+/, ''))
        .filter((v) => v in options)[0]
      if (!optName || options[optName] !== true) continue
      executeAction(optName, opt)
    }
    return options
  }

  ctx.$.resolveArgs = async (session, args) => {
    const imageInfos: ImageFetchInfo[] = []
    const texts: string[] = []

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

    return { imageInfos, texts }
  }

  ctx.$.resolveImagesAndInfos = async (session, imageInfos) => {
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
    return { images, userInfos }
  }

  ctx.$.handleResolveArgsError = (session, e): h.Fragment | undefined => {
    if (!(e instanceof ArgSyntaxError)) throw e
    ctx.logger.warn(e.message)
    return config.silentShortcut && session.inShortcut
      ? undefined
      : session.text(ArgSyntaxError.getI18NKey(e), e)
  }

  ctx.$.handleResolveImagesAndInfosError = (session, e): h.Fragment | undefined => {
    if (e instanceof GetAvatarFailedError) {
      return config.silentShortcut && session.inShortcut && config.moreSilent
        ? undefined
        : session.text('memes-api.errors.can-not-get-avatar', e)
    }
    ctx.logger.warn(e)
    return config.silentShortcut && session.inShortcut && config.moreSilent
      ? undefined
      : session.text('memes-api.errors.download-image-failed')
  }

  ctx.$.handleRenderError = (session, e): h.Fragment | undefined => {
    if (!(e instanceof MemeError) || !e.type) throw e
    ctx.logger.warn(e)
    return config.silentShortcut &&
      session.inShortcut &&
      (config.moreSilent || // or arg error
        (e.response.status <= 540 && e.response.status > 560))
      ? undefined
      : e.memeMessage
  }

  const registerGenerateOptions = (cmd: Command, info: MemeInfoResponse) => {
    const {
      params_type: { args_type: args },
    } = info
    if (!args) return cmd

    for (const arg of args.parser_options) {
      const trimmedNames = arg.names.map((v) => v.replace(/^-+/, ''))
      const name =
        trimmedNames.filter((v) => v in args.args_model.properties)[0] ??
        trimmedNames.filter((v) => /^[a-zA-Z0-9-_]+$/.test(v)).sort((v) => -v.length)[0]
      const aliases = trimmedNames.filter((v) => v !== name)

      // no args treated as boolean option
      if (!arg.args) {
        cmd.option(name, `[${name}:boolean] ${arg.help_text ?? ''}`, { aliases })
        continue
      }

      const transformArgType = (value: string): string => {
        if (value in ctx.$.argTypeMap) return ctx.$.argTypeMap[value]
        ctx.logger.warn(
          `Unsupported arg type ${value} in arg ${name} of meme ${info.key}`,
        )
        return 'string'
      }

      const withSuffix = arg.args && arg.args.length > 1
      const aliasesSuffixed = withSuffix ? aliases.map((v) => `${v}-${name}`) : aliases
      for (const argInfo of arg.args) {
        const argName = argInfo?.name ?? name
        const argType = argInfo ? transformArgType(argInfo.value) : 'boolean'
        const nameSuffixed = withSuffix ? `${name}-${paramCase(argName)}` : name
        cmd.option(nameSuffixed, `[${argName}:${argType}] ${arg.help_text ?? ''}`, {
          aliases: aliasesSuffixed,
        })
      }
    }

    return cmd
  }

  const registerGenerateCmd = (info: MemeInfoResponse) => {
    const { key, keywords } = info

    const subCmd: Command<never, never, [h[], ...string[]], any> =
      cmdGenerate.subcommand(`.${key} [args:el]`, { strictOptions: true, hidden: true })
    for (const kw of keywords) subCmd.alias(`.${kw}`)
    registerGenerateOptions(subCmd, info)

    return subCmd.action(async ({ session, options }, args) => {
      if (!session) return

      // let generate subcommand add father command execute count
      session.inGenerateSubCommand = true
      if (config.generateCommandCountToFather) {
        const fatherRet = await session.execute('meme.generate', true)
        // father command should return empty array if inGenerateSubCommand is true
        if (fatherRet.length) return fatherRet
      }

      if (options) {
        options = await ctx.$.transformOptions(session, options, info)
      }

      let resolvedArgs: ResolvedArgs
      try {
        resolvedArgs = await ctx.$.resolveArgs(session, args ?? [])
      } catch (e) {
        return ctx.$.handleResolveArgsError(session, e)
      }
      const { imageInfos, texts } = resolvedArgs

      const {
        params_type: {
          min_images: minImages,
          max_images: maxImages,
          min_texts: minTexts,
          max_texts: maxTexts,
          default_texts: defaultTexts,
        },
      } = info

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
        return config.silentShortcut && session.inShortcut
          ? undefined
          : session.text('memes-api.errors.image-number-mismatch', [
              formatRange(minImages, maxImages),
              imageInfos.length,
            ])
      }
      if (!checkInRange(texts.length, minTexts, maxTexts)) {
        return config.silentShortcut && session.inShortcut
          ? undefined
          : session.text('memes-api.errors.text-number-mismatch', [
              formatRange(minTexts, maxTexts),
              texts.length,
            ])
      }

      let imagesAndInfos: ImagesAndInfos
      try {
        imagesAndInfos = await ctx.$.resolveImagesAndInfos(session, imageInfos)
      } catch (e) {
        return ctx.$.handleResolveImagesAndInfosError(session, e)
      }
      const { images, userInfos } = imagesAndInfos

      let img: Blob
      try {
        img = await ctx.$.api.renderMeme(key, {
          images,
          texts,
          args: { ...(options ?? {}), user_infos: userInfos },
        })
      } catch (e) {
        return ctx.$.handleRenderError(session, e)
      }
      return h.image(await img.arrayBuffer(), img.type)
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
