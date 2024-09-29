import { Command, Context } from 'koishi'

import { Config } from '../config'
import * as CmdGenerate from './generate'

declare module '../index' {
  interface MemeInternal {
    cmd: Command
  }
}

export async function apply(ctx: Context, config: Config) {
  ctx.$.cmd = ctx.command('meme')
  await CmdGenerate.apply(ctx, config)
}
