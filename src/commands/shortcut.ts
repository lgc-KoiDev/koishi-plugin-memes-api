import { Context, escapeRegExp, h } from 'koishi'

import { Config } from '../config'
import { escapeArgs } from '../utils'

declare module '../index' {
  interface MemeInternal {
    refreshShortcuts: () => Promise<void>
  }
}

interface ShortcutInfo {
  name: string
  regex: string
  args: string[]
}
interface KeywordInfo {
  name: string
  keyword: string
}

export async function apply(ctx: Context, config: Config) {
  if (!config.enableShortcut) return

  const shortcuts: ShortcutInfo[] = []

  ctx.$.refreshShortcuts = async () => {
    const tmpKeywords: KeywordInfo[] = []
    const tmpRegExps: ShortcutInfo[] = []

    for (const name in ctx.$.infos) {
      const info = ctx.$.infos[name]
      info.keywords.forEach((keyword) => {
        tmpKeywords.push({ name, keyword })
      })
      info.shortcuts.forEach(({ key, args }) => {
        tmpRegExps.push({
          name,
          regex: transformRegex(key.replace(/^\^/, '').replace(/\$$/, '')),
          args: args ?? [],
        })
      })
    }

    const tmpShortcuts: ShortcutInfo[] = [
      ...tmpKeywords
        .sort((a, b) => b.keyword.length - a.keyword.length)
        .map(({ name, keyword }) => {
          return { name, regex: escapeRegExp(keyword), args: [] }
        }),
      ...tmpRegExps,
    ]

    shortcuts.length = 0
    shortcuts.push(...tmpShortcuts)
  }

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
          resolved = res[index] ?? v
        } else if (res.groups && v in res.groups) {
          resolved = res.groups[v]
        } else {
          resolved = v
        }
        return `${l ?? ''}${extractContentPlaintext(resolved)}${r ?? ''}`
      })
    })
  }

  const transformRegex = (pythonRegex: string): string => {
    return pythonRegex.replace(/\(\?P<(?<n>\w+?)>/g, '(?<$<n>>') // named groups
  }

  ctx.middleware(async (session, next) => {
    const { content } = session
    if (!content) return next()

    const cmdPrefixRegex = (() => {
      if (config.shortcutUsePrefix) {
        const cmdPfxCfg = session.resolve((ctx.root.config as Context.Config).prefix)
        const cmdPfx = cmdPfxCfg instanceof Array ? cmdPfxCfg : [cmdPfxCfg ?? '']
        const hasEmptyPfx = cmdPfx.includes('')
        const cmdPfxNotEmpty = cmdPfx.filter(Boolean)
        if (cmdPfxNotEmpty.length) {
          return `(?:${cmdPfxNotEmpty.map(escapeRegExp).join('|')})${hasEmptyPfx ? '?' : ''}`
        }
      }
      return ''
    })()

    for (const { name, regex, args } of shortcuts) {
      const res = new RegExp(`^${cmdPrefixRegex}${regex}`).exec(content)
      if (!res) continue

      const argTxt =
        `${escapeArgs(resolveArgs(args, res))}` +
        ` ${content.slice(res.index + res[0].length)}`
      session.inShortcut = true
      return session.execute(`meme.generate.${name} ${argTxt}`)
    }

    return next()
  })
}
