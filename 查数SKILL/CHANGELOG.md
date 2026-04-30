# Changelog

本文件记录 sobot-canvas-query skill 的版本变更。版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [2.1.1] - 2026-04-20

修正运营日报中"触达玩家 vs 进入画布"口径不一致引发的用户困惑，并补强 entered 节点 webhook 漏单的检测。

### 背景

线上发现一份 wgame / webstore-new-user 日报输出 "触达玩家 239 人 / 进入画布 205 条"，触达玩家数反而大于进入画布事件数，与"进入画布是漏斗最早一环"的直觉冲突。根因是两者口径不同（uniqueUsers 是全事件去重玩家、entered 是事件条数），且更深层的信号是 entered 节点 webhook 大概率漏单。原 skill 把这两个数字并列展示但未解释关系，也没有任何风险提示。

### Changed

- 响应字段表 `uniqueUsers` 含义补全：明确是"全事件去重的玩家数"（任意事件出现即计入），并写明正常应满足 `uniqueUsers ≤ counts.entered`，不要与"进入画布玩家数"混用
- `counts.*` 字段含义补一句"按事件条数，非去重"，与 uniqueUsers 形成对照
- 单日 / 区间报表模板：
  - "触达玩家"改名为"涉及玩家（去重）"，避免与漏斗"送达"语义冲突，也避免用户拿去重人数 vs 事件条数直接对比
  - 漏斗标题加注 "（按事件条数）"
  - 模板下方加一段说明改名理由，方便后人维护时不要误改回去

### Added

- 风险提示新增一条：`uniqueUsers > counts.entered` 时输出"数据倒挂"警示，直接指向"entered 节点 webhook 漏配/丢单"，并引导核查智齿后台"进入流程"节点回调 URL
- 风险提示表下方补一段"触达玩家与进入画布的关系"说明，明确异常时优先按数据倒挂提示而非正常输出

## [2.1.0] - 2026-04-17

把游戏/策略映射沉淀到独立 reference 文件，并新增第四类意图：辅助生成新游戏/新画布的智齿 webhook 回调 URL。

### Added

- 新增 `references/games-and-strategies.md`，作为线上游戏与策略画布的**权威注册表**：
  - 已登记 ptslg、wgame 及各自的策略画布
  - 7 个 eventKey 全集
  - webhook URL 模板 + 旧路由兼容说明
  - 维护规则：新增/下线策略只改这一份，SKILL.md 不动
- 新增**意图 D：webhook URL 生成（运营配置辅助）**，纯生成不调 API：
  - 4 步处理流程：识别 gameCode → 识别 canvasCode → **必须用户确认** → 按固定顺序输出 7 条 URL
  - 严格固定的输出格式（节点中文名一行 / URL 一行 / 共 7 个节点）
  - "千万不要做"清单：不静默兜底、不省节点、不推荐旧路由
  - 末尾验证引导："查 {gameCode} {canvasCode} 今天的数据"
  - 新游戏额外提醒同步更新注册表
- description 中加入意图 D 触发关键词（"webhook 配置"、"回调 URL"、"节点 URL"、"igame"等）
- 意图概览表新增 D 行
- evals 新增 4 个意图 D 用例（id 14–17）：已知策略生成、新游戏配置、缺画布必须追问、缺 game/canvas 必须追问

### Changed

- 画布映射节从"列表式"改为"指引读 reference"，并放大字号强调"**同一策略名跨游戏 canvasCode 不同**"陷阱（举 ptslg → `default` vs wgame → `webstore-new-user` 对照例子）
- 输出原则补一条：意图 D 绝不静默兜底，gameCode/canvasCode 必须先与用户确认
- 修正 evals 中虚构的画布映射：`webstore-break-ice` → 真实部署值 `webstore-new-user`
- evals id 9/10 改为正反对照"三方支付破冰策略"在 ptslg vs wgame 下的不同 canvasCode，验证 skill 不会跨游戏混用

### Fixed

- v2.0.0 evals 里 `webstore-break-ice` 是规划期占位值，与实际部署的 `webstore-new-user` 不一致，本版纠正

## [2.0.0] - 2026-04-17

后端链路（Sobot webhook → Cloudflare Worker → D1 → OpenClaw）从"单游戏 / 单默认画布"升级为"多游戏 + 多画布"架构，本 skill 同步适配。

### ⚠️ 不兼容变更（Breaking）

- **所有业务查询接口都必须显式带 `gameCode` 参数**。旧式不带 `gameCode` 的调用（如 `/api/report/daily?date=2026-04-17`）会被 API 拒绝或返回错误结果，必须改为 `/api/report/daily?date=2026-04-17&gameCode=ptslg`。
- 即使是 pid 这种唯一标识，调用 `/api/conversations/{pid}/events` 也必须带 `gameCode`：跨游戏的 pid 不再保证全局唯一。

### Added

- 新增"游戏与画布参数（必读，三类查询共用）"章节，定义：
  - 默认与追问策略：缺 `gameCode` 默认 `ptslg`、缺 `canvasCode` 省略不追问、未知游戏名追问
  - 游戏映射表（ptslg / wgame）
  - 画布映射表（default / new-user / activity-a 等）
  - 范围回显规范（`范围：{gameCode}{ / canvasCode 或 （全部画布）}`）
  - URL 拼接示例
- 三类查询的输出模板（单日 / 区间 / 手机号 / 会话 / 失败有无）首行后均增加范围标识行，让用户能立刻发现 skill 是否理解错了游戏/画布
- description 中加入多游戏/多画布关键词（`ptslg`、`wgame`、`new-user`、`webstore-break-ice`、"破冰策略"、"新用户画布"等），扩大触发覆盖
- evals 新增 7 个多游戏 / 多画布场景用例（id 9–15），包括跨游戏画布映射、画布名独立出现而无 game、未知游戏名追问等

### Changed

- 意图 A / B / C 的接口签名全部追加 `&gameCode={code}[&canvasCode={code}]`
- 输出原则新增两条强约束：
  - 每次查询都必须带 `gameCode`（缺省时静默用 `ptslg`），用户明确说了画布才带 `canvasCode`
  - 每次回复开头都要展示查询范围

### 后端配套（非本 skill 改动，但影响行为）

- `sobot_events` 表新增 `game_code` / `canvas_code` / `source_route` 字段及对应索引
- 新 webhook 路由：`/webhooks/sobot/{gameCode}/{canvasCode}/{eventKey}`
- 旧 webhook 路由 `/webhooks/sobot/{eventKey}` 兼容保留，写入时自动归到 `gameCode=ptslg, canvasCode=default`
- 历史数据回填为 `gameCode=ptslg, canvasCode=default`，旧报表不会丢

### 升级指引

- 已使用本 skill 的对话无需操作，新版本会自动以 `ptslg` 兜底，行为基本等价于旧版
- 如需查询 wgame 等新游戏，自然语言中带上游戏名（"wgame 昨天数据"）即可
- 如需限定画布维度，在自然语言中说出画布名或策略中文名（"new-user 画布"、"破冰策略"）

## [1.0.0] - 初始版本

- 三类意图：运营报表（A）/ 用户会话查询（B）/ 发送失败记录（C）
- 北京时间解析、token 三级获取、风险提示、中文事件映射
