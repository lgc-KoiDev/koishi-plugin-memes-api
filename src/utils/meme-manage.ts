import { Context } from 'koishi'
import { MemeAPI, MemeInfo } from 'meme-generator-rs-api'

import { Config } from '../config'

declare module '../index' {
  interface MemeInternal {
    api: MemeAPI
    infos: Record<string, MemeInfo>
    fetchInfos: () => Promise<Record<string, MemeInfo>>
    updateInfos: () => Promise<Record<string, MemeInfo>>
  }
}

export async function apply(ctx: Context, config: Config) {
  ctx.$.api = new MemeAPI(ctx.http.extend(config.requestConfig))
  ctx.$.infos = {}

  ctx.$.fetchInfos = async () => {
    const infoArr = await ctx.$.api.getInfos()
    return infoArr.reduce(
      (acc, info) => {
        acc[info.key] = info
        return acc
      },
      {} as Record<string, MemeInfo>,
    )
  }

  ctx.$.updateInfos = async () => {
    ctx.$.infos = await ctx.$.fetchInfos()
    return ctx.$.infos
  }
}
