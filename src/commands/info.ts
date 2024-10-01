import { Context, h } from 'koishi'

import { Config } from '../config'
import { formatKeywords, formatRange, listJoin } from '../utils'

export async function apply(ctx: Context, config: Config) {
  const subCmd = ctx.$.cmd.subcommand('.info <query:string>', { checkArgCount: true })

  if (config.enableShortcut) {
    subCmd.alias('表情详情').alias('表情帮助').alias('表情示例')
  }

  subCmd.action(async ({ session }, query) => {
    if (!session) return

    const info = ctx.$.findMeme(query)
    if (!info) return session?.i18n('memes-api.errors.no-such-meme', [query])

    const p = info.params_type
    const msg: h[][] = [
      session.i18n('memes-api.info.key', [info.key]),
      session.i18n('memes-api.info.keywords', [formatKeywords(info.keywords)]),
    ]
    if (info.shortcuts.length) {
      msg.push(
        session.i18n('memes-api.info.shortcuts', [
          formatKeywords(info.shortcuts.map((v) => v.humanized ?? v.key)),
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
    if (p.args_type?.parser_options) {
      const a = p.args_type
      const options = ctx.$.transformToKoishiOptions(a)
      if (options.length) {
        const optInfos = options.map((v) =>
          session.i18n('memes-api.info.option', [
            `${v.names.map((v) => (v.length > 1 ? `--${v}` : `-${v}`)).join(' | ')}` +
              `${v.type === 'boolean' ? '' : ` [${v.argName}: ${v.type}]`}`,
            v.description,
          ]),
        )
        msg.push(
          session.i18n('memes-api.info.options', [
            listJoin(optInfos, [h.text('\n')]).flat(),
          ]),
        )
      }
    }
    const preview = await ctx.$.api.renderPreview(info.key)
    msg.push(
      session.i18n('memes-api.info.preview', [
        h.image(await preview.arrayBuffer(), preview.type),
      ]),
    )

    return listJoin(msg, [h.text('\n')]).flat()
  })
}
