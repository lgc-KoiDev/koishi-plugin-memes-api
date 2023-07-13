export interface CommandLocale {
  description: string;
}

export interface MemeCommandsLocale {
  meme: CommandLocale;
  'meme.list': CommandLocale;
  'meme.info': CommandLocale;
  'meme.generate': CommandLocale;
}

export interface MemeErrorLocale {
  'no-such-meme': string;
  'text-over-length': string;
  'open-image-failed': string;
  'parser-exit': string;
  'image-number-mismatch': string;
  'text-number-mismatch': string;
  'arg-parser-exit': string;
  'arg-model-mismatch': string;
  'arg-mismatch': string;
  'param-mismatch': string;
  'unknown-error': string;
  'unexpected-error': string;
  'text-or-name-not-enough': string;
  'download-avatar-failed': string;
}

export interface MemeListLocale {
  tip: string;
  'tip-no-shortcut': string;
}

export interface MemeInfoLocale {
  name: string;
  keywords: string;
  patterns: string;
  'image-num': string;
  'text-num': string;
  'default-texts': string;
  'args-info': string;
  preview: string;
}

export interface ConfigLocaleBase {
  title: string;
}

export interface MemeCommandConfigLocale extends ConfigLocaleBase {
  enableShortcut: string;
}

export interface MemeCacheConfigLocale extends ConfigLocaleBase {
  cacheDir: string;
  keepCache: string;
}

export interface MemeConfigLocale {
  command: MemeCommandConfigLocale;
  cache: MemeCacheConfigLocale;
}

export interface MemeMainLocale {
  errors: MemeErrorLocale;
  list: MemeListLocale;
  info: MemeInfoLocale;
  config: MemeConfigLocale;
}

export interface MemeLocale {
  commands: MemeCommandsLocale;
  'memes-api': MemeMainLocale;
}

export const locale: MemeLocale = require('./locales/zh-CN');

export const mainLocale: MemeMainLocale = locale['memes-api'];

export const configLocale: MemeConfigLocale = mainLocale.config;
