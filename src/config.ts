import { HTTP, Schema } from 'koishi'

import zhCNLocale from './locales/zh-CN.yml'

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
  requestConfig: HTTP.Config
}

export type IConfig = ICommandConfig & ICacheConfig & IRequestConfig

const shortcutCmdConfig = Schema.object({
  enableShortcut: Schema.boolean().default(true),
})
const shortcutCmdCfgWithSilent = Schema.intersect([
  shortcutCmdConfig,
  Schema.union([
    Schema.object({
      enableShortcut: Schema.const(true),
      silentShortcut: Schema.boolean().default(false),
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
      moreSilent: Schema.boolean().default(false),
    }),
    Schema.object({}),
  ]),
])
const commandConfig: Schema<ICommandConfig> = Schema.intersect([
  shortcutCmdCfgWithMoreSilent,
  Schema.object({
    autoUseDefaultTexts: Schema.boolean().default(true),
    autoUseSenderAvatarWhenOnlyOne: Schema.boolean().default(true),
    autoUseSenderAvatarWhenOneLeft: Schema.boolean().default(true),
  }),
])

const cacheConfig: Schema<ICacheConfig> = Schema.object({
  cacheDir: Schema.path({
    filters: ['directory'],
    allowCreate: true,
  }).default('cache/memes'),
  keepCache: Schema.boolean().default(false),
})

const requestConfig: Schema<IRequestConfig> = Schema.object({
  requestConfig: HTTP.createConfig('http://127.0.0.1:2233'),
})

export const Config: Schema<IConfig> = Schema.intersect([
  Schema.intersect([commandConfig, cacheConfig]).i18n({
    'zh-CN': zhCNLocale._config,
    zh: zhCNLocale._config,
  }),
  requestConfig,
])
