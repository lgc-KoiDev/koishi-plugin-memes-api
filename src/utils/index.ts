import { Context } from 'koishi'

import { Config } from '../config'
import * as UtilsError from './error'
import * as UtilsMemeManage from './meme-manage'
import * as UtilsUserInfo from './user-info'

export * from './common'
export * from './arg-parse'
export * from './error'
export * from './user-info'

export async function apply(ctx: Context, config: Config) {
  await UtilsMemeManage.apply(ctx, config)
  await UtilsError.apply(ctx, config)
  await UtilsUserInfo.apply(ctx, config)
}
