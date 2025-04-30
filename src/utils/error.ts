import { Context, Session, h } from 'koishi'
import { MemeError } from 'meme-generator-rs-api'

import { Config } from '../config'
import { ArgSyntaxError } from './arg-parse'
import { formatRange } from './common'
import { GetAvatarFailedError } from './user-info'

declare module '../index' {
  interface MemeInternal {
    handleMemeError: (session: Session, e: MemeError) => h.Fragment
    handleResolveArgsError: (session: Session, e: any) => h.Fragment | undefined
    handleResolveImagesAndInfosError: (
      session: Session,
      e: any,
    ) => h.Fragment | undefined
    handleRenderError: (session: Session, e: any) => h.Fragment | undefined
    handleError: (session: Session, e: unknown) => h.Fragment | undefined
  }
}

export async function apply(ctx: Context, config: Config) {
  ctx.$.handleMemeError = (session, e): h.Fragment => {
    if (e instanceof MemeError.Detailed) {
      const { code, data } = e.data
      switch (code) {
        case 510:
          return session.text('memes-api.errors.image-decode', [data.error])
        case 520:
          return session.text('memes-api.errors.image-encode', [data.error])
        case 530:
          return session.text('memes-api.errors.image-asset-missing', [data.path])
        case 540:
          return session.text('memes-api.errors.deserialize', [data.error])
        case 550:
          return session.text('memes-api.errors.image-number-mismatch', [
            formatRange(data.min, data.max),
            data.actual,
          ])
        case 551:
          return session.text('memes-api.errors.text-number-mismatch', [
            formatRange(data.min, data.max),
            data.actual,
          ])
        case 560:
          return session.text('memes-api.errors.text-over-length')
        case 570:
          return session.text('memes-api.errors.meme-feedback', [data.feedback])
      }
    }
    if (e.httpStatus === 404) {
      return session.text('memes-api.errors.no-such-meme')
    }
    return session.text('memes-api.errors.other-error', [e.httpStatus, e.message])
  }

  ctx.$.handleResolveArgsError = (session, e): h.Fragment | undefined => {
    if (!(e instanceof ArgSyntaxError)) throw e
    ctx.logger.warn(e.message)
    return config.silentShortcut && session.memesApi.shortcut
      ? undefined
      : session.text(ArgSyntaxError.getI18NKey(e), e)
  }

  ctx.$.handleResolveImagesAndInfosError = (session, e): h.Fragment | undefined => {
    if (e instanceof GetAvatarFailedError) {
      return config.silentShortcut && session.memesApi.shortcut && config.moreSilent
        ? undefined
        : session.text('memes-api.errors.can-not-get-avatar', e)
    }
    ctx.logger.warn(e)
    return config.silentShortcut && session.memesApi.shortcut && config.moreSilent
      ? undefined
      : session.text('memes-api.errors.download-image-failed')
  }

  ctx.$.handleRenderError = (session, e): h.Fragment | undefined => {
    ctx.logger.warn(e)
    if (!(e instanceof MemeError)) throw e
    return config.silentShortcut &&
      session.memesApi.shortcut &&
      (config.moreSilent || // or arg error
        (e instanceof MemeError.Detailed && [551, 552, 560].includes(e.data.code)))
      ? undefined
      : ctx.$.handleMemeError(session, e)
  }

  ctx.$.handleError = (session, e): h.Fragment | undefined => {
    ctx.logger.warn(e)
    if (e instanceof ArgSyntaxError) {
      return session.text(ArgSyntaxError.getI18NKey(e), e)
    }
    if (e instanceof MemeError) {
      return ctx.$.handleMemeError(session, e)
    }
    throw e
  }
}
