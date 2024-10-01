import { HTTP, Schema } from 'koishi'

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

export enum ListSortBy {
  default = 'default',
  type = 'type',
  key = 'key',
  keywords = 'keywords',
  dateCreated = 'dateCreated',
  dateModified = 'dateModified',
}
export interface ListConfig {
  listSortBy: ListSortBy
  listSortReverse: boolean
  listNewTimeDelta: number
  listTextTemplate: string
  listAddCategoryIcon: boolean
}

export interface OtherCommandConfig {
  randomMemeShowInfo: boolean
  generateSubCommandCountToFather: boolean
  randomCommandCountToGenerate: boolean
}

export interface CacheConfig {
  cacheDir: string
  keepCache: boolean
}

export interface RequestConfig {
  requestConfig: HTTP.Config
  getInfoConcurrency: number
}

export type Config = GenerateCommandConfig &
  OtherCommandConfig &
  ListConfig &
  CacheConfig &
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
  listSortBy: Schema.union(Object.values(ListSortBy)).default(ListSortBy.default),
  listSortReverse: Schema.boolean().default(false),
  listNewTimeDelta: Schema.natural().min(1).default(30),
  listTextTemplate: Schema.string().default('{keywords}'),
  listAddCategoryIcon: Schema.boolean().default(true),
})

export const OtherCommandConfig: Schema<OtherCommandConfig> = Schema.object({
  randomMemeShowInfo: Schema.boolean().default(true),
  generateSubCommandCountToFather: Schema.boolean().default(false),
  randomCommandCountToGenerate: Schema.boolean().default(false),
})

export const CacheConfig: Schema<CacheConfig> = Schema.object({
  cacheDir: Schema.path({
    filters: ['directory'],
    allowCreate: true,
  }).default('cache/memes'),
  keepCache: Schema.boolean().default(false),
}).hidden() // LAZY TO IMPL CACHE

export const RequestConfig: Schema<RequestConfig> = Schema.object({
  requestConfig: HTTP.createConfig('http://127.0.0.1:2233'),
  getInfoConcurrency: Schema.natural().min(1).default(8),
})

export const Config: Schema<Config> = Schema.intersect([
  GenerateCommandConfig,
  ListConfig,
  OtherCommandConfig,
  CacheConfig,
  RequestConfig,
]).i18n({
  'zh-CN': zhCNLocale._config,
  zh: zhCNLocale._config,
})
