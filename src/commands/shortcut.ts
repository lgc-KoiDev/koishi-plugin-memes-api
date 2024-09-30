import { Context, escapeRegExp, h } from 'koishi'
import RE2 from 're2'

import { Config } from '../config'
import { escapeArgs } from '../utils'

declare module '../index' {
  interface MemeInternal {
    refreshShortcuts?: () => Promise<void>
  }
}

interface ShortcutInfo {
  name: string
  regex: RE2
  args?: string[]
}

export async function apply(ctx: Context, config: Config) {
  if (!config.enableShortcut) return

  const shortcuts: ShortcutInfo[] = []

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

    const cmdPrefixRegex = (() => {
      if (config.shortcutUsePrefix) {
        const cmdPfxCfg = session.resolve((ctx.root.config as Context.Config).prefix)
        const cmdPfx = cmdPfxCfg instanceof Array ? cmdPfxCfg : [cmdPfxCfg ?? '']
        const hasEmptyPfx = cmdPfx.includes('')
        const cmdPfxNotEmpty = cmdPfx.filter(Boolean)
        if (cmdPfxNotEmpty.length) {
          return `(${cmdPfxNotEmpty.map(escapeRegExp).join('|')})${hasEmptyPfx ? '?' : ''}`
        }
      }
      return '()' // keep group index correct
    })()

    for (const name in ctx.$.infos) {
      const info = ctx.$.infos[name]
      const shortcuts = [
        ...info.shortcuts.map(
          (v) => [v.key.replace(/^\^/, '').replace(/\$$/, ''), v.args ?? []] as const,
        ),
        ...info.keywords.map((v) => [v, [] as string[]] as const),
      ]
      for (const [reg, args] of shortcuts) {
        const regObj = new RE2(`^${cmdPrefixRegex}${reg}`)
        const res = regObj.exec(content)
        if (!res) continue
        const argTxt =
          `${escapeArgs(resolveArgs(args, res))}` +
          ` ${content.slice(res.index + res[0].length)}`
        session.inShortcut = true
        return session.execute(`meme.generate.${name} ${argTxt}`)
      }
    }

    return next()
  })

  ctx.$.refreshShortcuts = async () => {
    if (!config.enableShortcut) return

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
}
