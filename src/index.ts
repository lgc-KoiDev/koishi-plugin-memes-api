import { Context, h } from 'koishi';

import { Config } from './config';
import { logger } from './const';
import { MemeSource, returnFileToElem } from './data-source';
import { MemeError, formatError } from './error';

export { name } from './const';
export { Config };

export const usage = `
Tip:<br />
如果插件没有注册 \`meme\` 指令，请检查你的请求设置是否正确，以及 \`memes-generator\` 是否正常部署。<br />
相关错误信息可以在日志中查看。

如果想要刷新表情列表，请重载本插件。
`.trim();

function wrapError<TA extends any[], TR>(
  action: (...args: TA) => Promise<TR>
): (...args: TA) => Promise<TR | h> {
  return async (...args) => {
    try {
      return await action(...args);
    } catch (e) {
      const err = new MemeError(e);
      logger.error(err);
      return err.format();
    }
  };
}

export async function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh', require('./locales/zh.yml'));

  const source = new MemeSource(config, ctx.http.extend(config.requestConfig));
  try {
    await source.init();
  } catch (e) {
    logger.error(`MemeSource init failed!`);
    logger.error(e);
    return;
  }

  ctx.command('meme').alias('memes');

  ctx
    .command('meme.list')
    .alias('memes.list')
    .alias('表情包制作')
    .alias('头像表情包')
    .alias('文字表情包')
    .action(
      wrapError(async () => [
        h.i18n('memes-api.list.tip'),
        returnFileToElem(await source.renderList()),
      ])
    );

  ctx
    .command('meme.info <name:string>')
    .alias('memes.info')
    .alias('表情详情')
    .alias('表情帮助')
    .alias('表情示例')
    .action(
      wrapError(async (_, name) => {
        const meme = source.getMemeByKeyword(name);
        if (!meme) return formatError('no-such-meme');

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
          if (help) {
            msg.push(h.i18n('memes-api.info.args-info', [help]));
            msg.push('\n');
          }
        }

        msg.push(
          h.i18n('memes-api.info.preview', [
            returnFileToElem(await source.renderPreview(meme.key)),
          ])
        );

        return msg;
      })
    );

  // TODO create hidden sub cmd?
  const generateCmd = ctx
    .command('meme.generate')
    .alias('memes.generate <name:string> [...kwargs]')
    .action(
      wrapError(async ({ session, options }, name, ...kwargs) => {
        if (!session?.elements) return undefined;

        const meme = source.getMemeByKeyword(name);
        if (!meme) return h.i18n('memes-api.errors.no-such-meme', [name]);
        const { key } = meme;

        // TODO parse cmd args; get user pics (reply, avatar, in msg)
        return returnFileToElem(
          await source.renderMeme(key, { texts: kwargs, args: options })
        );
      })
    );

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
