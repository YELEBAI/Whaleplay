# 当前改动记录

更新日期：2026-05-26

这份文档整理当前工作区已经完成的主要改动，方便后续提交、回滚核对或继续开发。

## 1. 聊天页 DeepSeek 100 万上下文占用

- 在聊天页右上角 token 统计旁边新增独立的 `1M` 上下文占用进度条。
- 进度条按 1,000,000 token 上下文窗口计算。
- 当前口径为：使用最近一轮 assistant usage 的 `totalTokens`；如果接口没有返回 `totalTokens`，则使用 `promptTokens + completionTokens` 兜底。
- 进度条支持不同占用区间的颜色提示：
  - 低于 75%：绿色
  - 75% 到 90%：黄色
  - 90% 以上：橙色
- Token 统计弹窗内也新增了 `1M Context` 卡片，用于查看当前会话上下文占用比例。
- Token 统计弹窗顶部统计卡片改为紧凑数字格式，例如 `108.5K` / `1.1M`，避免大数字撑出卡片；完整数字保留在 hover 提示中。

主要文件：

- `apps/desktop/src/pages/ChatPage.tsx`

## 2. 聊天 UI 行为一致性

- 用户消息删除时，会同时删除它后面紧跟的一条 assistant 回复，保持问答轮次一致。
- assistant 消息也增加删除按钮。
- 新增批量删除消息能力，避免逐条删除导致状态不同步。
- 新增聊天更新时间触发逻辑，消息新增、更新、删除后会刷新 chat 的 `updatedAt`，会话列表排序更符合实际使用。
- 再生成消息时补上 `reasoningEffort` 参数，使普通发送和重新生成行为保持一致。
- 空会话时将角色首条消息按聊天气泡样式展示，并支持角色头像。

主要文件：

- `apps/desktop/src/pages/ChatPage.tsx`
- `apps/desktop/src/features/chat/chat.store.ts`
- `apps/desktop/src/features/chat/hooks/useSendMessage.ts`
- `apps/desktop/src/db/repositories/message.repository.ts`

## 3. 安全渲染与 CSP

- 移除了聊天侧边块中的 `dangerouslySetInnerHTML`。
- 新增安全渲染逻辑，只允许受控的 `neo-summary` / `neo-thoughts` details 结构。
- `$actions` 类型的侧边块会渲染为可点击按钮，点击后填入输入框。
- Tauri CSP 从 `null` 改为显式策略，限制脚本、对象、frame 等来源，保留必要的图片、IPC、网络连接能力。

主要文件：

- `apps/desktop/src/pages/ChatPage.tsx`
- `packages/core/src/regex/index.ts`
- `apps/desktop/src-tauri/tauri.conf.json`

## 4. localStorage 迁移到 Tauri app-data 存储

- 新增 Tauri sidecar 风格的 app-data JSON 存储，数据写入应用数据目录下的 `store.json`。
- 新增 Tauri commands：
  - `app_store_get`
  - `app_store_set`
  - `app_store_remove`
  - `app_store_entries`
- 新增前端存储适配器：
  - Tauri 环境优先使用 app-data 存储。
  - 浏览器开发环境保留 localStorage fallback。
  - 启动时自动迁移 `neotavern*` 前缀的旧 localStorage 数据。
- 各 repository 从同步 localStorage 读写改为 async storage adapter。
- 主题、隐藏开关、persona、regex、worldbook、preset、chat、message、character 等数据均接入新存储路径。

主要文件：

- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/db/storage.ts`
- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/theme.tsx`
- `apps/desktop/src/db/repositories/*`
- `apps/desktop/src/features/settings/settings.store.ts`
- `apps/desktop/src/pages/PresetPage.tsx`
- `apps/desktop/src/pages/SettingsPage.tsx`

## 5. Persona 与 prompt 构建调整

- 默认角色扮演系统规则改为中文。
- 支持将 `{{user}}` 和 `<user>` 都替换为当前 persona name。
- 对话格式规则改为中文，并在 prompt 末尾追加关键格式提醒。
- 首条角色消息在无历史消息时作为 assistant message 加入 prompt。
- `reasoningEffort` 不再混入用户消息内容，而是作为 system message 注入，避免污染用户原文。
- 已同步调整 prompt builder 测试期望。

主要文件：

- `packages/core/src/prompt/prompt-builder.ts`
- `packages/core/src/prompt/__tests__/prompt-builder.test.ts`

## 6. 角色管理页 UI 调整

- 角色列表从“点击即编辑”调整为“选择查看 / 单独编辑”。
- 新增选中态，默认选中第一个角色。
- 角色列表支持头像缩略图。
- 新增 `New Character` 入口，编辑和查看模式分离。
- 新建角色后自动选中新角色。
- 删除当前选中角色时会清空选中态。

主要文件：

- `apps/desktop/src/pages/CharacterPage.tsx`

## 7. 内置内容与启动脚本

- 新增内置角色 `Seraphina`。
- 新增 `艾尔多利亚` worldbook 及相关条目。
- 新增 Seraphina 头像资源。
- 内置 regex 增加 `$actions` 规则，用于把“请选择下一步行动”列表渲染为按钮。
- 新增一键安装启动脚本 `setup.ps1` / `一键安装启动.bat`。
- 删除旧的 `launch.bat`、`launch.ps1`、`start.bat`。

主要文件：

- `apps/desktop/src/app/seed.ts`
- `apps/desktop/public/avatars/seraphina.png`
- `setup.ps1`
- `一键安装启动.bat`
- `launch.bat`
- `launch.ps1`
- `start.bat`

## 8. 预设条目排序与 prompt 映射

- 预设页面的每个 prompt 条目支持拖拽排序。
- 拖拽实现改为自定义 pointer 事件，不依赖浏览器原生 drag/drop，避免 Tauri/WebView 中出现禁止放置标志。
- 拖动时会显示插入线，松手后按插入位置重排。
- 保留上移 / 下移按钮作为备用排序方式。
- 排序会真实写回 preset item 的 `injectionOrder`，并统一重新编号为 `10 / 20 / 30 ...`。
- prompt builder 已按 `injectionOrder` 注入 preset items，因此页面顺序会真实影响提示词组成。
- preset 导出时也按 `injectionOrder` 输出，导出 JSON 顺序与实际提示词顺序一致。
- 新增测试确保 preset items 按 `injectionOrder` 注入。

主要文件：

- `apps/desktop/src/pages/PresetPage.tsx`
- `apps/desktop/src/features/preset/preset.store.ts`
- `apps/desktop/src/db/repositories/preset.repository.ts`
- `packages/core/src/prompt/__tests__/prompt-builder.test.ts`

## 9. 全局 scrollbar 优化

- 全局原生 scrollbar 改为更细、更低对比度的圆角样式。
- 支持亮色 / 暗色主题变量，手动切换主题时颜色也会同步。
- Radix `ScrollArea` 组件的滚动条同步改为柔和 thumb，去掉硬边框感。
- 覆盖聊天页、弹窗、侧栏、设置页、预设页、世界书页等所有使用原生 overflow 或 `ScrollArea` 的位置。

主要文件：

- `apps/desktop/src/index.css`
- `packages/ui/src/scroll-area.tsx`

## 10. 已执行验证

已执行并通过：

```bash
pnpm --filter @neo-tavern/desktop exec tsc -p tsconfig.json --noEmit --incremental false
pnpm --filter @neo-tavern/core test
```

此前还执行过：

```bash
cargo check
pnpm --filter @neo-tavern/desktop test
```

备注：`pnpm --filter @neo-tavern/desktop test` 当前没有发现测试用例，命令正常结束。
