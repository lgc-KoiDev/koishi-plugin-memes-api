import { Command, Context, escapeRegExp, h, paramCase } from 'koishi'
import {
  ActType,
  MemeError,
  MemeInfoResponse,
  ParserOption,
  UserInfo,
} from 'meme-generator-api'
import RE2 from 're2'

import { Config } from '../config'
import { GetAvatarFailedError } from '../user-info'
import {
  ArgSyntaxError,
  checkInRange,
  constructBlobFromFileResp,
  escapeArgs,
  formatRange,
  splitArgString,
} from '../utils'

declare module '../index' {
  interface MemeInternal {
    reRegisterGenerateCommands: () => Promise<void>
  }
}

type ImageFetchInfo = { src: string } | { userId: string }
interface ShortcutInfo {
  name: string
  regex: RE2
  args?: string[]
}

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

    const subCmd: Command<never, never, [h[], ...string[]], any> = cmdGenerate
      .subcommand(`.${key} [args:el]`, {
        strictOptions: true,
        hidden: true,
      })
      .option('silent', '[silent:boolean]', { hidden: true })
    for (const kw of keywords) subCmd.alias(`.${kw}`)
    if (config.enableShortcut) {
      try {
        for (const kw of keywords) subCmd.alias(kw, { options: { silent: true } })
      } catch (e) {
        ctx.logger.warn(e instanceof Error ? e.message : e)
      }
    }
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
            return options.silent
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
        return options.silent
          ? undefined
          : session.text('memes-api.errors.image-number-mismatch', [
              formatRange(minImages, maxImages),
              imageInfos.length,
            ])
      }
      if (!checkInRange(texts.length, minTexts, maxTexts)) {
        return options.silent
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
          return options.silent && config.moreSilent
            ? undefined
            : session.text('memes-api.errors.can-not-get-avatar', e)
        }
        ctx.logger.warn(e)
        return options.silent && config.moreSilent
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
          return options.silent &&
            ((e.response.status <= 540 && e.response.status > 560) || // arg error
              config.moreSilent)
            ? undefined
            : e.memeMessage
        }
        throw e
      }
      return h.image(await img.arrayBuffer(), img.type)
    })
  }

  const shortcuts: ShortcutInfo[] = []

  if (config.enableShortcut) {
    const extractContentPlaintext = (content: string) => {
      let elems: h[]
      try {
        elems = h.parse(content)
      } catch (e) {
        return content
      }

      const textBuffer: string[] = []
      const visit = (e: h) => {
        if (e.children.length) {
          for (const child of e.children) visit(child)
        }
        if (e.type === 'text') {
          const t = e.attrs.content
          if (t) textBuffer.push(t)
        }
      }
      for (const child of elems) visit(child)
      return textBuffer.join('')
    }

    const resolveArgs = (args: string[], res: RegExpExecArray) => {
      return args.map((v) => {
        // double bracket should escape it
        return v.replace(/(?<l>[^\{])?\{(?<v>.+?)\}(?<r>[^\}])?/g, (...args) => {
          type Groups = Record<'l' | 'r', string | undefined> & Record<'v', string>
          const { l, v, r } = args[args.length - 1] as Groups
          const index = parseInt(v)
          let resolved: string
          if (!isNaN(index)) {
            // increase index because [1] is cmd pfx
            resolved = res[index === 0 ? 0 : index + 1] ?? v
          } else if (res.groups && v in res.groups) {
            resolved = res.groups[v]
          } else {
            resolved = v
          }
          return `${l ?? ''}${extractContentPlaintext(resolved)}${r ?? ''}`
        })
      })
    }

    ctx.middleware(async (session, next) => {
      const { content } = session
      if (!content) return next()

      const cmdPfxCfg = session.resolve((ctx.root.config as Context.Config).prefix)
      const cmdPfx = cmdPfxCfg instanceof Array ? cmdPfxCfg : [cmdPfxCfg ?? '']
      const hasEmptyPfx = cmdPfx.includes('')
      const cmdPfxNotEmpty = cmdPfx.filter(Boolean)
      const cmdPrefixRegex = cmdPfxNotEmpty.length
        ? `(${cmdPfxNotEmpty.map(escapeRegExp).join('|')})${hasEmptyPfx ? '?' : ''}`
        : '()' // keep group index correct

      for (const name in ctx.$.infos) {
        const info = ctx.$.infos[name]
        for (const s of info.shortcuts) {
          const trimmed = s.key.replace(/^\^/, '').replace(/\$$/, '')
          const regex = new RE2(`^${cmdPrefixRegex}${trimmed}$`)
          const res = regex.exec(content)
          if (!res) continue
          const args = s.args ? resolveArgs(s.args, res) : []
          const argTxt = `${escapeArgs(args)} ${content.slice(res.index + res[0].length)}`
          return session.execute(`meme.generate.${name} ${argTxt}`)
        }
      }

      return next()
    })
  }

  const refreshShortcuts = () => {
    const tmpShortcuts: ShortcutInfo[] = []
    for (const name in ctx.$.infos) {
      for (const s of ctx.$.infos[name].shortcuts) {
        tmpShortcuts.push({
          name,
          regex: new RE2(s.key),
          args: s.args ?? undefined,
        })
      }
    }
    shortcuts.length = 0
    shortcuts.push(...tmpShortcuts)
  }

  ctx.$.reRegisterGenerateCommands = async () => {
    for (const cmd of generateSubCommands) cmd.dispose()
    generateSubCommands.length = 0

    generateSubCommands.push(
      ...Object.values(ctx.$.infos).map((v) => registerGenerateCmd(v)),
    )

    if (config.enableShortcut) refreshShortcuts()
  }
  await ctx.$.reRegisterGenerateCommands()
}
