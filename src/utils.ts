import { Context, Session, h } from 'koishi';
import {} from '@koishijs/plugin-adapter-telegram';

export function extractPlaintext(elements: h[]): string {
  return elements
    .map((e) =>
      e.type === 'text'
        ? ((e.attrs.content ?? '') as string) // + extractPlaintext(e.children)
        : ' '
    )
    .join('');
}

export function getI18N(ctx: Context, key: string, args: object = []): string {
  return extractPlaintext(
    ctx.i18n.render(ctx.root.config.i18n?.locales ?? [], [key], args)
  );
}

export function formatRange(min: number, max: number): string {
  return min === max ? min.toString() : `${min} ~ ${max}`;
}

export function splitArg(text: string): string[] {
  const args: string[] = [];

  let buffer: string[] = [];
  let inQuote = false;
  let escapeNext = false;

  for (const char of text) {
    if (escapeNext) {
      buffer.push(char);
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inQuote = !inQuote;
      continue;
    }

    if (char === ' ' && !inQuote) {
      if (buffer.length) {
        args.push(buffer.join(''));
        buffer = [];
      }
      continue;
    }

    buffer.push(char);
  }

  if (buffer.length) args.push(buffer.join(''));

  return args.map((x) => x.trim()).filter((x) => x.length);
}

export async function getAvatarUrlFromID(session: Session, user: string): Promise<string> {
  const { platform } = session;
  switch (platform) {
    case 'onebot':
    case 'red':
      return `https://q1.qlogo.cn/g?b=qq&nk=${user}&s=640`;
    case 'telegram':
      return(await session.telegram.bot.getUser(user, session.guildId)).avatar;
    default:
      throw new TypeError(`Unsupported platform: ${platform}`);
  }
}
