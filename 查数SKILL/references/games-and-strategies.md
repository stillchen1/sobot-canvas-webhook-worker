# 游戏与策略画布注册表

本文件是当前线上跑的所有游戏项目和策略画布的**权威来源**。SKILL.md 的画布映射只列示例，遇到 SKILL.md 与本文件冲突时，**以本文件为准**。

需要做以下任一事情时，先读这份文件：

- 把用户说的策略中文名（如"三方支付破冰策略"）映射成 `canvasCode`
- 给某个游戏生成 webhook URL（意图 D）
- 不确定某游戏底下到底有哪些 canvas

---

## 维护规则

- 新增 / 下线游戏或策略时，**只改本文件**，SKILL.md 不动
- 策略名称使用业务方真实在用的中文叫法（包括所有同义说法），便于自然语言识别
- 同一行可以列多个同义中文名，用 ` / ` 分隔
- `canvasCode` 必须是 kebab-case 全小写
- 写明"说明"列，备注命名由来或与其他 canvas 的差异，避免后人误改

---

## 已注册游戏

### ptslg（历史项目，主要业务）

| 业务名称（用户可能这样说） | canvasCode | 说明 |
|---------|-----------|------|
| 三方支付破冰策略 / 充值破冰 / 破冰策略（在 ptslg 语境下） | `default` | ptslg 的三方支付破冰沿用旧 webhook 路由，未单独切 canvas，统一归 default |
| 默认画布 / 旧路由 / 旧回调数据 | `default` | 改造前的旧 webhook（路径无 canvas 段）写入时一律标记为 default |

### wgame

| 业务名称 | canvasCode | 说明 |
|---------|-----------|------|
| 三方支付破冰策略 / 充值破冰 / 破冰策略（在 wgame 语境下） | `webstore-new-user` | wgame 的网页商城新用户破冰画布 |

---

## 关键提醒：同名策略跨游戏 canvasCode 不同

注意上面两条："三方支付破冰策略"在 ptslg 下是 `default`，在 wgame 下是 `webstore-new-user`。

原因：每个游戏的运营节奏和 canvas 拆分计划独立，画布命名是游戏内部规划，不会做跨游戏对齐。

**所以解析画布的顺序必须是：先确定 `gameCode`，再到该游戏小节下查 `canvasCode`。** 千万不要假设同一个中文策略名在所有游戏下都映射到同一个 canvasCode。

---

## 已知 eventKey 全集（意图 D 用）

webhook 路径中 `{eventKey}` 共 7 个，对应智齿流程画布的 7 个事件节点：

| 节点（智齿画布上的中文） | eventKey |
|---------|----------|
| 进入流程 | `entered` |
| WA已发送 | `sent` |
| WA已送达 | `delivered` |
| WA已阅读 | `read` |
| WA已回复 | `replied` |
| WA点击按钮 | `button-clicked` |
| WA发送失败 | `send-failed` |

---

## webhook URL 模板

```
https://sobot-feishu-callback-poc.aurorastudio.workers.dev/webhooks/sobot/{gameCode}/{canvasCode}/{eventKey}
```

旧路由（兼容期保留，**不要主动推荐**）：

```
https://sobot-feishu-callback-poc.aurorastudio.workers.dev/webhooks/sobot/{eventKey}
```

旧路由写入的事件会被 Worker 自动归到 `gameCode=ptslg, canvasCode=default`。
