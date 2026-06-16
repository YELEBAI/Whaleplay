# 同步协议

同步系统让 Whale Play 桌面端与移动端（React Native）之间安全地交换角色、聊天、消息、世界书、预设和设置数据。本文档描述协议契约——**形状、语义和约定**——不描述传输编码或 Rust/React Native 的具体实现。实现位于 `dev-sync` 分支；本文档在 `dev` 分支上是最早的决策记录，所有实现必须遵守这里的契约。

## 目标

1. **单向首轮同步**：手机配对桌面后，拉 manifest → 全量 snapshot，离线可独立 RP。
2. **增量变更**：后续配对只拉 since-cursor 的差分，不用每次全量。
3. **安全回连合并**：离线期间产生的本地变更 push 回桌面，冲突时保留副本或按策略自动合并。
4. **传输中立**：协议不关心 LAN/蓝牙/云——同一套 `SyncServer`/`SyncClient` 接口。

## 核心概念

### Revision

每条可同步实体带一个 `revision: string` 字段（单调递增）。首版用 `updatedAt` ISO 时间戳 + 内容 hash；未来可切换为 Lamport clock，类型别名不变。

### Tombstone（墓碑）

删除操作**不复原实体**，而是设置 `deletedAt: string`（ISO 时间戳）。客户端看到非空的 `deletedAt` 就知道这是墓碑，可选择软删除显示或永久清理。

### 变更日志（Change Log）

桌面端维护 append-only 的变更日志。每条写操作产生一个 `ChangeRecord { seq, entity, sourceNode, occurredAt }`。客户端通过 `since` cursor 按页拉取。

### Cursor

不透明 token。客户端拉取增量后保存 cursor，下次从该 cursor 继续。格式由服务端定义（如 `seq=42` 或编码后的 Lamport vector），客户端不应解析。

## 实体边界

以下实体参与同步，`settings` 是单例伪实体（`id = "settings"`）。

| 实体类型 | 存储后端 | 同步粒度 | 备注 |
|---|---|---|---|
| `character` | KV (store.json) | 完整实体 | 含 statusBars 配置 |
| `chat` | KV (store.json) | 完整实体 | 仅 metadata；消息单独同步 |
| `message` | SQLite (messages 表) | 完整实体 | 含 parentId 树结构 |
| `preset` | KV (store.json) | 完整实体 | 含 items 数组 |
| `worldbook` | KV (store.json) | 完整实体 | 含 entries 数组 |
| `settings` | KV (store.json) | 单例完整实体 | 模型配置、正则规则、偏好 |
| `chatMemory` | KV (store.json) | 完整实体 | 记忆摘要段 |
| `agenticPlayState` | SQLite (agentic_play_states 表) | 完整实体 | 按 chatId 索引 |

## 同步流程

### 1. 配对（Pairing）

```
手机                       桌面 LAN Server
 │                              │
 │── POST /api/sync/pair ──────>│  { code, clientName, clientNode }
 │<── PairingResponse ──────────│  { token, serverId, manifest }
```

桌面生成短期配对码（显示在设置页或弹窗），手机输入后获取 sync-scoped bearer token。返回的 manifest 让客户端判断是拉 snapshot 还是增量。

### 2. 首轮同步（Snapshot）

```
手机                             桌面
 │                                │
 │── GET /api/sync/snapshot ────>│  Authorization: Bearer <token>
 │<── SyncSnapshot ──────────────│  { entities[], manifest }
 │                                │
 │  写入本地 SQLite + cursor      │
```

客户端拿到所有实体后写本地库，保存 cursor。此时手机可在无网络时独立 RP。

### 3. 增量拉取（Incremental Pull）

```
手机                             桌面
 │                                │
 │── GET /api/sync/changes ─────>│  ?cursor=<token>&limit=200
 │<── ChangeLogPage ─────────────│  { changes[], nextCursor, tail }
```

客户端保存 `nextCursor` 并应用 changes（按 seq 顺序）。如果 `tail === true`，说明客户端已追上服务端。

### 4. 推送（Push）

```
手机                             桌面
 │                                │
 │── POST /api/sync/push ───────>│  { sourceNode, changes[], basisCursor }
 │<── PushResult ────────────────│  { outcomes[], cursor }
 │                                │
 │  应用 accepted，check conflicts│
```

每个 change 返回 `accepted | conflict | rejected`。冲突的 change 携带服务端胜出版本；客户端按冲突策略决定保留副本。

## 冲突策略

| 实体 | 默认策略 | 说明 |
|---|---|---|
| `message` | 自动合并（追加优先） | 消息是 append-only，双端新增自动合入；同 ID 编辑走 last-writer-wins |
| `character/worldbook/chat/preset/settings` | 保留副本 | 双端编辑同实体时，旧版本自动重命名为 `name (conflict yyyy-mm-dd)` |
| 删除 vs 更新 | 删除优先 | 一端删除一端更新时，墓碑胜出（用户可手动恢复） |

冲突策略通过 `MergeEngine` 接口插入，可在不改变传输层的前提下更新决策逻辑。

当前实现状态：`packages/core/src/sync/` 中仅含接口和 `Empty*` 实现（全部抛 `SyncNotImplementedError`）。真实施逻辑在 `dev-sync` 分支上填充。

## 传输层

首版传输层是桌面 LAN 服务（`src-tauri/src/lan.rs` 中的 `/api/sync/*` 路由）。当前路由返回 `501 Not Implemented`——这是有意为之，以便 `dev-sync` 只需添加 handler 代码，无需更改路由注册。

LAN 服务的长期定位是**纯 sync transport**：只提供 REST API（store + sync），不 serve 前端 HTML 页面。SPA 分发功能标为 deprecated，将在移动端 sync 完成后移除。详见 `../mobile-architecture.md#lan-服务定位决策`。

## 相关文件

| 文件 | 说明 |
|---|---|
| `packages/shared/src/types/sync.ts` | 所有 sync 类型定义 |
| `packages/core/src/sync/` | SyncServer / SyncClient / MergeEngine 接口 + Empty* 实现 |
| `apps/desktop/src/sync/index.ts` | 桌面端惰性 sync wiring |
| `apps/desktop/src-tauri/src/lan.rs` | LAN 服务（含 `/api/sync/*` 501 路由） |
| `apps/desktop/src/platform/rest.ts` | REST Backend（store 真实，其余 NotImplemented） |
