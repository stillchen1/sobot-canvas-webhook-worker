# 智齿流程画布回传服务使用指南

这是一份面向运营、项目交接和日常维护人员的说明文档。你不需要懂代码，只要按文档中的步骤配置智齿回调地址、确认密钥、查看接口返回，就可以完成日常使用和排查。

## 1. 这个项目是做什么的

本项目是一个部署在 Cloudflare Workers 上的“智齿回调接收服务”。

它的作用可以理解为：

1. 智齿流程画布触发事件后，把事件回调到本服务。
2. 本服务把每一次回调原样记录到 Cloudflare D1 数据库。
3. 运营、数据看板或机器人可以通过查询接口获取日报、概览、用户轨迹、失败明细等数据。
4. 项目内还提供了一个 agent skill，让运营可以直接用“大白话”向 AI Agent 查数，不必手动拼接口地址。

简单说：它负责把智齿流程画布里的用户触达过程沉淀成可查询的数据。

## 2. 适合谁看

- 运营同学：配置智齿回调、查看每天触达效果、排查发送失败。
- 项目交接人员：理解服务用途、部署位置、关键配置和维护方式。
- 技术支持同学：根据本文快速找到接口、密钥、数据库和部署命令。

## 3. 你需要知道的几个名词

| 名词 | 含义 |
| --- | --- |
| Worker | Cloudflare 上运行的后端服务，可以理解为这个项目的线上程序 |
| D1 | Cloudflare 的数据库，用来保存智齿回调数据 |
| Webhook | 智齿把事件主动通知给本服务的方式 |
| gameCode | 游戏或业务线代码，例如 `ptslg` |
| canvasCode | 智齿流程画布代码，例如 `new-user` |
| eventKey | 事件类型，例如已发送、已阅读、已回复 |
| WEBHOOK_SECRET | 智齿回调时携带的校验密钥，防止别人乱写数据 |
| API_QUERY_TOKEN | 查询接口的访问令牌，防止别人乱查数据 |

## 4. 项目当前配置

当前 Worker 配置在 `wrangler.toml` 中：

| 配置项 | 当前值 |
| --- | --- |
| Worker 名称 | `sobot-feishu-callback-poc` |
| 程序入口 | `src/index.ts` |
| D1 数据库绑定名 | `SOBOT_DB` |
| D1 数据库名称 | `sobot-events` |
| 默认报表时区 | UTC+8，中国时间 |

注意：真正的线上访问地址由 Cloudflare 部署后生成，通常类似：

```text
https://sobot-feishu-callback-poc.<你的 Cloudflare 账号>.workers.dev
```

实际地址请以 Cloudflare Workers 后台或交接人提供的地址为准。

## 5. 智齿回调怎么配置

### 5.1 推荐回调地址格式

推荐在智齿流程画布里配置下面这种地址：

```text
https://你的-worker域名/webhooks/sobot/{gameCode}/{canvasCode}/{eventKey}
```

示例：

```text
https://你的-worker域名/webhooks/sobot/ptslg/new-user/entered
https://你的-worker域名/webhooks/sobot/ptslg/new-user/sent
https://你的-worker域名/webhooks/sobot/ptslg/new-user/delivered
https://你的-worker域名/webhooks/sobot/ptslg/new-user/read
https://你的-worker域名/webhooks/sobot/ptslg/new-user/replied
https://你的-worker域名/webhooks/sobot/ptslg/new-user/send-failed
https://你的-worker域名/webhooks/sobot/ptslg/new-user/button-clicked
```

其中：

- `ptslg` 是游戏或业务线代码。
- `new-user` 是流程画布代码，可以按实际画布命名。
- 最后一段是事件类型。

### 5.2 支持的事件类型

| eventKey | 中文含义 | 典型用途 |
| --- | --- | --- |
| `entered` | 命中规则 | 有用户进入这条流程 |
| `sent` | 已发送 | 消息已经发出 |
| `delivered` | 已送达 | 消息已到达用户 |
| `read` | 已阅读 | 用户已读消息 |
| `replied` | 已回复 | 用户回复了消息 |
| `send-failed` | 发送失败 | 消息发送失败，需要排查 |
| `button-clicked` | 点击按钮 | 用户点击了消息里的按钮 |

### 5.3 智齿回调请求要求

智齿回调到本服务时，需要满足：

| 项目 | 要求 |
| --- | --- |
| 请求方法 | `POST` 或 `PUT` |
| 请求头 | 必须带 `x-webhook-secret` |
| 请求体 Body 类型 | `application/json` |
| 请求体内容 | 智齿自动推送的客户信息 JSON |
| 成功返回 | `{"code":0,"status":0}` |

`x-webhook-secret` 的值必须等于 Cloudflare Worker 里配置的 `WEBHOOK_SECRET`。

在智齿 Webhook 配置页面中，按下面填写：

| 页面字段 | 应填写内容 |
| --- | --- |
| 方法 | `POST` |
| URL | 选择 `https://`，右侧填写本服务的完整回调地址 |
| 请求 Header - 密钥名称 | `x-webhook-secret` |
| 请求 Header - 密钥值 | `WEBHOOK_SECRET` 对应的实际密钥值 |
| 请求 Body - 类型 | `application/json` |
| 请求 Body - 内容 | 保持智齿默认推送内容即可 |

请求 Header 最终效果等同于：

```http
x-webhook-secret: 你的_WEBHOOK_SECRET
```

### 5.4 旧地址兼容说明

服务也兼容旧格式：

```text
https://你的-worker域名/webhooks/sobot/{eventKey}
```

例如：

```text
https://你的-worker域名/webhooks/sobot/read
```

旧格式会默认记录为：

- `gameCode = ptslg`
- `canvasCode = default`

新流程建议使用推荐格式，方便多游戏、多画布区分数据。

## 6. 查询接口怎么用

所有查询接口都需要带访问令牌：

```http
Authorization: Bearer 你的_API_QUERY_TOKEN
```

如果没有这个令牌，接口会返回无权限。

### 6.1 健康检查

用于确认服务是否正常。

```http
GET /api/health
```

示例：

```text
https://你的-worker域名/api/health
```

正常返回类似：

```json
{
  "ok": true,
  "data": {
    "service": "sobot-report-api",
    "tzOffsetHours": 8
  }
}
```

### 6.2 查询某一天日报

用于查看某个游戏、某个画布在一天内的触达表现。

```http
GET /api/report/daily?date=YYYY-MM-DD&gameCode=ptslg&canvasCode=new-user
```

示例：

```text
https://你的-worker域名/api/report/daily?date=2026-04-30&gameCode=ptslg&canvasCode=new-user
```

返回数据中重点看：

| 字段 | 含义 |
| --- | --- |
| `totalEvents` | 当天总事件数 |
| `uniqueUsers` | 当天涉及的去重用户数 |
| `vipEvents` | VIP 相关事件数 |
| `readRate` | 阅读率，按已读 / 已送达计算 |
| `replyRate` | 回复率，按已回复 / 已读计算 |
| `counts.entered` | 命中规则数 |
| `counts.sent` | 已发送数 |
| `counts.delivered` | 已送达数 |
| `counts.read` | 已阅读数 |
| `counts.replied` | 已回复数 |
| `counts.sendFailed` | 发送失败数 |
| `topLabels` | 出现最多的用户标签 |
| `failedExamples` | 发送失败样例 |

### 6.3 查询一段时间概览

用于看多天合计数据。

```http
GET /api/stats/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&gameCode=ptslg&canvasCode=new-user
```

示例：

```text
https://你的-worker域名/api/stats/overview?from=2026-04-01&to=2026-04-30&gameCode=ptslg&canvasCode=new-user
```

### 6.4 按手机号查用户轨迹

用于排查某个用户是否进入流程、是否送达、是否阅读、是否回复。

```http
GET /api/users/search?tel=手机号&gameCode=ptslg&canvasCode=new-user
```

示例：

```text
https://你的-worker域名/api/users/search?tel=86138****0000&gameCode=ptslg&canvasCode=new-user
```

### 6.5 按会话 ID 查事件

用于技术或客服按 `pid` 查询某个会话的全部事件。

```http
GET /api/conversations/{pid}/events?gameCode=ptslg&canvasCode=new-user
```

示例：

```text
https://你的-worker域名/api/conversations/456/events?gameCode=ptslg&canvasCode=new-user
```

### 6.6 查询某一天发送失败明细

用于运营每天排查发送失败用户。

```http
GET /api/events/failed?date=YYYY-MM-DD&gameCode=ptslg&canvasCode=new-user
```

示例：

```text
https://你的-worker域名/api/events/failed?date=2026-04-30&gameCode=ptslg&canvasCode=new-user
```

## 7. Agent Skill：让运营用大白话查数

项目目录中包含一个已经打包好的 agent skill：

```text
查数SKILL/
```

这个 skill 的名称是：

```text
sobot-canvas-query
```

它的用途是把运营同学的自然语言问题自动转换成上面这些查询接口调用，并把接口返回结果整理成适合在飞书、聊天窗口或 AI Agent 中阅读的中文结论。

### 7.1 skill 能做什么

| 运营怎么问 | skill 会做什么 |
| --- | --- |
| `昨天的智齿数据怎么样？` | 默认查询 `ptslg` 昨天日报 |
| `wgame 三方支付破冰策略今天发了多少？` | 根据注册表找到 `wgame / webstore-new-user`，查询当天日报 |
| `最近7天触达情况如何？` | 查询最近 7 天概览，输出发送、送达、阅读、回复漏斗 |
| `查手机号 86190****2104 有没有收到消息` | 查询该玩家最近事件轨迹 |
| `昨天发送失败的有哪些？` | 查询发送失败明细并列出示例用户 |
| `帮我列下 wgame 破冰策略所有节点的回调 URL` | 生成 7 个智齿 webhook 节点 URL，辅助运营配置画布 |

### 7.2 skill 文件结构

| 文件 | 说明 |
| --- | --- |
| `查数SKILL/SKILL.md` | skill 主说明，定义触发条件、接口调用规则、自然语言理解规则和回复格式 |
| `查数SKILL/references/games-and-strategies.md` | 游戏和策略画布注册表，用来把中文策略名映射成 `gameCode` 和 `canvasCode` |
| `查数SKILL/evals/evals.json` | skill 评测用例，用来验证常见提问能否被正确理解 |
| `查数SKILL/CHANGELOG.md` | skill 版本变更记录 |

本地的 `.claude/settings.local.json` 属于个人开发环境配置，不会上传到 GitHub。

### 7.3 运营使用前需要准备什么

运营同学不用理解接口细节，但 AI Agent 所在环境需要具备：

- 已安装或加载 `查数SKILL/` 这个 skill。
- 能访问 Worker 线上地址。
- 已配置 `API_QUERY_TOKEN`，用于查询接口鉴权。

`API_QUERY_TOKEN` 是查询令牌，不能写进公开文档，也不要发到公开群。实际使用时建议由 AI Agent 平台通过环境变量或 secret 注入。

### 7.4 游戏和画布如何维护

如果新增游戏、下线策略、或某个中文策略名对应的画布代码发生变化，优先修改：

```text
查数SKILL/references/games-and-strategies.md
```

一般不需要改 `SKILL.md` 主文件。这样运营说“破冰策略”“三方支付破冰”“wgame 画布”等自然语言时，skill 才能稳定映射到正确的 `gameCode` 和 `canvasCode`。

当前已登记：

| 游戏 | 已登记策略示例 |
| --- | --- |
| `ptslg` | 三方支付破冰策略、充值破冰、默认画布 |
| `wgame` | 三方支付破冰策略、充值破冰、网页商城新用户破冰画布 |

### 7.5 skill 的安全注意事项

- 不要把真实 `API_QUERY_TOKEN` 写进 `SKILL.md`、README 或 GitHub。
- 如果 agent 需要保存 token，请保存到本地 `.env` 或平台 secret 中，并确保 `.env` 不进入 Git。
- skill 生成 webhook URL 时会要求先确认 `gameCode` 和 `canvasCode`，这是为了避免事件被写到错误画布，后续报表查不到数据。

## 8. 查询参数规则

| 参数 | 是否必填 | 说明 |
| --- | --- | --- |
| `gameCode` | 必填 | 游戏或业务线代码 |
| `canvasCode` | 选填 | 流程画布代码 |
| `date` | 部分接口必填 | 日期，格式必须是 `YYYY-MM-DD` |
| `from` | 概览接口必填 | 开始日期，格式必须是 `YYYY-MM-DD` |
| `to` | 概览接口必填 | 结束日期，格式必须是 `YYYY-MM-DD` |
| `tel` | 用户查询必填 | 手机号 |

如果不传 `canvasCode`，查询范围是整个 `gameCode` 下的所有画布。

## 9. 接口返回怎么判断

正常查询返回：

```json
{
  "ok": true,
  "data": {}
}
```

异常返回：

```json
{
  "ok": false,
  "error": "错误原因"
}
```

常见错误：

| 错误 | 可能原因 | 处理方式 |
| --- | --- | --- |
| `Missing Authorization header` | 查询接口没带访问令牌 | 补充 `Authorization: Bearer ...` |
| `Invalid API token` | 查询令牌不正确 | 确认 `API_QUERY_TOKEN` |
| `Missing x-webhook-secret` | 智齿回调没带密钥请求头 | 在智齿侧配置请求头 |
| `Invalid webhook secret` | 智齿回调密钥不正确 | 确认 `WEBHOOK_SECRET` |
| `Missing gameCode` | 查询接口没传游戏代码 | URL 后补充 `gameCode=...` |
| `Invalid date format` | 日期格式错误 | 使用 `2026-04-30` 这种格式 |
| `Not Found` | 地址写错或事件类型不支持 | 对照本文检查路径 |
| `Server Misconfigured` | Worker 密钥未配置 | 到 Cloudflare 配置密钥 |

## 10. 运营日常检查流程

建议每天按下面顺序检查：

1. 打开健康检查接口，确认服务正常。
2. 查询昨天的日报接口，看 `sent`、`delivered`、`read`、`replied` 是否符合预期。
3. 如果 `sendFailed` 大于 0，打开发送失败明细接口。
4. 如果某个用户反馈没收到，按手机号查询用户轨迹。
5. 如果某个画布数据异常，确认智齿里该画布配置的回调地址是否使用了正确的 `gameCode` 和 `canvasCode`。

## 11. 部署和维护说明

这一部分主要给交接人或技术支持看。运营同学平时不需要执行这些命令。

### 10.1 本地准备

需要安装：

- Node.js
- npm
- Cloudflare Wrangler 登录态

安装依赖：

```bash
npm install
```

### 10.2 初始化或更新数据库表

```bash
npx wrangler d1 execute sobot-events --file=schema.sql
```

### 10.3 配置线上密钥

```bash
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put API_QUERY_TOKEN
```

可选：如果需要修改报表时区偏移，可以配置：

```bash
npx wrangler secret put REPORT_TZ_OFFSET_HOURS
```

中国时间保持默认即可，不配置也会按 `8` 处理。

### 10.4 本地调试

本地调试时，可以在 `.dev.vars` 里配置本地密钥。这个文件不要上传到 GitHub。

示例：

```env
WEBHOOK_SECRET=本地测试用回调密钥
API_QUERY_TOKEN=本地测试用查询令牌
REPORT_TZ_OFFSET_HOURS=8
```

启动本地服务：

```bash
npm run dev
```

### 10.5 部署到 Cloudflare

```bash
npm run deploy
```

部署完成后，到 Cloudflare Workers 后台复制线上访问地址，再配置到智齿流程画布里。

## 12. 数据保存在哪里

数据保存在 Cloudflare D1 数据库 `sobot-events` 的 `sobot_events` 表中。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `received_at` | 服务收到回调的时间 |
| `game_code` | 游戏或业务线代码 |
| `canvas_code` | 流程画布代码 |
| `event_key` | 事件类型 |
| `event_label_zh` | 中文事件名 |
| `payload_id` | 智齿回调里的事件 ID |
| `pid` | 会话 ID |
| `nick` | 用户昵称 |
| `uname` | 用户名 |
| `tel` | 手机号 |
| `user_label` | 用户标签 |
| `contact_id` | 智齿联系人 ID |
| `trigger_id` | 智齿触发 ID |
| `raw_payload` | 智齿原始回调内容 |

## 13. 重要安全提醒

- 不要把 `.dev.vars` 上传到 GitHub，里面可能有密钥。
- 不要把 `.env` 上传到 GitHub，里面可能有查询 token。
- 不要把 `WEBHOOK_SECRET` 和 `API_QUERY_TOKEN` 发到公开群里。
- GitHub 仓库如果是公开仓库，README 里只能写变量名和使用方法，不能写真实密钥。
- 如果怀疑密钥泄露，请让技术同学立即在 Cloudflare 里重新设置密钥，并同步修改智齿侧配置。

## 14. 项目文件说明

| 文件 | 说明 |
| --- | --- |
| `src/index.ts` | 服务主程序，处理智齿回调和查询接口 |
| `schema.sql` | D1 数据库表结构 |
| `wrangler.toml` | Cloudflare Worker 配置 |
| `sample-sobot.json` | 智齿回调示例数据 |
| `package.json` | 项目依赖和启动命令 |
| `.dev.vars` | 本地调试密钥，不应上传 |
| `查数SKILL/` | 面向 AI Agent 的自然语言查数 skill |

## 15. 交接清单

交接时建议确认以下信息：

- Cloudflare 账号归属和登录方式。
- Worker 线上访问地址。
- D1 数据库 `sobot-events` 是否存在。
- 智齿流程画布里每个事件是否都配置了正确回调地址。
- `WEBHOOK_SECRET` 和智齿侧请求头是否一致。
- `API_QUERY_TOKEN` 是否已交给需要查询数据的系统或机器人。
- AI Agent 是否已经安装或加载 `查数SKILL/`。
- `查数SKILL/references/games-and-strategies.md` 里的游戏和策略是否与线上智齿画布一致。
- GitHub 仓库是否只包含代码和说明文档，没有真实密钥。

## 16. 快速验收方法

1. 打开健康检查接口，确认返回 `ok: true`。
2. 在智齿测试触发一次流程事件。
3. 调用日报接口，确认对应日期和 `gameCode` 下有新增数据。
4. 如果是发送失败测试，调用失败明细接口，确认能查到失败样例。
5. 在 AI Agent 中用自然语言提问，例如“昨天的智齿数据怎么样”，确认 skill 能返回中文报表。

验收通过后，这个服务就可以作为智齿流程画布数据回传和查询的正式交接版本。
