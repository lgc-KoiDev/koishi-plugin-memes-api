<!-- markdownlint-disable MD026 MD031 MD033 MD036 MD041 -->

<div align="center">

<a href="https://koishi.chat/zh-CN/market/">
  <img src="https://raw.githubusercontent.com/lgc-KoiDev/readme/master/workspace/koishi-plugin.png" width="180" height="180" alt="KoishiPluginLogo">
</a>

<p>
  <img src="https://raw.githubusercontent.com/lgc-KoiDev/readme/master/workspace/KoishiPlugin.svg" width="240" alt="KoishiPluginText">
</p>

# Koishi-Plugin-Memes-API

_✨ 表情包制作插件调用 API 版 ✨_

<a href="./LICENSE">
  <img src="https://img.shields.io/github/license/lgc-KoiDev/koishi-plugin-memes-api.svg" alt="license">
</a>
<a href="https://www.npmjs.com/package/koishi-plugin-memes-api">
  <img src="https://img.shields.io/npm/v/koishi-plugin-memes-api" alt="npm">
</a>
<a href="https://www.npmjs.com/package/koishi-plugin-memes-api">
  <img src="https://img.shields.io/npm/dm/koishi-plugin-memes-api" alt="npm download">
</a>
<a href="https://wakatime.com/badge/user/b61b0f9a-f40b-4c82-bc51-0a75c67bfccf/project/79af41ae-0173-4c1f-9db2-f87d94569c76">
  <img src="https://wakatime.com/badge/user/b61b0f9a-f40b-4c82-bc51-0a75c67bfccf/project/79af41ae-0173-4c1f-9db2-f87d94569c76.svg" alt="wakatime">
</a>

</div>

## 📖 介绍

![rua](https://raw.githubusercontent.com/lgc-KoiDev/readme/master/memes-api/rua-koishi.gif)

## 📦 配置 & 使用

请安装插件后自行查看 Koishi 控制台内的帮助信息、插件注册的指令以及 I18N 项目

<!--
## 🗒️ TODO

~~_虽然但是，写在这里的不一定会做，我是大懒逼_~~

- [x] 支持 AT 获取头像
- [ ] 缓存渲好的 Meme
- [ ] 内置 `meme-generator`
-->

## 💡 鸣谢

### [meme-generator](https://github.com/MeetWq/meme-generator)

- 本插件依赖的项目  
  WQ 佬牛逼！

### [NoneBot](https://nonebot.dev/)

- **我们的 NoneBot 真是太强啦！**  
  ![太强啦](https://s2.loli.net/2023/02/06/Hfwj67QoVAatexN.png)

### Koishi 开发群的各位大佬

- 群里的各位大佬们充分体现了我是大废物的事实（悲

## 📞 联系

QQ：3076823485  
Telegram：[@lgc2333](https://t.me/lgc2333)  
吹水群：[1105946125](https://jq.qq.com/?_wv=1027&k=Z3n1MpEp)  
邮箱：<lgc2333@126.com>

## 💰 赞助

**[赞助我](https://blog.lgc2333.top/donate)**

感谢大家的赞助！你们的赞助将是我继续创作的动力！

## 📝 更新日志

### 1.0.2

- 修复不启用注册快捷指令时启动报错的问题

### 1.0.1

- 现在更长的关键词优先级更高，防止一些异常情况的发生

### 1.0.0

插件重构：

- 现在生成指令注册为 `meme.generate` 的子指令，可选参数以 Koishi 命令选项形式注册，需要放在参数最前
- 添加了 `meme.random` 指令
- 一些配置的添加与修改、某些用户体验的变更

<details>
<summary>v0 更新日志（点击展开）</summary>

### 0.1.29 ~ 0.1.30

- 修复一些快速指令未按预期工作的问题

### 0.1.28

- fix [#16](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/issues/16)

### 0.1.27

- 现在使用 `session.execute` 执行本插件生成命令时的行为将符合开发者预期
- 一些不影响使用的其它小修改

### 0.1.26

- try 2 fix [#13](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/issues/13)

### 0.1.25

- 修复与 Koishi 4.17.5 的兼容性

### 0.1.24

- 支持使用 `@用户ID` 格式的参数指定用户头像
- 生成 meme 时会提交用户信息了
- 优化了无法获取头像时的提示

### 0.1.23

- 修复上个版本中的 bug

### 0.1.22

- 现在 `meme.generate` 指令的权限对原版指令生效
- 添加配置项 `autoUseDefaultTexts`

### 0.1.21

- 支持更多平台的头像获取

### 0.1.17 ~ 0.1.20

- 兼容 Koishi 4.17

### 0.1.15 & 0.1.16

- 修复一些 Bug，优化代码

### 0.1.14

- 修复打包错误

### 0.1.13

- [#9](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/issues/9)：
  - 添加配置项 `autoUseSenderAvatarWhenOnlyOne` 与 `autoUseSenderAvatarWhenOneLeft`
- [#10](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/pull/10)
- [#11](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/pull/11)
- 修改图片或文字数量不符的提示信息

### 0.1.12

- [#7](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/issues/7)

### 0.1.11

- fix [#6](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/issues/6) `meme ls 的时候会让 gocq 出现无法发图片的情况`
- 其他小调整

### 0.1.10

- `Fix: support red platform` ([#5](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/pull/5))

### 0.1.9

- 修复了 `meme generate` 指令使用序号时的一些问题

### 0.1.8

- 给 `meme info` 也加上了序号支持 ([#1](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/issues/1))

### 0.1.7

- `meme generate` 指令可以输入表情编号来调用表情了 ([#1](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/issues/1))
- 重构部分代码
- 给配置项加上了 i18n

### 0.1.4 ~ 0.1.6

- 修复打包问题

### 0.1.3

- 支持 OneBot 平台的 AT 获取头像
- 修复一些问题

### 0.1.1 ~ 0.1.2

- 修复 & 小调整

</details>
