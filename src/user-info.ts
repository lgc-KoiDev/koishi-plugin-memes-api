import { Context, Session } from 'koishi'

import { logger } from './const'
import { MemeUserInfo } from './data-source'

import type { OneBotBot } from 'koishi-plugin-adapter-onebot'

export interface ImageAndUserInfo {
  url: string | Promise<string>
  user_info?: MemeUserInfo
}

export class CanNotGetAvatarError extends Error {
  constructor(
    public platform: string,
    public userId: string,
  ) {
    super(`Can not get avatar for user ${userId} on platform ${platform}.`)
  }
}

export async function getInfoFromID(
  session: Session,
  userId: string,
  forceFallback?: boolean,
): Promise<ImageAndUserInfo> {
  const platformSpecific: Record<string, () => Promise<ImageAndUserInfo>> = {
    onebot: async () => {
      const url = `http://q.qlogo.cn/headimg_dl?dst_uin=${userId}&spec=640`
      const bot = session.bot as any as OneBotBot<Context>

      if (session.isDirect) {
        const data = await bot.internal.getStrangerInfo(userId)
        return {
          url,
          user_info: { name: data.nickname, gender: data.sex || 'unknown' },
        }
      }

      const data = await bot.internal.getGroupMemberInfo(session.guildId, userId)
      return {
        url,
        user_info: { name: data.card || data.nickname, gender: data.sex || 'unknown' },
      }
    },
  }

  const fallback = async (): Promise<ImageAndUserInfo> => {
    const user = await session.bot.getUser(userId, session.guildId)
    if (!user.avatar) {
      throw new TypeError(
        `User ${userId} in platform ${session.platform} has no avatar`,
      )
    }
    return {
      url: user.avatar,
      user_info: { name: user.nick || user.name || '', gender: 'unknown' },
    }
  }

  const specificFunc = platformSpecific[session.platform]
  const func =
    !specificFunc || forceFallback ? fallback : platformSpecific[session.platform]
  try {
    return await func()
  } catch (e) {
    logger.error(e)
    if (func !== fallback) {
      logger.warn(
        `Failed to get user info from platform specific method, falling back to universal`,
      )
      return getInfoFromID(session, userId, true)
    }
    throw new CanNotGetAvatarError(session.platform, userId)
  }
}
