import { Context, Session, escapeRegExp, h } from 'koishi';

import { Config } from './config';
import { logger } from './const';
import { MemeSource, returnFileToElem } from './data-source';
import { MemeError, formatError } from './error';
import { extractPlaintext, formatRange, splitArg } from './utils';

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
      const err = e instanceof MemeError ? e : new MemeError(e);
      logger.error(err);
      return err.format();
    }
  };
}

export async function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh', require('./locales/zh.yml'));

  const http = ctx.http.extend(config.requestConfig);
  const source = new MemeSource(config, http);
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

  const generateMeme = wrapError(
    async (
      session: Session,
      name: string,
      prefix: string,
      matched?: string[]
    ) => {
      if (!session.elements) return undefined;

      const meme = source.getMemeByKeyword(name);
      if (!meme) return formatError('no-such-meme', name);
      const { key, params } = meme;

      // #region parse args
      const imageUrls: string[] = [];
      const texts: string[] = [];
      const args: Record<string, string> = {};

      if (matched) {
        texts.push(...matched);
      } else {
        const splitted = splitArg(
          extractPlaintext(session.elements).replace(prefix, '')
        );

        const parsedParams = await source.parseArgs(key, splitted);
        texts.push(...parsedParams.texts);
        delete parsedParams.texts;

        Object.assign(args, parsedParams);
      }

      if (session.quote?.elements) {
        imageUrls.push(
          ...session.quote.elements.map((x) => x.attrs.url as string)
        );
      }
      for (const ele of session.elements) {
        if (ele.type === 'image') imageUrls.push(ele.attrs.url as string);
        if (ele.type === 'at') {
        }
      }

      const senderAvatar = session.author?.avatar;
      if (senderAvatar) {
        if (
          (meme.params.min_images === 2 && imageUrls.length === 1) ||
          !imageUrls.length
        )
          imageUrls.unshift(senderAvatar);
      }

      // #endregion

      // #region validate args
      if (!texts.length) texts.push(...params.default_texts);

      if (
        imageUrls.length < params.min_images ||
        imageUrls.length > params.max_images
      )
        return formatError('image-number-mismatch', name, params);

      if (texts.length < params.min_texts || texts.length > params.max_texts)
        return formatError('text-number-mismatch', name, params);
      // #endregion

      // #region generate images
      const images = (
        await Promise.all(
          imageUrls.map((url) =>
            ctx.http.axios({ url, responseType: 'arraybuffer' })
          )
        )
      ).map((x) => x.data);

      let img;
      try {
        img = await source.renderMeme(key, { images, texts, args });
      } catch (e) {
        // 这个时候出错可能需要给格式化函数传参，单独 catch 一下
        if (!(e instanceof MemeError)) throw e;
        logger.error(e);
        return e.format(name, params);
      }
      // #endregion

      return returnFileToElem(img);
    }
  );

  ctx
    .command('meme.generate')
    .alias('memes.generate <name:string>')
    .action(({ session }, name) =>
      session && name
        ? generateMeme(
            session,
            name,
            session.content.slice(
              0,
              session.content.indexOf(name) + name.length
            )
          )
        : undefined
    );

  ctx.middleware(async (session, next) => {
    const { prefix } = ctx.root.config ?? '';
    const prefixes = prefix instanceof Array ? prefix : [prefix as string];

    const content = session.content.trim();

    for (const meme of Object.values(source.getMemes())) {
      const { key, keywords, patterns } = meme;

      for (const pfx of prefixes) {
        for (const keyword of keywords) {
          const s = `${pfx}${keyword}`;
          if (content.startsWith(s)) return generateMeme(session, key, s);
        }
      }

      const prefixRegex = prefixes.map(escapeRegExp).join('|');
      for (const pattern of patterns) {
        const match = content.match(
          new RegExp(`(${prefixRegex})${pattern}`, 'i')
        );
        if (match) {
          return generateMeme(session, key, '', match.slice(2));
        }
      }
    }

    return next();
  });

  logger.info(
    `Plugin setup successfully, ` +
      `loaded ${Object.values(source.getMemes()).length} memes.`
  );
}
