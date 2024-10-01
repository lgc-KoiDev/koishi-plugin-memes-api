import type { FileResponse } from '@cordisjs/plugin-http'

export class ArgSyntaxError extends SyntaxError {
  constructor(
    public readonly type: ArgSyntaxError.Type,
    public readonly char: string,
    public readonly index: number,
  ) {
    const message = (() => {
      switch (type) {
        case ArgSyntaxError.Type.UnexpectedChar:
          return (
            `Unexpected char ${char} in input string at index ${index}, ` +
            `consider use backslash to escape`
          )
        case ArgSyntaxError.Type.UnterminatedQuote:
          return `Unterminated quote ${char} in input string at index ${index}`
      }
    })()
    super(message)
  }
}
export namespace ArgSyntaxError {
  export enum Type {
    UnexpectedChar,
    UnterminatedQuote,
  }

  export function getI18NKey(e: ArgSyntaxError): string {
    const kPfx = `memes-api.errors.syntax-error.`
    switch (e.type) {
      case ArgSyntaxError.Type.UnexpectedChar:
        return `${kPfx}unexpected-char`
      case ArgSyntaxError.Type.UnterminatedQuote:
        return `${kPfx}unterminated-quote`
    }
  }
}

const quotePairs: Record<string, string> = {
  '"': '"',
  "'": "'",
  '`': '`',
  '“': '”',
  '‘': '’',
}
const quotes = [...new Set(Object.entries(quotePairs).flat())]

export function splitArgString(argString: string): string[] {
  const args: string[] = []
  const currentArgChars: string[] = []
  let inQuote: string | null = null
  let outQuote: string | null = null
  let escapeNext = false
  let lastInQuoteIndex = -1

  for (let i = 0; i < argString.length; i += 1) {
    const char = argString[i]

    if (escapeNext) {
      currentArgChars.push(char)
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (inQuote) {
      if (char === outQuote) {
        // 结束引号
        inQuote = null
        outQuote = null
      } else if (char === inQuote) {
        throw new ArgSyntaxError(ArgSyntaxError.Type.UnexpectedChar, char, i)
      } else {
        // 添加字符到当前参数
        currentArgChars.push(char)
      }
      continue
    }

    if (char in quotePairs) {
      // 开始新的引号
      inQuote = char
      outQuote = quotePairs[char]
      lastInQuoteIndex = i
    } else if (/^\s$/.test(char)) {
      // 空格分隔参数
      if (currentArgChars.length) {
        args.push(currentArgChars.join(''))
        currentArgChars.length = 0
      }
    } else {
      // 普通字符
      currentArgChars.push(char)
    }
  }

  if (currentArgChars.length) args.push(currentArgChars.join(''))
  if (inQuote) {
    throw new ArgSyntaxError(
      ArgSyntaxError.Type.UnterminatedQuote,
      inQuote,
      lastInQuoteIndex,
    )
  }

  return args
}

export function escapeArgs(args: string[], extraShouldQuote?: string[]): string {
  return args
    .map((arg) => {
      const needQuote = (() => {
        for (const q of quotes) if (arg.includes(q)) return true
        if (extraShouldQuote) {
          for (const q of extraShouldQuote) if (arg.includes(q)) return true
        }
        return false
      })()
      if (!needQuote) return arg
      for (const q of quotes) arg.replaceAll(q, `\\${q}`)
      return `"${arg}"`
    })
    .join(' ')
}

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
