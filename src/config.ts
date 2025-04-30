import { HTTP, Schema } from 'koishi'
import { MemeListSortBy, memeListSortByVals } from 'meme-generator-rs-api'

import zhCNLocale from './locales/zh-CN.yml'

export interface GenerateCommandConfig {
  enableShortcut: boolean
  shortcutUsePrefix?: boolean
  silentShortcut?: boolean
  moreSilent?: boolean
  autoUseDefaultTexts: boolean
  autoUseSenderAvatarWhenOnlyOne: boolean
  autoUseSenderAvatarWhenOneLeft: boolean
}

export enum NewStrategy {
  DateCreated = 'date_created',
  DateModified = 'date_modified',
}
export interface ListConfig {
  listSortByRs: MemeListSortBy
  listSortReverse: boolean
  listNewTimeDelta: number
  listNewStrategy: NewStrategy
  listTextTemplate: string
  listAddCategoryIcon: boolean
}

export interface OtherCommandConfig {
  randomMemeShowInfo: boolean
  generateSubCommandCountToFather: boolean
  randomCommandCountToGenerate: boolean
}

export interface RequestConfig {
  requestConfig: HTTP.Config
  requestConcurrency: number
}

export type Config = GenerateCommandConfig &
  OtherCommandConfig &
  ListConfig &
  RequestConfig

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
export const GenerateCommandConfig: Schema<GenerateCommandConfig> = Schema.intersect([
  shortcutCmdCfgWithMoreSilent,
  Schema.object({
    autoUseDefaultTexts: Schema.boolean().default(true),
    autoUseSenderAvatarWhenOnlyOne: Schema.boolean().default(true),
    autoUseSenderAvatarWhenOneLeft: Schema.boolean().default(true),
  }),
])

export const ListConfig: Schema<ListConfig> = Schema.object({
  listSortByRs: Schema.union(memeListSortByVals).default('keywords_pinyin'),
  listSortReverse: Schema.boolean().default(false),
  listNewTimeDelta: Schema.natural().min(1).default(30),
  listNewStrategy: Schema.union(Object.values(NewStrategy)).default(
    NewStrategy.DateCreated,
  ),
  listTextTemplate: Schema.string().default('{keywords}'),
  listAddCategoryIcon: Schema.boolean().default(true),
})

export const OtherCommandConfig: Schema<OtherCommandConfig> = Schema.object({
  randomMemeShowInfo: Schema.boolean().default(true),
  generateSubCommandCountToFather: Schema.boolean().default(false),
  randomCommandCountToGenerate: Schema.boolean().default(false),
})

export const RequestConfig: Schema<RequestConfig> = Schema.object({
  requestConfig: HTTP.createConfig('http://127.0.0.1:2233'),
  requestConcurrency: Schema.natural().min(1).default(8),
})

export const Config: Schema<Config> = Schema.intersect([
  GenerateCommandConfig,
  ListConfig,
  OtherCommandConfig,
  RequestConfig,
]).i18n({
  'zh-CN': zhCNLocale._config,
  zh: zhCNLocale._config,
})
