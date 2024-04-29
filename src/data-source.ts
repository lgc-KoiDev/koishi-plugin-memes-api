import { existsSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'

import { HTTP } from '@cordisjs/plugin-http'
import { h } from 'koishi'

import { IConfig } from './config'
import { logger } from './const'
import { MemeError } from './error'

// #region Response
export interface MemeArgs {
  name: string
  type: string
  description: string | null
  default: any | null
  enum: any[] | null
}

export interface MemeParams {
  min_images: number
  max_images: number
  min_texts: number
  max_texts: number
  default_texts: string[]
  args: MemeArgs[]
}

export interface MemeInfo {
  key: string
  keywords: string[]
  patterns: string[]
  params: MemeParams
}

export interface MemeInfoWithName extends MemeInfo {
  name: string
}

export interface ReturnFile {
  mime: string
  data: ArrayBuffer
}

export interface ReturnError {
  detail?: string
}
// #endregion

// #region Request
export type ColorType =
  | string
  | [number, number, number]
  | [number, number, number, number]
export type FontStyle = 'normal' | 'italic' | 'oblique'
export type FontWeight =
  | 'ultralight'
  | 'light'
  | 'normal'
  | 'bold'
  | 'ultrabold'
  | 'heavy'
export type UserInfoGender = 'male' | 'female' | 'unknown'

export interface MemeKeyWithProperties {
  meme_key: string
  fill?: ColorType
  style?: FontStyle
  weight?: FontWeight
  stroke_width?: number
  stroke_fill?: ColorType | null
}

export interface RenderMemeList {
  meme_list?: MemeKeyWithProperties[]
  order_direction?: 'row' | 'column'
  columns?: number
  column_align?: 'left' | 'center' | 'right'
  item_padding?: [number, number]
  image_padding?: [number, number]
  bg_color?: ColorType
  fontsize?: number
  fontname?: string
  fallback_fonts?: string[]
}

export interface MemeUserInfo {
  name: string
  gender: UserInfoGender
}

export interface RenderMemeData {
  images?: ReturnFile[]
  texts?: string[]
  args?: { user_infos: MemeUserInfo[] } & Record<string, any>
}
// #endregion

export function getRetFileByResp(resp: HTTP.Response<ArrayBuffer>): ReturnFile {
  return {
    mime: resp.headers.get('content-type') ?? '',
    data: resp.data,
  }
}

export class MemeSource {
  protected inited = false

  private _memeList: MemeInfoWithName[] = []

  protected previewCacheJsonPath: string

  constructor(
    protected config: IConfig,
    protected http: HTTP,
  ) {
    this.previewCacheJsonPath = path.join(
      this.config.cacheDir,
      `preview_path.json`,
    )
  }

  get memes(): Record<string, MemeInfo> {
    return Object.fromEntries(this._memeList.map((meme) => [meme.key, meme]))
  }

  get keys(): string[] {
    return this._memeList.map((meme) => meme.key)
  }

  get memeList(): MemeInfoWithName[] {
    return [...this._memeList]
  }

  get count(): number {
    return this._memeList.length
  }

  async init() {
    this.inited = false

    if (this.inited) {
      this._memeList.length = 0
    }

    if (!this.config.keepCache && existsSync(this.config.cacheDir)) {
      rm(this.config.cacheDir, { recursive: true, force: true })
    }

    await this.ensurePath()
    await this.initMemeList()

    this.inited = true
  }

  async ensurePath() {
    if (!existsSync(this.config.cacheDir)) {
      await mkdir(this.config.cacheDir, { recursive: true })
    }
  }

  async checkInit() {
    if (!this.inited) throw new Error('MemeSource not inited')
  }

  protected async initMemeList() {
    const keys = await this.getKeys()

    const tasks = keys.map(async (key) => {
      this._memeList.push({ name: key, ...(await this.getInfo(key)) })
    })
    await Promise.all(tasks)
    this._memeList.sort((a, b) => a.name.localeCompare(b.name))

    this.renderList().catch(logger.error) // 故意没有 await 的
  }

  async readCachedPreviewPath(): Promise<Record<string, string>> {
    return existsSync(this.previewCacheJsonPath)
      ? JSON.parse(await readFile(this.previewCacheJsonPath, 'utf-8'))
      : {}
  }

  async writeCachedPreviewPath(key: string, cachePath: string) {
    await writeFile(
      this.previewCacheJsonPath,
      JSON.stringify({
        ...(await this.readCachedPreviewPath()),
        [key]: cachePath,
      }),
    )
  }

  async cachePreview(key: string, file: ReturnFile): Promise<string> {
    await this.ensurePath()

    const cachePath = path.join(
      this.config.cacheDir,
      `preview_${key}.${file.mime.split('/')[1]}`,
    )
    await writeFile(cachePath, Buffer.from(file.data))
    await this.writeCachedPreviewPath(key, cachePath)

    return cachePath
  }

  async getCachedPreview(key: string): Promise<ReturnFile | undefined> {
    const cachedPreviewPath = await this.readCachedPreviewPath()

    if (key in cachedPreviewPath) {
      const cachePath = cachedPreviewPath[key]
      if (existsSync(cachePath)) {
        const extName = path.extname(cachePath).slice(1)
        return {
          mime: `image/${extName}`,
          data: await readFile(cachePath),
        }
      }
    }

    return undefined
  }

  /**
   * @returns [meme, isIndex]
   */
  getMemeByKeywordOrIndex(word: string): [MemeInfo | undefined, boolean] {
    let memeInfo: MemeInfoWithName | undefined
    const isIndex = /^\d+$/.test(word)

    if (isIndex) {
      const index = parseInt(word, 10) - 1
      memeInfo = this._memeList[index]
    } else {
      for (const meme of this._memeList) {
        if (word === meme.key || meme.keywords.includes(word)) memeInfo = meme
      }
    }

    return [memeInfo, isIndex]
  }

  async request<K extends keyof HTTP.ResponseTypes>(
    url: string,
    config: HTTP.RequestConfig & { responseType: K },
  ): Promise<HTTP.Response<HTTP.ResponseTypes[K]>>

  async request(
    url: string,
    config?: HTTP.RequestConfig,
  ): Promise<HTTP.Response<string>>

  async request(url: string, config: any = {}): Promise<HTTP.Response> {
    // logger.debug(`Requesting \`${url}\` with config`, config);
    try {
      return await this.http(url, { responseType: 'text', ...config })
    } catch (e) {
      throw new MemeError(e)
    }
  }

  async renderList(): Promise<ReturnFile> {
    const cache = await this.getCachedPreview('list')
    if (cache) return cache

    const resp = getRetFileByResp(
      await this.request('/memes/render_list', {
        method: 'POST',
        responseType: 'arraybuffer',
        data: { meme_list: this.keys.map((key) => ({ meme_key: key })) },
      }),
    )

    await this.cachePreview('list', resp)
    return resp
  }

  async getKeys(): Promise<string[]> {
    return JSON.parse(
      (await this.request('/memes/keys', { method: 'GET' })).data,
    )
  }

  async getInfo(key: string): Promise<MemeInfo> {
    return JSON.parse((await this.request(`/memes/${key}/info`)).data)
  }

  async renderPreview(key: string): Promise<ReturnFile> {
    const cache = await this.getCachedPreview(key)
    if (cache) return cache

    const resp = getRetFileByResp(
      await this.request(`/memes/${key}/preview`, {
        method: 'GET',
        responseType: 'arraybuffer',
      }),
    )

    await this.cachePreview(key, resp)
    return resp
  }

  async parseArgs(key: string, args: string[]): Promise<Record<string, any>> {
    return JSON.parse(
      (
        await this.request(`/memes/${key}/parse_args`, {
          method: 'POST',
          data: args,
        })
      ).data,
    )
  }

  // TODO cache rendered meme
  async renderMeme(key: string, data: RenderMemeData): Promise<ReturnFile> {
    const { images, texts, args } = data

    const formData = new FormData()
    images?.forEach((image) =>
      formData.append(
        'images',
        new Blob([image.data], { type: image.mime }),
        // `image${i}.${image.mime.split('/')[1]}`
      ),
    )
    texts?.forEach((text) => formData.append('texts', text))
    if (args) formData.append('args', JSON.stringify(args))

    return getRetFileByResp(
      await this.request(`/memes/${key}/`, {
        method: 'POST',
        data: formData,
        responseType: 'arraybuffer',
      }),
    )
  }

  async getHelpText(name: string): Promise<string | undefined> {
    const parseHelp = (txt: string): string => {
      const lines = txt.split('\n')
      const helpIndex = lines.findIndex((line) => line === 'options:') + 1
      return (
        lines
          .slice(helpIndex + 1, lines.length - 1)
          .filter((t) => !t.trimStart().startsWith('-h'))
          // .map((t) => t.trim())
          .join('\n')
      )
    }

    try {
      await this.parseArgs(name, ['-h'])
    } catch (e) {
      if (!(e instanceof MemeError)) throw e
      if (e.type === 'arg-parser-exit') {
        const data = (e.response?.data as ReturnError)?.detail
        if (data) return parseHelp(data)
      }
    }
    return undefined
  }
}

export function returnFileToElem({ data, mime }: ReturnFile) {
  return h.image(data, mime)
}
