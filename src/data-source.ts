import type { AxiosRequestConfig, AxiosResponse } from 'axios';

import FormData from 'form-data';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { Quester, h } from 'koishi';
import path from 'path';

import { Config } from './config';
import { MemeError } from './error';
import { logger } from './const';

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

export interface MemeInfoWithName extends MemeInfo {
  name: string;
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
  protected inited = false;

  private _memeList: MemeInfoWithName[] = [];

  protected previewCacheJsonPath: string;

  constructor(protected config: Config, protected http: Quester) {
    this.previewCacheJsonPath = path.join(
      this.config.cacheDir,
      `preview_path.json`
    );
  }

  get memes(): Record<string, MemeInfo> {
    return Object.fromEntries(this._memeList.map((meme) => [meme.key, meme]));
  }

  get keys(): string[] {
    return this._memeList.map((meme) => meme.key);
  }

  get memeList(): MemeInfoWithName[] {
    return [...this._memeList];
  }

  get count(): number {
    return this._memeList.length;
  }

  async init() {
    this.inited = false;

    if (this.inited) {
      this._memeList.length = 0;
    }

    if (!this.config.keepCache && existsSync(this.config.cacheDir))
      rm(this.config.cacheDir, { recursive: true, force: true });

    await this.ensurePath();
    await this.initMemeList();

    this.inited = true;
  }

  async ensurePath() {
    if (!existsSync(this.config.cacheDir))
      await mkdir(this.config.cacheDir, { recursive: true });
  }

  async checkInit() {
    if (!this.inited) throw new Error('MemeSource not inited');
  }

  protected async initMemeList() {
    const keys = await this.getKeys();

    const tasks = keys.map(async (key) => {
      this._memeList.push({ name: key, ...(await this.getInfo(key)) });
    });
    await Promise.all(tasks);
    this._memeList.sort((a, b) => a.name.localeCompare(b.name));

    this.renderList().catch(logger.error); // 故意没有 await 的
  }

  async readCachedPreviewPath(): Promise<Record<string, string>> {
    return existsSync(this.previewCacheJsonPath)
      ? JSON.parse(await readFile(this.previewCacheJsonPath, 'utf-8'))
      : {};
  }

  async writeCachedPreviewPath(key: string, cachePath: string) {
    await writeFile(
      this.previewCacheJsonPath,
      JSON.stringify({
        ...(await this.readCachedPreviewPath()),
        [key]: cachePath,
      })
    );
  }

  async cachePreview(key: string, file: ReturnFile): Promise<string> {
    await this.ensurePath();

    const cachePath = path.join(
      this.config.cacheDir,
      `preview_${key}.${file.mime.split('/')[1]}`
    );
    await writeFile(cachePath, Buffer.from(file.data));
    await this.writeCachedPreviewPath(key, cachePath);

    return cachePath;
  }

  async getCachedPreview(key: string): Promise<ReturnFile | undefined> {
    const cachedPreviewPath = await this.readCachedPreviewPath();

    if (key in cachedPreviewPath) {
      const cachePath = cachedPreviewPath[key];
      if (existsSync(cachePath))
        return {
          mime: `image/${path.extname(cachePath)}`,
          data: await readFile(cachePath),
        };
    }

    return undefined;
  }

  getMemeByKeywordOrIndex(word: string, isIndex = false): MemeInfo | undefined {
    if (isIndex) {
      const index = parseInt(word, 10);
      return this._memeList[index];
    }

    for (const meme of this._memeList)
      if (word === meme.key || meme.keywords.includes(word)) return meme;
    return undefined;
  }

  async request<T = any, D = any>(
    config: AxiosRequestConfig<D> = {}
  ): Promise<AxiosResponse<T, D>> {
    try {
      return await this.http.axios({ ...config });
    } catch (e) {
      throw new MemeError(e);
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
        data: { meme_list: this.keys.map((key) => ({ meme_key: key })) },
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
        filename: `image${i}.${image.mime.split('/')[1]}`,
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
      if (!(e instanceof MemeError)) throw e;
      if (e.type === 'arg-parser-exit') {
        const data = (e.response?.data as ReturnError)?.detail;
        if (data) return parseHelp(data);
      }
    }
    return undefined;
  }
}

export function returnFileToElem({ data, mime }: ReturnFile) {
  return h.image(data, mime);
}
