# TODO

> 2026-06-15 根据 README、docs、当前代码结构与移动端设想重新梳理。
> 2026-06-16 更新：sync 骨架完成（接口+空实现+LAN路由+文档），详见下文。

## 待完成

### P0 - 移动端离线同步路线

目标：移动端是一套独立 UI，两种运行模式。

1. 局域网在线：手机自动发现电脑端 LAN，配对后同步角色、聊天、世界书、预设、设置、消息树、用量记录等数据。
2. 离线本地：同步完成后，手机本地保存完整数据和必要逻辑；电脑关机后手机仍可继续 RP。
3. 回连合并：电脑重新在线后，手机端离线期间新增的消息、角色修改、世界书修改能安全合并回桌面端。

#### 推荐分支协作

| 分支 | 负责人倾向 | 职责 | 合并节奏 |
| --- | --- | --- | --- |
| `dev` | 主桌面开发 | 继续桌面端逻辑抽离、Backend 接口收口、sync schema、LAN API、测试 | 所有共享协议和 core 逻辑先合入 `dev` |
| `dev-sync` | 可由主桌面或两人协作 | 专门实现同步协议、变更日志、冲突策略、LAN 配对、端到端同步测试 | 稳定后合入 `dev`，再由 `dev-mobile` 跟进 |
| `dev-mobile` | 移动端主开发 | 移动端工程、移动 UI、移动本地数据库、移动端 sync client、功能对齐 | 定期从 `dev` rebase/merge，避免协议漂移 |
| `spike-mobile-rn` | 临时验证 | React Native spike：SQLite、流式请求、LAN 发现、聊天 UI、Android 真机体验 | 只保留结论，不长期维护 |
| `spike-mobile-rn-harmony` | 临时验证 | RN 鸿蒙社区分支 spike：SQLite、HTTP streaming、LAN 发现、基础聊天 UI | 只验证鸿蒙可行性和坑点，不切 ArkUI |
| `mobile-alpha` | 发布候选 | 汇总可用的移动端 alpha：登录/配对/同步/本地 RP/回连合并 | 从 `dev-mobile` 切出 |

原则：

- `dev` 不等待移动端 UI 选型，先把可复用逻辑和同步协议做出来。
- `dev-mobile` 不直接复制桌面页面，先对齐能力：角色列表、聊天页、设置/API Key、本地存储、LAN 同步。
- spike 分支只回答问题，不背长期维护成本。
- 不把手机浏览器 WebView 套壳作为正式方案。

#### 实现阶段

| 阶段 | 交付物 | 说明 |
| --- | --- | --- |
| 0. 决策记录 | `docs/mobile-architecture.md` | ✅ 已完成：目标/非目标/技术栈/sync原则/LAN定位决策/验收标准 |
| 1. 共享模型收口 | `packages/shared` 的 sync 类型、实体版本字段、tombstone 字段 | ✅ **类型骨架完成**（`sync.ts` + `revision?/deletedAt?` 已追加到所有实体）；`dev-sync` 分支接续实现变更日志持久化 |
| 2. 逻辑抽离 | `packages/core` 继续承接 prompt、regex、worldbook、memory、model-provider 纯逻辑 | ⏳ sync 接口已并入 core（`core/src/sync/`）；`useSendMessage` 大抽离待阶段 2 host 端口完成后再做 |
| 3. 桌面端同步服务 | `/api/sync/manifest`、`/api/sync/snapshot`、`/api/sync/changes`、`/api/sync/push`、`/api/sync/pair` | ✅ **路由骨架完成**（5 条 501 stub 已注册到 `lan.rs`）；`platform/rest.ts` REST Backend 也已完成（store 真实、其余 NotImplemented） |
| 4. 变更日志 | append-only change log 或 per-entity revision | 所有可同步写入产生 revision；删除走 tombstone；支持 since cursor |
| 5. 移动端本地库 | SQLite schema + repository adapter | 移动端不依赖桌面在线；本地消息树、角色、世界书完整可读写 |
| 6. 首轮同步 | 手机配对后拉 manifest + snapshot | 先做单向桌面到手机，确保手机能离线打开角色和历史聊天 |
| 7. 本地 RP | 手机本地设置 API Key，直接请求模型并写入本地消息库 | 电脑关机后仍能继续普通聊天；先不做 Builder 和复杂图片生成 |
| 8. 回连合并 | 手机 push 离线 changes，桌面返回 accepted/conflict | 消息追加优先自动合并；同一实体双端编辑保留 conflict copy |
| 9. 功能对齐 | 正则显示、世界书召回、用户人设、预设、记忆摘要、Agentic Play 子集 | 按聊天体验优先级逐步补齐 |
| 10. alpha 验收 | 小米 Android + HarmonyOS NEXT 真机 smoke test | 主线 RN；鸿蒙走 RN 社区分支；验收同步、断网、电脑关机、继续 RP、回连、冲突提示 |

#### 技术栈判断

| 方案 | 优点 | 风险 | 当前建议 |
| --- | --- | --- | --- |
| React Native | 最可能复用 TypeScript 类型和部分 core 逻辑；Android 生态成熟；团队容易从 React 迁移；已有鸿蒙社区分支可验证 HarmonyOS NEXT | 原生模块质量参差；复杂列表、输入法、流式请求和后台状态要实测；鸿蒙社区分支要确认可维护性 | **已选主路线** |
| HarmonyOS NEXT 原生 ArkUI | 贴合鸿蒙设备，系统体验和本地能力理论上最稳 | 新技术栈；小米 Android 无法复用；共享 TS 逻辑困难 | 现阶段不考虑；只有 RN 用得明显不顺手时再回头评估 |
| ArkUI-X | 理论上跨端，和鸿蒙倾向一致 | 生态、调试资料、第三方库和长期维护不确定 | 现阶段不考虑 |
| Flutter | Android/iOS 稳定，UI 一致性强 | Dart 重写业务逻辑，复用现有 TS core 成本高；团队已有 React/Tauri 资产浪费 | 不优先 |
| Tauri mobile / WebView 壳 | 复用 Web UI 看似快 | 手机 WebView 版本碎片大；输入法、长列表、后台、文件和权限都会难受 | 不作为正式方案 |

#### RN 首版实现路径

| 模块 | 首版目标 | 复用/新增 |
| --- | --- | --- |
| 工程骨架 | `apps/mobile`，React Native + TypeScript，接入 workspace 包 | 复用 `packages/shared` 类型；逐步复用 `packages/core` |
| 本地存储 | 移动端 SQLite repository adapter | 新增 mobile storage/repository；接口尽量贴近 desktop repository |
| 同步客户端 | LAN 配对、snapshot 拉取、changes 拉取、离线 changes push | 新增 `mobile sync client`；协议由 `dev-sync` 提供 |
| 聊天核心 | 普通聊天、流式输出、停止生成、消息编辑/删除/重新生成 | 复用 model-provider/prompt/regex/worldbook 逻辑；移动 UI 新写 |
| 角色与设置 | 角色列表/详情、API Key、模型配置、用户人设、预设选择 | UI 新写；数据结构复用 |
| 鸿蒙适配 | RN 鸿蒙社区分支能跑基础聊天和同步 | 单独记录不兼容模块；必要时对 SQLite/网络/文件能力做平台 adapter |

### P0 - 桌面端同步前置工作

| 优先级 | 项目 | 现状 | 下一步 |
| --- | --- | --- | --- |
| P0 | Tauri / REST Backend 抽象收口 | `Backend` 接口存在，但目前只有 Tauri 实现；LAN 只暴露 `/api/store` | 补 `platform/rest.ts`；把 db/search/comfy/file 的安全子集映射为 REST；为移动端 sync 复用同一协议 |
| P0 | 聊天长会话分页与内存控制 | 消息已迁 SQLite；`loadChat` 先拉最近 80 条再后台 hydrate；Rust 查询仍有 `LIMIT 1000` | 增加 cursor/offset 分页 API；Chat store 只保留可见窗口和活跃分支路径；万条消息压测 |
| P0 | 生成任务后台化 | `generationTaskRunner` 已能按 chat 管理任务；流式请求仍在页面 hook 内 | 做全局任务中心/队列；路由切换不打断生成；支持停止、恢复、错误重试和通知 |
| P0 | Node 版本要求统一 | README 写 22+，安装文档写 18+，构建文档写 20+，`package.json` 要求 `>=24` | 决定最低版本；同步 README、docs、setup 脚本和 package engines |

### P1 - 桌面维护与体验

| 优先级 | 项目 | 现状 | 下一步 |
| --- | --- | --- | --- |
| P1 | Zustand persist 第二阶段 | `settings.store` 已拆 slice 并接入 partial persist；仍有多处手动 load | 明确哪些状态由 repository 加载，哪些用 persist；必要时接入 `storage.ts` 自定义 async storage |
| P1 | ChatPage 拆分 | `pages/chat/` 已有多个子组件和 hooks；`ChatPage.tsx` 仍过重 | 拆 header/runtime controls、消息操作、统计面板、Agentic 区块 |
| P1 | 聊天渲染虚拟化 | `VirtualList.tsx` 已存在；聊天 transcript 仍直接渲染 `visibleMessages` | 接入 VirtualList；处理动态高度、图片加载后重测、自动滚到底、分支跳转定位 |
| P1 | 角色页快捷操作 | 角色页已有右键/更多菜单和详情弹窗；菜单基本只有“详情” | 补开始普通聊天/Agentic、编辑、复制、导出、删除、Builder；整理 i18n |
| P1 | LAN/浏览器模式产品化 | 已有 LAN 开关、密码和 `/api/store` | 增加运行状态刷新、重启提示、复制访问地址、鉴权说明和安全边界 |
| P1 | Tauri store 方案复核 | 依赖里已有 `@tauri-apps/plugin-store`，但当前仍用自定义 `app_store_*` 和 SQLite/JSON 混合存储 | 决定保留自定义层还是迁移官方 plugin-store；补迁移测试 |

### P2 - 功能增强

| 优先级 | 项目 | 现状 | 下一步 |
| --- | --- | --- | --- |
| P2 | 记忆增量压缩 | `core/memory`、记忆设置和聊天注入已有基础 | 按 token/轮数阈值触发摘要；支持专用压缩模型；避免摘要覆盖未确认事实 |
| P2 | 内容安全与提示词护栏 | prompt pipeline 已有 `safety` context block 类型 | 做可配置安全规则、敏感内容提示、角色卡导入校验和调试预览 |
| P2 | CI 与发布自动化 | Vitest 测试已覆盖 core、chat、builder、agentic 等关键模块 | GitHub Actions：lint/test/build；Tauri 打包 release；覆盖率和日志上传 |
| P2 | 文档与截图维护 | 中英文 docs 已成型，但仍有占位链接和版本要求不一致 | 修正文档链接；补真实截图；同步新增 Agentic/Builder/图片生成流程 |
| P2 | 独立服务端模式 | `lan.rs` 已有 actix-web；`db.rs/search.rs/comfy.rs` 基本可复用，`file.rs` 仍依赖 `app.path()` | 新增 server binary；路径注入改为配置；为 REST backend 跑端到端 smoke test |

## 已完成 / 已观察到的进展

- Settings store 已拆成 `model-config`、`regex`、`preferences` slices。
- 消息存储已有 SQLite、parentId 迁移、最近消息加载和长会话 fixture。
- `generationTaskRunner` 已出现，说明聊天生成后台化有了第一块地基。
- `Backend` 接口已存在，前端原生能力已经开始从 Tauri invoke 中抽象出来。
- `storage.ts` 已有 Tauri -> REST -> localStorage 三层回退。
- LAN 已有开关、密码、登录和 `/api/store`。
- Agentic Play 已有结构化选项、掷骰、状态栏、隐藏动作消息和较完整测试。
- Whale Builder 已整合内置 skill、状态栏/MVU 引用和保存流程。
- 项目文档已经覆盖架构、存储、prompt pipeline、工具/技能、i18n、构建和用户指南。

### 本轮骨架新增（2026-06-16）

- `packages/shared/src/types/sync.ts` — sync 协议契约类型（Revision、SyncEntity、SyncManifest、ChangeRecord、PushResult、Pairing 等）。
- 可同步实体（Character/Chat/Message/Preset/Worldbook）追加可选 `revision?` / `deletedAt?` 字段。
- `packages/core/src/sync/` — SyncServer/SyncClient/MergeEngine 接口 + Empty* 空实现 + 10 个 stub 测试。
- `apps/desktop/src/sync/index.ts` — 桌面端惰性 sync wiring（getSyncServer/getSyncClient/setSync/useSync）默认构造 Empty*。
- `apps/desktop/src/platform/rest.ts` — REST Backend（store 真实 HTTP 镜像，db/search/comfy/file 返回 NotImplemented）。
- `apps/desktop/src/platform/index.ts` — 加 `setBackend()` 访问器。
- `src-tauri/src/lan.rs` — `/api/sync/*` 5 条 501 路由 stub。
- `docs/zh/developer/sync.md` — sync 协议设计文档（实体边界、流程、冲突策略、传输层）。
- `docs/mobile-architecture.md` — 移动端架构决策记录（目标/非目标/技术栈/LAN 定位/验收标准）。
- `CONTRIBUTING.md` — 补测试放置约定 + 项目结构。
- LAN 服务定位已决策：长期纯 sync transport，SPA 分发标为 deprecated（见 `docs/mobile-architecture.md#5`）。
- sync 协议和独立服务端模式是否共用同一套 REST/sync 协议：**已决策共用**（sync 接口传输中立，LAN 和独立 binary 都挂 `/api/sync/*`）。

## 待规划

- RN 鸿蒙社区分支的可维护性边界：SQLite、HTTP streaming、后台、输入法、长列表、文件/图片能力逐项验证。
- 同步冲突 UI：同一角色/世界书/预设双端编辑时，是保留副本、弹窗选择，还是按字段合并。
  → 已决策：**保留副本**（自动重命名为 `name (conflict yyyy-mm-dd)`），不弹窗。
- 账号体系：局域网配对是否足够，未来是否需要云同步账号。
- 加密策略：手机本地数据库、桌面 LAN 传输、API Key 是否需要额外加密。
- 附件同步：头像、图片生成结果、导入文件、Builder workspace 是否纳入首版移动同步。
- Agentic Play 移动端首版范围：只读状态栏 + 选项按钮，还是完整状态编辑/调试。
- Builder 移动端首版范围：暂不做、只查看、还是能完整创建角色卡。
  → 已决策：首版**只查看**已创建的角色卡，不做引导式创建。
- 独立服务端模式和移动端同步是否共用同一套 REST/sync 协议。
  → 已决策：**共用**（sync 接口传输中立，LAN 和独立 binary 都挂 `/api/sync/*`）。

## 设想

- 搭建 CDN / release 下载镜像，改善国内安装体验。
- 给 issue 和 PR 接 AI 机器人，做 triage、摘要、初步 review，类似 dosubot / sourcery。
- 补更多模型提供商预设和连接诊断。
- 为世界书、预设、角色卡做批量导入导出和冲突合并。
- 移动端后续支持局域网多设备互传，不强依赖桌面端作为唯一主机。
- 远期做可选云同步，但本地优先和离线 RP 不能被云能力绑架。
