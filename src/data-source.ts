import type { AxiosRequestConfig, AxiosResponse } from 'axios';

import FormData from 'form-data';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { Quester, h } from 'koishi';
import path from 'path';

import { Config } from './config';
import { MemeError } from './error';

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
  data: Buffer;
}

export interface ReturnError {
  detail?: string;
}
// #endregion

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
  images?: ReturnFile[];
  texts?: string[];
  args?: Record<string, any>;
}
// #endregion

export function getRetFileByResp(resp: AxiosResponse<Buffer>): ReturnFile {
  return {
    mime: resp.headers['content-type'] ?? '',
    data: resp.data,
  };
}

export class MemeSource {
  protected memes: Record<string, MemeInfo> = {};

  protected cachedPreviewPath: Record<string, string> = {};

  constructor(protected config: Config, protected http: Quester) {}

  async init() {
    if (!this.config.keepCache && existsSync(this.config.cacheDir))
      rm(this.config.cacheDir, { recursive: true, force: true });

    await this.ensurePath();
    await this.initMemeList();
  }

  async ensurePath() {
    if (!existsSync(this.config.cacheDir))
      await mkdir(this.config.cacheDir, { recursive: true });
  }

  async initMemeList() {
    const keys = await this.getKeys();
    const tasks = keys.map(async (key) => {
      this.memes[key] = await this.getInfo(key);
    });
    await Promise.all(tasks);

    await this.renderList();
  }

  async cachePreview(key: string, file: ReturnFile): Promise<string> {
    await this.ensurePath();

    const cachePath = path.join(
      this.config.cacheDir,
      `preview_${key}.${file.mime.split('/')[1]}`
    );
    await writeFile(cachePath, Buffer.from(file.data));

    return cachePath;
  }

  async getCachedPreview(key: string): Promise<ReturnFile | undefined> {
    if (key in this.cachedPreviewPath) {
      const cachePath = this.cachedPreviewPath[key];
      if (existsSync(cachePath))
        return {
          mime: `image/${path.extname(cachePath)}`,
          data: await readFile(cachePath),
        };
    }
    return undefined;
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
    try {
      return this.http.axios({ ...config });
    } catch (e) {
      const err = new MemeError(e);
      throw err;
    }
  }

  async renderList(): Promise<ReturnFile> {
    const cache = await this.getCachedPreview('list');
    if (cache) return cache;

    const resp = getRetFileByResp(
      await this.request({
        method: 'POST',
        url: '/memes/render_list',
        responseType: 'arraybuffer',
      })
    );

    await this.cachePreview('list', resp);
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
    const cache = await this.getCachedPreview(key);
    if (cache) return cache;

    const resp = getRetFileByResp(
      await this.request({
        method: 'GET',
        url: `/memes/${key}/preview`,
        responseType: 'arraybuffer',
      })
    );

    await this.cachePreview(key, resp);
    return resp;
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

  // TODO cache rendered meme
  async renderMeme(key: string, data: RenderMemeData): Promise<ReturnFile> {
    const { images, texts, args } = data;

    const formData = new FormData();
    images?.forEach((image, i) =>
      formData.append('images', image.data, {
        filename: `image${i}.${image.mime.slice(image.mime.indexOf('/') + 1)}`,
      })
    );
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

  async getHelpText(name: string): Promise<string | undefined> {
    const parseHelp = (txt: string): string => {
      const lines = txt.split('\n');
      const helpIndex = lines.findIndex((line) => line === 'options:') + 1;
      return (
        lines
          .slice(helpIndex + 1, lines.length - 1)
          .filter((t) => !t.trimStart().startsWith('-h'))
          // .map((t) => t.trim())
          .join('\n')
      );
    };

    try {
      await this.parseArgs(name, ['-h']);
    } catch (e) {
      const err = e instanceof MemeError ? e : new MemeError(e);
      if (err.type === 'arg-parser-exit') {
        const data = (err.response?.data as ReturnError)?.detail;
        if (data) return parseHelp(data);
      }
    }
    return undefined;
  }
}

export function returnFileToElem({ data, mime }: ReturnFile) {
  return h.image(data, mime);
}
