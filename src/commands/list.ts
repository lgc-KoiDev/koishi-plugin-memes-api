import { Context, Time, h } from 'koishi'
import { MemeProperties } from 'meme-generator-rs-api'

import { Config, NewStrategy } from '../config'

export async function apply(ctx: Context, config: Config) {
  const subCmd = ctx.$.cmd.subcommand('.list')

  if (config.enableShortcut) {
    subCmd.alias('表情包制作').alias('表情列表').alias('头像表情包').alias('文字表情包')
  }

  subCmd.action(async ({ session }) => {
    if (!session) return

    const nowTimestamp = new Date().getTime()
    const timeDeltaMs = config.listNewTimeDelta * Time.day

    const properties = {} as Record<string, MemeProperties>
    for (const [key, info] of Object.entries(ctx.$.infos)) {
      const prop = {} as MemeProperties
      const compareTimeStr =
        config.listNewStrategy === NewStrategy.DateCreated
          ? info.date_created
          : info.date_modified
      const compareTimestamp = new Date(compareTimeStr).getTime()
      if (nowTimestamp - compareTimestamp <= timeDeltaMs) {
        prop.new = true
      }
      properties[key] = prop
    }

    let imgBlob: Blob
    try {
      const img = await ctx.$.api.renderList({
        meme_properties: properties,
        sort_by: config.listSortByRs,
        text_template: config.listTextTemplate,
        add_category_icon: config.listAddCategoryIcon,
      })
      imgBlob = await ctx.$.api.getImage(img.image_id)
    } catch (e) {
      return ctx.$.handleError(session, e)
    }

    const msgParams = [h.image(await imgBlob.arrayBuffer(), imgBlob.type)]
    return config.enableShortcut
      ? session.i18n('memes-api.list.tip', msgParams)
      : session.i18n('memes-api.list.tip-no-shortcut', msgParams)
  })
}
