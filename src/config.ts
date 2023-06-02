import { Schema } from 'koishi';

export interface Config {
  baseUrl: string;
  cacheDir: string;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    baseUrl: Schema.string()
      .default('http://127.0.0.1:2233')
      .description('`meme-generator` 的 API URL。'),
    cacheDir: Schema.path({
      filters: ['directory'],
      allowCreate: true,
    })
      .default('cache/memes')
      .description('插件图片缓存存放的目录。'),
  }).description('基本配置'),
]);
