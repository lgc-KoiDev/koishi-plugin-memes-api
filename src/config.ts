import { Quester, Schema } from 'koishi';

export interface Config {
  cacheDir: string;
  keepCache: boolean;
  requestConfig: Quester.Config;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    cacheDir: Schema.path({
      filters: ['directory'],
      allowCreate: true,
    })
      .default('cache/memes')
      .description('插件图片缓存存放的目录。'),
    keepCache: Schema.boolean()
      .default(false)
      .description(
        '插件会在每次加载时清空已缓存图片，启用该配置则插件不会自动清理缓存。'
      ),
  }).description('基础设置'),
  Schema.object({
    requestConfig: Quester.createConfig('http://127.0.0.1:2233'),
  }),
]);
