import { HTTP, Schema } from 'koishi'

import zhCNLocale from './locales/zh-CN.yml'

export interface CommandConfig {
  enableShortcut: boolean
  silentShortcut?: boolean
  moreSilent?: boolean
  autoUseDefaultTexts: boolean
  autoUseSenderAvatarWhenOnlyOne: boolean
  autoUseSenderAvatarWhenOneLeft: boolean
}

export interface CacheConfig {
  cacheDir: string
  keepCache: boolean
}

export interface RequestConfig {
  requestConfig: HTTP.Config
  getInfoConcurrency: number
}

export type Config = CommandConfig & CacheConfig & RequestConfig

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
export const CommandConfig: Schema<CommandConfig> = Schema.intersect([
  shortcutCmdCfgWithMoreSilent,
  Schema.object({
    autoUseDefaultTexts: Schema.boolean().default(true),
    autoUseSenderAvatarWhenOnlyOne: Schema.boolean().default(true),
    autoUseSenderAvatarWhenOneLeft: Schema.boolean().default(true),
  }),
])

export const CacheConfig: Schema<CacheConfig> = Schema.object({
  cacheDir: Schema.path({
    filters: ['directory'],
    allowCreate: true,
  }).default('cache/memes'),
  keepCache: Schema.boolean().default(false),
})

export const RequestConfig: Schema<RequestConfig> = Schema.object({
  requestConfig: HTTP.createConfig('http://127.0.0.1:2233'),
  getInfoConcurrency: Schema.natural().min(1).default(8),
})

export const Config: Schema<Config> = Schema.intersect([
  CommandConfig,
  CacheConfig,
  RequestConfig,
]).i18n({
  'zh-CN': zhCNLocale._config,
  zh: zhCNLocale._config,
})
