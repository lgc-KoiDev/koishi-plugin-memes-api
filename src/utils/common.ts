import type { FileResponse } from '@cordisjs/plugin-http'
import { h } from 'koishi'

export function checkInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

export function constructBlobFromFileResp(resp: FileResponse): Blob {
  return new Blob([resp.data], { type: resp.type })
}

export function formatRange(min: number, max: number): string {
  return min === max ? min.toString() : `${min} ~ ${max}`
}

export function formatKeywords(keywords: string[]): string {
  return keywords.map((v) => `“${v}”`).join('、')
}

export function listJoin<T, V>(list: T[], splitter: V): (T | V)[] {
  const newList: (T | V)[] = []
  for (const item of list) {
    newList.push(item)
    newList.push(splitter)
  }
  newList.pop()
  return newList
}

export function listFlatJoin<T, V>(list: T[][], splitter: V[]): (T | V)[] {
  const newList: (T | V)[] = []
  for (let i = 0; i < list.length - 1; i += 1) {
    newList.push(...list[i])
    newList.push(...splitter)
  }
  newList.push(...list[list.length - 1])
  return newList
}

export function transformRegex(pythonRegex: string): string {
  return pythonRegex.replace(/\(\?P<(?<n>\w+?)>/g, '(?<$<n>>') // named groups
}

export function extractContentPlaintext(content: string) {
  let el: h[]
  try {
    el = h.parse(content)
  } catch (e) {
    return content
  }

  const textBuffer: string[] = []
  const visit = (e: h) => {
    if (e.children.length) {
      for (const child of e.children) visit(child)
    }
    if (e.type === 'text') {
      const t = e.attrs.content
      if (t) textBuffer.push(t)
    }
  }
  for (const child of el) visit(child)
  return textBuffer.join('')
}

export function replaceBracketVar(v: string, res: RegExpExecArray): string {
  // double bracket should escape it
  return v.replace(/(?<l>[^\{])?\{(?<v>.+?)\}(?<r>[^\}])?/g, (...args) => {
    type Groups = Record<'l' | 'r', string | undefined> & Record<'v', string>
    const { l, v, r } = args[args.length - 1] as Groups
    const index = parseInt(v)
    let resolved: string
    if (!isNaN(index)) {
      resolved = res[index] ?? v
    } else if (res.groups && v in res.groups) {
      resolved = res.groups[v]
    } else {
      resolved = v
    }
    return `${l ?? ''}${extractContentPlaintext(resolved)}${r ?? ''}`
  })
}

export function isVersionMeets(version: string, minVersion: number[]): boolean {
  const parts = version.split('.').map((v) => parseInt(v, 10))
  for (let i = 0; i < minVersion.length; i++) {
    const part = isNaN(parts[i]) ? 0 : (parts[i] ?? 0)
    const minPart = minVersion[i] ?? 0
    if (part < minPart) return false
  }
  return true
}
