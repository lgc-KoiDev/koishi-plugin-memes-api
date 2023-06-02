import { Schema } from 'koishi';

export interface Config {
  baseUrl: string;
  cacheDir: string;
  keepCache: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    baseUrl: Schema.string()
      .default('http://127.0.0.1:2233')
      .description('`meme-generator` 的 API 地址。'),
    cacheDir: Schema.path({
      filters: ['directory'],
      allowCreate: true,
    })
      .default('cache/memes')
      .description('插件图片缓存存放的目录。'),
    keepCache: Schema.boolean()
      .default(false)
      .description(
        '插件会在每次被启用时清空已缓存图片，启用该配置则插件不会自动清理缓存。'
      ),
  }).description('基本配置'),
]);
