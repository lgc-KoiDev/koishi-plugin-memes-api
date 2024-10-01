import { Command, Context } from 'koishi'

import { Config } from '../config'
import * as Generate from './generate'
import * as Random from './random'
import * as Shortcut from './shortcut'

declare module '../index' {
  interface MemeInternal {
    cmd: Command
  }
}

export async function apply(ctx: Context, config: Config) {
  ctx.$.cmd = ctx.command('meme')
  await Generate.apply(ctx, config)
  await Shortcut.apply(ctx, config)
  await Random.apply(ctx, config)
}
