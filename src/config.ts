import { Quester, Schema } from 'koishi';
import { configLocale } from './locale';

export interface Config {
  enableShortcut: boolean;
  cacheDir: string;
  keepCache: boolean;
  requestConfig: Quester.Config;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enableShortcut: Schema.boolean()
      .default(true)
      .description(configLocale.command.enableShortcut),
  }).description(configLocale.command.title),
  Schema.object({
    cacheDir: Schema.path({ filters: ['directory'], allowCreate: true })
      .default('cache/memes')
      .description(configLocale.cache.cacheDir),
    keepCache: Schema.boolean()
      .default(false)
      .description(configLocale.cache.keepCache),
  }).description(configLocale.cache.title),
  Schema.object({
    requestConfig: Quester.createConfig('http://127.0.0.1:2233'),
  }),
]);
