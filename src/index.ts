import { Context, Session, escapeRegExp, h } from 'koishi';
// import { writeFile } from 'fs/promises';

import { Config } from './config';
import { logger } from './const';
import { MemeSource, getRetFileByResp, returnFileToElem } from './data-source';
import { MemeError, formatError } from './error';
import { extractPlaintext, formatRange, splitArg } from './utils';

export { name } from './const';
export { Config };

export const usage = `
Tip:  
如果插件没有注册 \`meme\` 指令，请检查你的请求设置是否正确，以及 \`memes-generator\` 是否正常部署。  
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

  const cmdList = ctx
    .command('meme.list')
    .alias('memes.list')
    .action(
      wrapError(async () => [
        h.i18n(
          config.enableShortcut
            ? 'memes-api.list.tip'
            : 'memes-api.list.tip-no-shortcut'
        ),
        returnFileToElem(await source.renderList()),
      ])
    );

  const cmdInfo = ctx
    .command('meme.info <name:string>')
    .alias('memes.info')
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

      let selfLen = 0;

      if (matched) {
        texts.push(...matched);
      } else {
        const splitted = splitArg(
          extractPlaintext(session.elements).replace(prefix, '')
        );
        const realArgs = splitted.filter((x) => x !== '自己');
        selfLen = realArgs.length;

        const parsedParams = await source.parseArgs(key, realArgs);
        texts.push(...parsedParams.texts);
        delete parsedParams.texts;

        Object.assign(args, parsedParams);
      }

      if (session.quote?.elements) {
        imageUrls.push(
          ...session.quote.elements
            .filter((x) => x.type === 'image')
            .map((x) => x.attrs.url as string)
        );
      }
      for (const ele of session.elements.slice(1)) {
        // 需要忽略回复转化为的 at，第一个不是 at 就是指令，可以放心忽略（应该
        if (ele.type === 'image') imageUrls.push(ele.attrs.url as string);
        if (ele.type === 'at')
          return h.i18n('memes-api.errors.at-not-supported');
      }

      const senderAvatar = session.author?.avatar;
      if (senderAvatar) {
        if (selfLen) {
          imageUrls.push(...Array(selfLen).fill(senderAvatar));
        }

        if (
          (meme.params.min_images === 2 && imageUrls.length === 1) ||
          (!imageUrls.length && meme.params.min_images === 1)
        )
          imageUrls.unshift(senderAvatar);
      }

      if (!texts.length) texts.push(...params.default_texts);

      if (
        imageUrls.length < params.min_images ||
        imageUrls.length > params.max_images
      )
        return formatError('image-number-mismatch', name, params);

      if (texts.length < params.min_texts || texts.length > params.max_texts)
        return formatError('text-number-mismatch', name, params);

      let images;
      try {
        images = (
          await Promise.all(
            imageUrls.map((url) =>
              ctx.http.axios({ url, responseType: 'arraybuffer' })
            )
          )
        ).map(getRetFileByResp);
      } catch (e) {
        logger.error(e);
        return h.i18n('memes-api.errors.download-avatar-failed');
      }

      let img;
      try {
        img = await source.renderMeme(key, { images, texts, args });
      } catch (e) {
        // 这个时候出错可能需要给格式化函数传参，单独 catch 一下
        const err = e instanceof MemeError ? e : new MemeError(e);
        logger.error(err);
        return err.format(name, params);
      }
      // #endregion

      // await writeFile('meme.png', img.data, { encoding: 'binary' });
      return returnFileToElem(img);
    }
  );

  ctx
    .command('meme.generate')
    .alias('memes.generate <name:string>')
    .action(({ session }, name) => {
      if (session && session.elements && name) {
        const plainTxt = extractPlaintext(session.elements);
        const pfx = plainTxt.slice(0, plainTxt.indexOf(name) + name.length);
        return generateMeme(session, name, pfx);
      }
      return undefined;
    });

  if (config.enableShortcut) {
    cmdList.alias('表情包制作').alias('头像表情包').alias('文字表情包');

    cmdInfo.alias('表情详情').alias('表情帮助').alias('表情示例');

    ctx.middleware(async (session, next) => {
      if (!session.elements) return undefined;

      const { prefix } = ctx.root.config ?? '';
      const prefixes = prefix instanceof Array ? prefix : [prefix as string];

      const content = extractPlaintext(session.elements).trim();

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
  }

  logger.info(
    `Plugin setup successfully, ` +
      `loaded ${Object.values(source.getMemes()).length} memes.`
  );
}
