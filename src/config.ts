import { Quester, Schema } from 'koishi'

import { configLocale } from './locale'

interface ICommandConfig {
  enableShortcut: boolean
  silentShortcut?: boolean
  moreSilent?: boolean
  autoUseDefaultTexts: boolean
  autoUseSenderAvatarWhenOnlyOne: boolean
  autoUseSenderAvatarWhenOneLeft: boolean
}

interface ICacheConfig {
  cacheDir: string
  keepCache: boolean
}

interface IRequestConfig {
  requestConfig: Quester.Config
}

export type IConfig = ICommandConfig & ICacheConfig & IRequestConfig

const shortcutCmdConfig = Schema.object({
  enableShortcut: Schema.boolean()
    .default(true)
    .description(configLocale.command.enableShortcut),
}).description(configLocale.command.title)
const shortcutCmdCfgWithSilent = Schema.intersect([
  shortcutCmdConfig,
  Schema.union([
    Schema.object({
      enableShortcut: Schema.const(true),
      silentShortcut: Schema.boolean()
        .default(false)
        .description(configLocale.command.silentShortcut),
    }),
    Schema.object({}),
  ]),
])
const shortcutCmdCfgWithMoreSilent = Schema.intersect([
  shortcutCmdCfgWithSilent,
  Schema.union([
    Schema.object({
      enableShortcut: Schema.const(true),
      silentShortcut: Schema.const(true).required(),
      moreSilent: Schema.boolean()
        .default(false)
        .description(configLocale.command.moreSilent),
    }),
    Schema.object({}),
  ]),
])
const commandConfig: Schema<ICommandConfig> = Schema.intersect([
  shortcutCmdCfgWithMoreSilent,
  Schema.object({
    autoUseDefaultTexts: Schema.boolean()
      .default(true)
      .description(configLocale.command.autoUseDefaultTexts),
    autoUseSenderAvatarWhenOnlyOne: Schema.boolean()
      .default(true)
      .description(configLocale.command.autoUseSenderAvatarWhenOnlyOne),
    autoUseSenderAvatarWhenOneLeft: Schema.boolean()
      .default(true)
      .description(configLocale.command.autoUseSenderAvatarWhenOneLeft),
  }),
])

const cacheConfig: Schema<ICacheConfig> = Schema.object({
  cacheDir: Schema.path({ filters: ['directory'], allowCreate: true })
    .default('cache/memes')
    .description(configLocale.cache.cacheDir),
  keepCache: Schema.boolean()
    .default(false)
    .description(configLocale.cache.keepCache),
}).description(configLocale.cache.title)

const requestConfig: Schema<IRequestConfig> = Schema.object({
  requestConfig: Quester.createConfig('http://127.0.0.1:2233'),
})

export const Config: Schema<IConfig> = Schema.intersect([
  commandConfig,
  cacheConfig,
  requestConfig,
])
