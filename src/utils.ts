import { Context } from 'koishi';

export function getI18N(ctx: Context, key: string, args: object = []): string {
  return ctx.i18n
    .render(ctx.root.config.i18n?.locales ?? [], [key], args)
    .map((e) => e.attrs.content as string)
    .join('');
}
