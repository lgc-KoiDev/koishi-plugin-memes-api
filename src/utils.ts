import type { FileResponse } from '@cordisjs/plugin-http'

export function splitArgString(argString: string): string[] {
  const quotePairs = {
    '"': '"',
    "'": "'",
    '“': '”',
    '‘': '’',
  } as const

  const args: string[] = []
  let currentArg = ''
  let inQuotes: string | null = null

  for (let i = 0; i < argString.length; i += 1) {
    const char = argString[i]

    if (inQuotes) {
      if (char === inQuotes) {
        // 结束引号
        inQuotes = null
      } else {
        // 添加字符到当前参数
        currentArg += char
      }
      continue
    }

    if (char in quotePairs) {
      // 开始新的引号
      inQuotes = char
    } else if (char === ' ') {
      // 空格分隔参数
      if (currentArg) {
        args.push(currentArg)
        currentArg = ''
      }
      while (i + 1 < argString.length && argString[i + 1] === ' ') {
        i += 1
      }
    } else {
      // 普通字符
      currentArg += char
    }
  }

  if (currentArg) args.push(currentArg)
  if (inQuotes) throw new SyntaxError('Unmatched quotes in input string.')

  return args
}

export function checkInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

export function constructBlobFromFileResp(resp: FileResponse): Blob {
  return new Blob([resp.data], { type: resp.type })
}
