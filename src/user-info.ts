import { Context, Session } from 'koishi'
import { UserInfo } from 'meme-generator-api'

import { Config } from './config'

import type { OneBotBot } from 'koishi-plugin-adapter-onebot'

declare module './index' {
  interface MemeInternal {
    getInfoFromID(
      session: Session,
      userId: string,
      forceFallback?: boolean,
    ): Promise<ImageAndUserInfo>
  }
}

export interface ImageAndUserInfo {
  url: string
  userInfo: UserInfo
}

export class GetAvatarFailedError extends Error {
  constructor(
    public readonly platform: string,
    public readonly userId: string,
  ) {
    super(`Failed to get avatar for user ${userId} on platform ${platform}.`)
    this.name = 'FetchAvatarFailedError'
  }
}

export async function apply(ctx: Context, config: Config) {
  ctx.$.getInfoFromID = async (session, userId, forceFallback) => {
    const platformSpecific: Record<string, () => Promise<ImageAndUserInfo>> = {
      onebot: async () => {
        const url = `http://q.qlogo.cn/headimg_dl?dst_uin=${userId}&spec=640`
        const bot = session.bot as any as OneBotBot<Context>

        if (session.isDirect) {
          const data = await bot.internal.getStrangerInfo(userId)
          return {
            url,
            userInfo: { name: data.nickname, gender: data.sex || 'unknown' },
          }
        }

        const data = await bot.internal.getGroupMemberInfo(session.guildId, userId)
        return {
          url,
          userInfo: { name: data.card || data.nickname, gender: data.sex || 'unknown' },
        }
      },
    }

    const fallback = async (): Promise<ImageAndUserInfo> => {
      let user
      if (typeof session.bot.getUser === 'function') {
        user = await session.bot.getUser(userId, session.guildId);
        if (!user.avatar) {
          throw new TypeError(`User ${userId} in platform ${session.platform} has no avatar`);
        }
        return {
          url: user.avatar,
          userInfo: { name: user.nick || user.name || '', gender: 'unknown' },
        };
      } else if (session.event.user?.avatar?.includes('http')) {
        return {
          url: session.event.user.avatar,
          userInfo: { name: session.username || session.userId || '', gender: 'unknown' },
        };
      } else {
        return {
          url: '',
          userInfo: { name: session.username || session.userId || '', gender: 'unknown' },
        };
      }
    }

    const specificFunc = platformSpecific[session.platform]
    const func =
      !specificFunc || forceFallback ? fallback : platformSpecific[session.platform]
    try {
      return await func()
    } catch (e) {
      ctx.logger.error(e)
      if (func !== fallback) {
        ctx.logger.warn(
          `Failed to get user info from platform specific method, falling back to universal`,
        )
        return ctx.$.getInfoFromID(session, userId, true)
      }
      throw new GetAvatarFailedError(session.platform, userId)
    }
  }
}
