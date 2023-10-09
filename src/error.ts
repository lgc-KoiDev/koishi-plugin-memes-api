import { Quester, h } from 'koishi';

import type { AxiosResponse } from 'axios';

import type { MemeParams } from './data-source';
import { formatRange } from './utils';

export const requestErrorTypes = [
  'no-such-meme',
  'text-over-length',
  'open-image-failed',
  'parser-exit',
  'image-number-mismatch',
  'text-number-mismatch',
  'text-or-name-not-enough',
  'arg-parser-exit',
  'arg-model-mismatch',
  'arg-mismatch',
  'param-mismatch',
  'unknown-error',
  'unexpected-error',
] as const;
export const otherErrorTypes = [
  'text-or-name-not-enough',
  'platform-not-supported',
  'download-avatar-failed',
  'no-such-index',
] as const;

export type RequestErrorTypes = (typeof requestErrorTypes)[number];
export type OtherErrorTypes = (typeof otherErrorTypes)[number];
export type ErrorTypes = RequestErrorTypes | OtherErrorTypes;

export const paramErrorTypes: readonly ErrorTypes[] = [
  'image-number-mismatch',
  'text-number-mismatch',
  'text-or-name-not-enough',
  'arg-parser-exit',
  'arg-model-mismatch',
  'arg-mismatch',
  'param-mismatch',
] as const;

export const errorCodeMap: Record<number, RequestErrorTypes> = {
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

export function getErrorType(errorCode?: number): RequestErrorTypes {
  if (!errorCode) return 'unexpected-error';
  if (errorCode in errorCodeMap) return errorCodeMap[errorCode];
  if (errorCode >= 550 && errorCode < 560) return 'arg-mismatch';
  if (errorCode >= 540 && errorCode < 550) return 'param-mismatch';
  return 'unknown-error';
}

export function formatError(
  type: ErrorTypes,
  name?: string,
  params?: MemeParams
): h {
  const args: any[] = [];

  if (name && (type === 'no-such-meme' || type === 'no-such-index')) {
    args.push(name);
  } else if (params) {
    if (type === 'image-number-mismatch') {
      args.push(formatRange(params.min_images, params.max_images));
    } else if (type === 'text-number-mismatch') {
      args.push(formatRange(params.min_texts, params.max_texts));
    }
  }

  return h.i18n(`memes-api.errors.${type}`, args);
}

export class MemeError extends Error {
  constructor(private error: unknown) {
    super();
    this.name = 'MemeError';
    if (error instanceof MemeError) this.error = error.error;
  }

  get message(): string {
    return this.code
      ? `[${this.code}] ${this.type}`
      : `${getErrorType()} (${this.error})`;
  }

  get code(): number | undefined {
    if (Quester.isAxiosError(this.error)) {
      return this.error.response?.status ?? undefined;
    }
    return undefined;
  }

  get response(): AxiosResponse | undefined {
    if (Quester.isAxiosError(this.error)) {
      return this.error.response;
    }
    return undefined;
  }

  get type(): RequestErrorTypes {
    return getErrorType(this.code);
  }

  format(name?: string, params?: MemeParams): h {
    return formatError(this.type, name, params);
  }
}
