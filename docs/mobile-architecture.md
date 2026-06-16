# 移动端架构决策记录

本文档记录 Whale Play 向移动端扩展的架构决策，包括技术栈选择、同步原则、功能对齐策略和验收标准。它是一个活文档——新的决策通过 PR 追加到下面，旧的决策保留但可标为 superseded。

## 1. 目标与非目标

### 目标

- **局域网在线 RP**：手机自动发现同一局域网内的桌面端，配对后同步全部角色/聊天/世界书/预设/设置数据。
- **离线本地 RP**：同步完成后，手机本地保存完整数据和纯逻辑；桌面关机后手机仍可继续 RP。
- **回连合并**：桌面重新在线后，手机端离线期间产生的新消息和修改安全合并回桌面端。

### 非目标（首版不做）

- 云同步账号体系
- 完整 Builder（仅查看角色卡，不含引导式创建）
- 完整 Agentic Play 状态编辑（仅读状态栏 + 行动选项）
- 图片生成
- 附件同步（头像、Builder workspace）
- Tauri mobile / WebView 壳方案

## 2. 技术栈选择

React Native 已被选为主路线，判断依据见 `../todo.md#技术栈判断`。

| 层 | 方案 | 复用/新增 |
|---|---|---|
| 工程骨架 | `apps/mobile`，React Native + TypeScript，接入 workspace 包 | 复用 `@neo-tavern/shared` 类型和 `@neo-tavern/core` 纯逻辑 |
| 本地存储 | 移动端 SQLite repository adapter | 新增；接口尽量贴近 desktop repository |
| 同步客户端 | LAN 配对、snapshot 拉取、changes 拉取、离线 changes push | 新增；协议由 `@neo-tavern/core` sync 接口定义 |
| 聊天核心 | 普通聊天、流式输出、停止生成、消息编辑/删除/重新生成 | 复用 model-provider/prompt/regex/worldbook 核心逻辑 |
| 角色与设置 | 角色列表/详情、API Key、模型配置、用户人设、预设选择 | UI 新写；数据结构复用 |

## 3. sync 设计原则

完整的 sync 协议契约见 `docs/zh/developer/sync.md`。这里只摘要架构级决策：

- **服务端（桌面端）**：维护 append-only 变更日志；通过 LAN HTTP 暴露 `/api/sync/*` endpoint。
- **客户端（移动端）**：先拉 manifest → snapshot（首轮）或 changes（增量），push 本地离线变更。
- **冲突**：消息追加自动合并；同实体双端编辑保留冲突副本（重命名为 `name (conflict yyyy-mm-dd)`）。
- **墓碑**：删除操作不删实体，设置 `deletedAt`；客户端自行决定软删除展示或永久清理。
- **接口**：`SyncServer`/`SyncClient`/`MergeEngine` 定义在 `packages/core/src/sync/`，传输层可换插。

## 4. 存储架构

桌面端有两套存储：KV（store.json）用于角色/聊天/预设/世界书/设置/记忆，SQLite 用于消息和 Agentic Play 状态。移动端统一用 SQLite（RN 生态成熟），但 repository 接口贴近桌面端以确保 sync 映射简单。

```
移动端 SQLite
  ├── characters 表（字段对齐 Character interface）
  ├── chats 表
  ├── messages 表（含 parentId 树结构 + revision/deletedAt）
  ├── presets 表
  ├── settings 单例行
  └── sync_cursor 行（记录上次同步位置）
```

## 5. LAN 服务定位决策

**决策日期**：2026-06-16

**背景**：桌面端 LAN 服务（`src-tauri/src/lan.rs`）目前有三类功能：(A) 分发前端 HTML/SPA 给浏览器访问，(B) 提供 REST `/api/store` 给开发调试，(C) 将提供 `/api/sync/*` 给移动端同步。

**决策**：

| 功能 | 决策 | 理由 |
|---|---|---|
| A. SPA 分发 | **逐步萎缩，标为 deprecated** | 留着会给"手机浏览器 RP"留假希望；移动端是 native App 不走浏览器；和"不套 WebView 壳"的既定方向冲突 |
| B. `/api/store` | **保留** | 开发调试（`db/storage.ts` 三层回退）仍然需要；sync 实现前这是 LAN 唯一的 data 暴露面 |
| C. `/api/sync/*` | **未来唯一核心** | 移动端 sync transport 是 LAN 存在的理由 |

**LAN 长期定位**：纯 sync transport。服务端只暴露 REST API（store + sync），不 serve 前端 UI HTML。SPA 分发功能在移动端 sync 完成后移除。

## 6. 分支与协作

见 `../todo.md#推荐分支协作`。核心原则：

- `dev` 不等待移动端 UI 选型，先把可复用逻辑和 sync 协议做出来。
- `dev-mobile` 不直接复制桌面页面，先对齐能力（角色列表、聊天页、设置、本地存储、LAN 同步）。
- spike 分支只回答问题，不背长期维护成本。
- 不把手机浏览器 WebView 套壳作为正式方案。

## 7. 验收标准（alpha）

- **平台**：小米 Android + HarmonyOS NEXT 真机
- **场景**：
  1. 配对桌面 → 拉取完整数据（角色、聊天历史、世界书、预设、设置）
  2. 电脑关机 → 手机独立 RP（流式生成、消息保存）
  3. 电脑重连 → 手机 push 离线变更 → 桌面显示合并结果 → 无数据丢失
  4. 同一角色双端编辑 → 冲突提示 → 保留副本
- **性能**：1000 条消息的聊天首轮同步 < 30 秒；增量同步 < 5 秒

## 8. 待决策项

以下问题保留在此等待后续决策：

| 问题 | 状态 | 备注 |
|---|---|---|
| revision 生成策略（updatedAt+hash vs Lamport） | 待定 | 首版用 hash，同步性能后再决定是否升级 |
| 冲突 UI（弹窗选 vs 自动保留副本） | 待定 | 目前按"保留副本"策略，不弹窗 |
| 账号体系（LAN 配对是否足够） | 待定 | 先不做云同步账号 |
| 加密策略（本地数据库 + LAN 传输 + API Key） | 待定 | 首版不加密 |
| 独立服务端模式（无 Tauri 常驻 binary） | 以后再做 | 和移动端 sync 是不同的产品形态 |
