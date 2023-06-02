import type { AxiosRequestConfig, AxiosResponse } from 'axios';

import FormData from 'form-data';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { Quester, h } from 'koishi';
import path from 'path';

import { Config } from './config';
import { logger } from './const';

// #region Request
export type ColorType =
  | string
  | [number, number, number]
  | [number, number, number, number];
export type FontStyle = 'normal' | 'italic' | 'oblique';
export type FontWeight =
  | 'ultralight'
  | 'light'
  | 'normal'
  | 'bold'
  | 'ultrabold'
  | 'heavy';

export interface MemeKeyWithProperties {
  meme_key: string;
  fill?: ColorType;
  style?: FontStyle;
  weight?: FontWeight;
  stroke_width?: number;
  stroke_fill?: ColorType | null;
}

export interface RenderMemeList {
  meme_list?: MemeKeyWithProperties[];
  order_direction?: 'row' | 'column';
  columns?: number;
  column_align?: 'left' | 'center' | 'right';
  item_padding?: [number, number];
  image_padding?: [number, number];
  bg_color?: ColorType;
  fontsize?: number;
  fontname?: string;
  fallback_fonts?: string[];
}

export interface RenderMemeData {
  images?: ArrayBuffer[];
  texts?: string[];
  args?: Record<string, any>;
}
// #endregion

// #region Response
export interface MemeArgs {
  name: string;
  type: string;
  description: string | null;
  default: any | null;
  enum: any[] | null;
}

export interface MemeParams {
  min_images: number;
  max_images: number;
  min_texts: number;
  max_texts: number;
  default_texts: string[];
  args: MemeArgs[];
}

export interface MemeInfo {
  key: string;
  keywords: string[];
  patterns: string[];
  params: MemeParams;
}

export interface ReturnFile {
  mime: string;
  data: ArrayBuffer;
}
// #endregion

// TODO errors.ts
export function getErrorType(errorCode?: number): string {
  const errorTypes = {
    531: 'no-such-meme',
    532: 'text-over-length',
    533: 'open-image-failed',
    534: 'parser-exit',
    541: 'image-number-mismatch',
    542: 'text-number-mismatch',
    543: 'text-or-name-not-enough',
    551: 'arg-parser-exit',
    552: 'arg-model-mismatch',
  };

  if (errorCode) {
    if (errorCode in errorTypes)
      return errorTypes[errorCode as keyof typeof errorTypes];

    if (errorCode >= 550 && errorCode < 560) return 'arg-mismatch';
    if (errorCode >= 540 && errorCode < 550) return 'param-mismatch';
  }

  return 'unknown-error';
}

export const errArgs: Record<string, (meme: MemeInfo) => any[]> = {
  'image-number-mismatch': (meme) => [meme.params.min_images],
  'text-number-mismatch': (meme) => [meme.params.min_texts],
};

export function getRetFileByResp(resp: AxiosResponse<ArrayBuffer>): ReturnFile {
  return {
    mime: resp.headers['content-type'] ?? '',
    data: resp.data,
  };
}

export class MemeSource {
  private listPicCachePath;

  protected memes: Record<string, MemeInfo> = {};

  constructor(protected config: Config, protected http: Quester) {
    this.listPicCachePath = path.join(this.config.cacheDir, 'list.jpg');
  }

  async init() {
    await this.ensurePath();
    await this.initMemeList();
  }

  async ensurePath() {
    if (!existsSync(this.config.cacheDir))
      await mkdir(this.config.cacheDir, { recursive: true });
  }

  async initMemeList() {
    if (existsSync(this.listPicCachePath)) await rm(this.listPicCachePath);

    const keys = await this.getKeys();
    const tasks = keys.map(async (key) => {
      this.memes[key] = await this.getInfo(key);
    });
    await Promise.all(tasks);

    await this.renderList();
  }

  getMemes(): Record<string, MemeInfo> {
    return { ...this.memes };
  }

  getMemeByKeyword(word: string): MemeInfo | undefined {
    if (word in this.memes) return this.memes[word];

    for (const meme of Object.values(this.memes)) {
      if (meme.keywords.includes(word)) return meme;
    }

    return undefined;
  }

  request<T = any, D = any>(
    config: AxiosRequestConfig<D> = {}
  ): Promise<AxiosResponse<T, D>> {
    return this.http.axios({ ...config, baseURL: this.config.baseUrl });
  }

  async renderList(): Promise<ReturnFile> {
    if (existsSync(this.listPicCachePath))
      return {
        mime: 'image/jpeg',
        data: await readFile(this.listPicCachePath),
      };

    const resp = getRetFileByResp(
      await this.request({
        method: 'POST',
        url: '/memes/render_list',
        responseType: 'arraybuffer',
      })
    );

    await this.ensurePath();
    await writeFile(this.listPicCachePath, Buffer.from(resp.data));

    return resp;
  }

  async getKeys(): Promise<string[]> {
    return (
      await this.request({
        method: 'GET',
        url: '/memes/keys',
      })
    ).data;
  }

  async getInfo(key: string): Promise<MemeInfo> {
    return (await this.request({ url: `/memes/${key}/info` })).data;
  }

  async renderPreview(key: string): Promise<ReturnFile> {
    return getRetFileByResp(
      await this.request({
        method: 'GET',
        url: `/memes/${key}/preview`,
        responseType: 'arraybuffer',
      })
    );
  }

  async parseArgs(key: string, args: string[]): Promise<Record<string, any>> {
    return (
      await this.request({
        method: 'POST',
        url: `/memes/${key}/parse_args`,
        data: args,
      })
    ).data;
  }

  async renderMeme(key: string, data: RenderMemeData): Promise<ReturnFile> {
    const { images, texts, args } = data;

    const formData = new FormData();
    images?.forEach((image) => formData.append('images', new Blob([image])));
    texts?.forEach((text) => formData.append('texts', text));
    if (args) formData.append('args', JSON.stringify(args));

    return getRetFileByResp(
      await this.request({
        method: 'POST',
        url: `/memes/${key}`,
        data: formData,
        headers: formData.getHeaders(),
        responseType: 'arraybuffer',
      })
    );
  }

  static extractErrorType(e: unknown): string {
    const resp = Quester.isAxiosError(e) ? e.response : null;
    const status = resp?.status;
    return getErrorType(status);
  }

  handleError(e: unknown, name?: string): h {
    const type = MemeSource.extractErrorType(e);

    if (type === 'unknown-error')
      logger.error(e instanceof Error ? e.stack || e.message : `${e}`);

    const meme = name ? this.getMemes()[name] : undefined;
    const arg = meme && type in errArgs ? errArgs[type](meme) : [name];

    return h.i18n(`memes-api.errors.${type}`, arg);
  }

  async getHelpText(name: string): Promise<string | undefined> {
    const parseHelp = (txt: string): string => {
      const lines = txt.split('\n');
      const helpIndex = lines.findIndex((line) =>
        line.trimStart().startsWith('-h')
      );
      return (
        lines
          .slice(helpIndex + 1, lines.length - 1)
          // .map((t) => t.trim())
          .join('\n')
      );
    };

    try {
      await this.parseArgs(name, ['-h']);
    } catch (e) {
      if (
        Quester.isAxiosError(e) &&
        MemeSource.extractErrorType(e) === 'arg-parser-exit'
      ) {
        const data: string | null = (e.response?.data as any)?.detail;
        if (data) return parseHelp(data);
      }
    }
    return undefined;
  }
}
