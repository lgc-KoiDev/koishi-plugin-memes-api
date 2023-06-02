import { Context, h } from 'koishi';

import { Config } from './config';
import { MemeSource, ReturnFile } from './data-source';

export { name } from './const';
export { Config };

function returnFileToElem({ data, mime }: ReturnFile) {
  return h.image(data, mime);
}

export async function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh', require('./locales/zh.yml'));

  const source = new MemeSource(config, ctx.http);
  await source.init();

  ctx.command('meme').alias('memes');

  ctx
    .command('meme.list')
    .alias('memes.list')
    .alias('表情包制作')
    .alias('头像表情包')
    .alias('文字表情包')
    .action(async () => [
      h.i18n('memes-api.list.tip'),
      returnFileToElem(await source.renderList()),
    ]);

  ctx
    .command('meme.info <name:string>')
    .alias('memes.info')
    .alias('表情详情')
    .alias('表情帮助')
    .alias('表情示例')
    .action(async (_, name) => {
      const meme = source.getMemeByKeyword(name);
      if (!meme) return h.i18n('memes-api.errors.no-such-meme', [name]);

      const {
        key,
        keywords,
        patterns,
        params: {
          max_images,
          max_texts,
          min_images,
          min_texts,
          default_texts,
          args,
        },
      } = meme;
      const formatRange = (min: number, max: number): string =>
        min === max ? min.toString() : `${min} ~ ${max}`;

      const msg: any[] = [];

      msg.push(h.i18n('memes-api.info.name', [key]));
      msg.push('\n');
      msg.push(h.i18n('memes-api.info.keywords', [keywords.join(', ')]));
      msg.push('\n');
      if (patterns.length) {
        msg.push(h.i18n('memes-api.info.patterns', [patterns.join(', ')]));
        msg.push('\n');
      }
      msg.push(
        h.i18n('memes-api.info.image-num', [
          formatRange(min_images, max_images),
        ])
      );
      msg.push('\n');
      msg.push(
        h.i18n('memes-api.info.text-num', [formatRange(min_texts, max_texts)])
      );
      msg.push('\n');
      if (default_texts.length) {
        msg.push(
          h.i18n('memes-api.info.default-texts', [
            default_texts.map((x) => `"${x}"`).join(', '),
          ])
        );
        msg.push('\n');
      }
      if (args.length) {
        const help = await source.getHelpText(meme.key);
        msg.push(h.i18n('memes-api.info.args-info'));
        msg.push('\n');
        msg.push(help);
        msg.push('\n');
      }
      msg.push(h.i18n('memes-api.info.preview'));
      msg.push('\n');
      msg.push(returnFileToElem(await source.renderPreview(meme.key)));

      return msg;
    });

  // TODO create hidden sub cmd?
  const generateCmd = ctx
    .command('meme.generate')
    .alias('memes.generate <name:string> [...kwargs]')
    .action(async ({ session, options }, name, ...kwargs) => {
      if (!session?.elements) return undefined;

      const meme = source.getMemeByKeyword(name);
      if (!meme) return h.i18n('memes-api.errors.no-such-meme', [name]);
      const { key } = meme;

      // TODO parse cmd args; get user pics (reply, avatar, in msg)
      let file;
      try {
        file = await source.renderMeme(key, { texts: kwargs, args: options });
      } catch (e) {
        return source.handleError(e, name);
      }
      return returnFileToElem(file);
    });

  for (const meme of Object.values(source.getMemes())) {
    meme.keywords.forEach((x) => {
      generateCmd.shortcut(x, { fuzzy: true, args: [meme.key] });
    });
    meme.patterns.forEach((x) => {
      // TODO regex args
      generateCmd.shortcut(new RegExp(x), { fuzzy: true, args: [meme.key] });
    });
  }
}
