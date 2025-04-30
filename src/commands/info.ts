import { Context, h } from 'koishi'
import { MemeInfo } from 'meme-generator-rs-api'

import { Config } from '../config'
import { formatKeywords, formatRange, listFlatJoin, listJoin } from '../utils'

export async function apply(ctx: Context, config: Config) {
  const subCmd = ctx.$.cmd.subcommand('.info <query:string>', { checkArgCount: true })

  if (config.enableShortcut) {
    subCmd.alias('表情详情').alias('表情帮助').alias('表情示例')
  }

  subCmd.action(async ({ session }, query) => {
    if (!session) return

    let info: MemeInfo
    if (query in ctx.$.infos) {
      info = ctx.$.infos[query]
    } else {
      let searchRes: string[]
      try {
        searchRes = await ctx.$.api.searchMemes(query, false)
      } catch (e) {
        return ctx.$.handleError(session, e)
      }

      if (!searchRes.length) {
        return session?.text('memes-api.errors.no-such-meme', [query])
      }

      let exactMatch: MemeInfo | undefined
      if (searchRes.length === 1) {
        exactMatch = ctx.$.infos[searchRes[0]]
      } else {
        const found = searchRes.find((x) => {
          const info = ctx.$.infos[x]
          return info.keywords.includes(query)
        })
        if (found) {
          exactMatch = ctx.$.infos[found]
        }
      }

      if (!exactMatch) {
        const sep = session.text('memes-api.info.multiple-tip-list-name-sep')
        return listFlatJoin(
          [
            session.i18n('memes-api.info.multiple-tip-head'),
            ...searchRes
              .map((x) => ctx.$.infos[x])
              .filter(Boolean)
              .map((x) =>
                session.i18n('memes-api.info.multiple-tip-list', [
                  x.key,
                  x.keywords.join(sep),
                ]),
              ),
            session.i18n('memes-api.info.multiple-tip-tail'),
          ],
          ['\n'],
        )
      }

      const name = searchRes[0]
      if (!('name' in ctx.$.infos)) {
        return session?.text('memes-api.errors.no-such-meme', [name])
      }
      info = ctx.$.infos[name]
    }

    const p = info.params
    const msg: h[][] = [
      session.i18n('memes-api.info.key', [info.key]),
      session.i18n('memes-api.info.keywords', [formatKeywords(info.keywords)]),
    ]

    if (info.shortcuts.length) {
      msg.push(
        session.i18n('memes-api.info.shortcuts', [
          formatKeywords(info.shortcuts.map((v) => v.humanized ?? v.pattern)),
        ]),
      )
    }

    if (p.max_images) {
      msg.push(
        session.i18n('memes-api.info.image-num', [
          formatRange(p.min_images, p.max_images),
        ]),
      )
    }

    if (p.max_texts) {
      msg.push(
        session.i18n('memes-api.info.text-num', [
          formatRange(p.min_texts, p.max_texts),
        ]),
        session.i18n('memes-api.info.default-texts', [formatKeywords(p.default_texts)]),
      )
    }

    if (p.options.length) {
      const optInfos = p.options.map((v) => {
        return session.i18n('memes-api.info.option', [
          [v.name, ...v.parser_flags.short_aliases, ...v.parser_flags.long_aliases]
            .map((v) => (v.length > 1 ? `--${v}` : `-${v}`))
            .join(session.text('memes-api.info.option-sep')),
          v.type === 'boolean' ? '' : ` [${v.name}: ${v.type}]`,
          v.description,
        ])
      })
      msg.push(
        session.i18n('memes-api.info.options', [
          listJoin(optInfos, [h.text('\n')]).flat(),
        ]),
      )
    }

    let previewImg: Blob
    try {
      const preview = await ctx.$.api.renderPreview(info.key)
      previewImg = await ctx.$.api.getImage(preview.image_id)
    } catch (e) {
      return ctx.$.handleError(session, e)
    }
    msg.push(
      session.i18n('memes-api.info.preview', [
        h.image(await previewImg.arrayBuffer(), previewImg.type),
      ]),
    )

    return listFlatJoin(msg, ['\n'])
  })
}
