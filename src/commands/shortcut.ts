import { Context, escapeRegExp } from 'koishi'
import { MemeShortcut } from 'meme-generator-rs-api'

import { Config } from '../config'
import { escapeArgs, replaceBracketVar, transformRegex } from '../utils'

declare module '../index' {
  interface MemeInternal {
    refreshShortcuts?: () => Promise<void>
  }
}

export interface ShortcutInfo extends Partial<MemeShortcut> {
  name: string
  pattern: string
}
export interface KeywordInfo {
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
      info.shortcuts.forEach((s) => {
        tmpRegExps.push({ name, ...s, pattern: transformRegex(s.pattern) })
      })
    }

    const tmpShortcuts: ShortcutInfo[] = [
      ...tmpKeywords
        .sort((a, b) => b.keyword.length - a.keyword.length)
        .map(({ name, keyword }) => {
          return { name, pattern: escapeRegExp(keyword) }
        }),
      ...tmpRegExps,
    ]

    shortcuts.length = 0
    shortcuts.push(...tmpShortcuts)
  }

  const resolveArgs = (shortcut: ShortcutInfo, res: RegExpExecArray): string => {
    const args = []
    if (shortcut.names) {
      args.push(...shortcut.names?.map((x) => `#${replaceBracketVar(x, res)}`))
    }
    if (shortcut.texts) {
      args.push(...shortcut.texts?.map((x) => replaceBracketVar(x, res)))
    }
    const options = shortcut.options
      ? [
          ...Object.entries(shortcut.options).map(
            ([key, value]) =>
              `${key.length > 1 ? '--' : '-'}${key} ${escapeArgs([value])}`,
          ),
        ].join(' ')
      : ''
    return [options, args.join(' ')].filter(Boolean).join(' ')
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

    for (const shortcut of shortcuts) {
      const { name, pattern } = shortcut
      const res = new RegExp(`^${cmdPrefixRegex}${pattern}`).exec(content)
      if (res) {
        ;(session.memesApi ??= {}).shortcut = true
        return session.execute(
          `meme.generate.${name}` +
            ` ${resolveArgs(shortcut, res)}` +
            ` ${content.slice(res.index + res[0].length)}`,
        )
      }
    }

    return next()
  })
}
