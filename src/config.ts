import { HTTP, Schema } from 'koishi'

import zhCNLocale from './locales/zh-CN.yml'

export interface CommandConfig {
  enableShortcut: boolean
  shortcutUsePrefix?: boolean
  silentShortcut?: boolean
  moreSilent?: boolean
  autoUseDefaultTexts: boolean
  autoUseSenderAvatarWhenOnlyOne: boolean
  autoUseSenderAvatarWhenOneLeft: boolean
}

export interface RequestConfig {
  requestConfig: HTTP.Config
  getInfoConcurrency: number
}

export type Config = CommandConfig & RequestConfig

const shortcutCmdConfig = Schema.object({
  enableShortcut: Schema.boolean().default(true),
})
const shortcutCmdCfgWithSilent = Schema.intersect([
  shortcutCmdConfig,
  Schema.union([
    Schema.object({
      enableShortcut: Schema.const(true),
      shortcutUsePrefix: Schema.boolean().default(true),
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

export const RequestConfig: Schema<RequestConfig> = Schema.object({
  requestConfig: HTTP.createConfig('http://127.0.0.1:2233'),
  getInfoConcurrency: Schema.natural().min(1).default(8),
})

export const Config: Schema<Config> = Schema.intersect([
  CommandConfig,
  RequestConfig,
]).i18n({
  'zh-CN': zhCNLocale._config,
  zh: zhCNLocale._config,
})
