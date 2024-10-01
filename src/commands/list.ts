import { Context, h, Time } from 'koishi'
import {
  MemeInfoResponse,
  MemeKeyWithProperties,
  MemeKeyWithPropertiesLabel,
} from 'meme-generator-api'

import { Config, ListSortBy } from '../config'

export async function apply(ctx: Context, config: Config) {
  let cachedList: MemeKeyWithProperties[] = []

  const subCmd = ctx.$.cmd.subcommand('.list')

  if (config.enableShortcut) {
    subCmd.alias('表情包制作').alias('表情列表').alias('头像表情包').alias('文字表情包')
  }

  subCmd.action(async ({ session }) => {
    if (!session) return

    let memeList: MemeKeyWithProperties[]
    if (cachedList.length) {
      memeList = cachedList
    } else {
      const infoSorter = (info1: MemeInfoResponse, info2: MemeInfoResponse) => {
        const hasImage = (info: MemeInfoResponse) => info.params_type.max_images > 0
        const compareStr = (s1: string, s2: string) =>
          config.listSortReverse ? s2.localeCompare(s1) : s1.localeCompare(s2)
        const compareNumber = (n1: number, n2: number) =>
          config.listSortReverse ? n2 - n1 : n1 - n2
        const compareStrDate = (s1: string, s2: string) =>
          compareNumber(new Date(s1).getTime(), new Date(s2).getTime())
        const compareType = (info1: MemeInfoResponse, info2: MemeInfoResponse) =>
          compareNumber(hasImage(info1) ? 0 : 1, hasImage(info2) ? 0 : 1) // image meme first

        switch (config.listSortBy) {
          case ListSortBy.key:
            return compareStr(info1.key, info2.key)
          case ListSortBy.type:
            return compareType(info1, info2)
          case ListSortBy.keywords:
            return compareStr(info1.keywords[0], info2.keywords[0])
          case ListSortBy.dateCreated:
            return compareStrDate(info1.date_created, info2.date_created)
          case ListSortBy.dateModified:
            return compareStrDate(info1.date_modified, info2.date_modified)
          default:
            return 0
        }
      }
      const nowTimestamp = new Date().getTime()
      const timeDeltaMs = config.listNewTimeDelta * Time.day
      memeList = cachedList = Object.values(ctx.$.infos)
        .sort(infoSorter)
        .map((v) => {
          const labels: MemeKeyWithPropertiesLabel[] = []
          const createdTimestamp = new Date(v.date_created).getTime()
          if (nowTimestamp - createdTimestamp <= timeDeltaMs) {
            labels.push('new')
          }
          return { meme_key: v.key, disabled: false, labels }
        })
    }

    const img = await ctx.$.api.renderList({
      meme_list: memeList,
      text_template: config.listTextTemplate,
      add_category_icon: config.listAddCategoryIcon,
    })
    return session.i18n(
      config.enableShortcut ? 'memes-api.list.tip' : 'memes-api.list.tip-no-shortcut',
      [h.image(await img.arrayBuffer(), img.type)],
    )
  })
}
