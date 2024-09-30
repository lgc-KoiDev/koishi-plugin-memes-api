import { Command, Context, h, paramCase } from 'koishi'
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
    inShortcut?: boolean
  }
}

declare module '../index' {
  interface MemeInternal {
    reRegisterGenerateCommands: () => Promise<void>
  }
}

type ImageFetchInfo = { src: string } | { userId: string }

export async function apply(ctx: Context, config: Config) {
  const cmdGenerate = ctx.$.cmd.subcommand('.generate')

  const generateSubCommands: Command[] = []

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
        switch (value) {
          case 'str':
            return 'string'
          case 'int':
            return 'integer'
          case 'float':
            return 'number'
          case 'bool':
            return 'boolean'
          default: {
            ctx.logger.warn(
              `Unsupported arg type ${value} in arg ${name} of meme ${info.key}`,
            )
            return 'string'
          }
        }
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

      const imageInfos: ImageFetchInfo[] = []
      const texts: string[] = []

      // transform options
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
      const parserOptions = info.params_type.args_type?.parser_options
      if (options && parserOptions) {
        for (const opt of parserOptions) {
          const optName = opt.names
            .map((v) => v.replace(/^-+/, ''))
            .filter((v) => v in options)[0]
          if (!optName || options[optName] !== true) continue
          executeAction(optName, opt)
        }
      }

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
      if (args?.length) {
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

          resolveBuffer()
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

        try {
          for (const child of args) visit(child)
          resolveBuffer()
        } catch (e) {
          if (e instanceof ArgSyntaxError) {
            ctx.logger.warn(e.message)
            return config.silentShortcut && session.inShortcut
              ? undefined
              : session.text(ArgSyntaxError.getI18NKey(e), e)
          }
          throw e
        }
      }

      const {
        params_type: {
          min_images: minImages,
          max_images: maxImages,
          min_texts: minTexts,
          max_texts: maxTexts,
          default_texts: defaultTexts,
        },
      } = info

      // auto use sender avatar check
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

      // auto use default texts check
      if (!texts.length && config.autoUseDefaultTexts) {
        texts.push(...defaultTexts)
      }

      // check image and text count
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

      // resolve images
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

      try {
        await Promise.all(tasks)
      } catch (e) {
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

      const images = imageInfoKeys.map((key) => imageMap[key])
      const userInfos = imageInfoKeys.map((key) => userInfoMap[key])

      let img: Blob
      try {
        img = await ctx.$.api.renderMeme(key, {
          images,
          texts,
          args: { ...(options ?? {}), user_infos: userInfos },
        })
      } catch (e) {
        if (e instanceof MemeError) {
          if (!e.type) throw e
          ctx.logger.warn(e)
          return config.silentShortcut &&
            session.inShortcut &&
            (config.moreSilent || // or arg error
              (e.response.status <= 540 && e.response.status > 560))
            ? undefined
            : e.memeMessage
        }
        throw e
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
