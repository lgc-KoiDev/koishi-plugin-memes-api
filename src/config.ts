import { Schema } from 'koishi';

export interface Config {
  baseUrl: string;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    baseUrl: Schema.string()
      .default('http://127.0.0.1:2233')
      .description('`meme-generator` 的 API URL。'),
  }).description('基本配置'),
]);
