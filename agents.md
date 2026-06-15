# Whale Play 项目协作约束

本文档给后续 AI agent 或开发协作者快速建立上下文。若与源码或 `package.json` 冲突，以源码和根目录 `package.json` 为准，并同步更新本文档。

## 项目概览

Whale Play 是一个 Tauri v2 + React monorepo 桌面应用，核心场景是角色卡创作和角色扮演聊天。主要功能包括角色卡管理、世界书、预设提示词、用户人设、Agentic Play、Whale Builder、正则后处理、图片生成和用量统计。

## 目录结构

```text
apps/desktop/         Tauri 桌面应用，包含 React 前端和 Rust 后端
packages/core/        提示词构建、模型 provider、正则、世界书、记忆、树 diff
packages/shared/      共享 TypeScript 类型和轻量工具
packages/ui/          共享 UI 组件
docs/zh/              中文文档
docs/en/              英文文档
```

关键约束：

- `core` 不依赖 React、DOM 或 `ui`，保持可在 Node/Vitest 中独立测试。
- `shared` 是底层类型包，供 `core`、`ui`、`desktop` 使用。
- `desktop` 是应用入口，组合三个 workspace 包、Zustand store、页面组件、Tauri IPC 和仓库层。
- 文档改动通常需要同步中文和英文版本。
- 尊重工作区已有未提交改动，修改前先查看相关文件，不覆盖他人现场。

## 工具链

环境约束：

- Node.js >= 24
- pnpm workspace
- Rust stable 仅在 Tauri 原生开发或打包时必须
- make 是可选入口

常用命令：

```bash
pnpm dev
pnpm tauri dev
pnpm build
pnpm build:desktop
pnpm test
pnpm lint
pnpm --filter @neo-tavern/desktop exec tsc --noEmit
pnpm --filter @neo-tavern/core exec tsc --noEmit
```

Makefile 入口：

```bash
make deps
make dev
make tauri
make lint
make
make install
make clean
```

## 工具与技能系统

Agentic Play 工具定义在 `apps/desktop/src/features/agentic-play/agentic-play.ts`：

- `roll_dice`：真实掷骰，支持 `success_probability` 到 1d20 DC 的转换。
- `present_player_options`：在玩家选择断点展示恰好 5 个结构化行动选项，每项需要成功率和 DC。
- `update_game_state`：深度合并结构化游戏状态补丁。

Agentic Play 每轮最多 `AGENTIC_PLAY_MAX_TOOL_ROUNDS = 8` 个工具回合。选项应通过工具进入 UI；正文中的内联选项会被清理，必要时用修复提示强制模型调用选项工具。

Whale Builder 工具注册在 `apps/desktop/src/features/character/builder/tool-registry.ts`：

- 通用工具：`read_skill_reference`、`validate_character_draft`、`save_character_draft`、`list_skill_references`、`evaluate_character_draft`、`record_entry_output`
- Chat 专用工具：`ask_user_options`、`present_creation_plan`、`web_search`

Builder 内置 skill 位于 `apps/desktop/src/features/character/builder/skill/`。参考文档在 `references/`，模板和状态栏素材在 `assets/`。模型应先读取 `SKILL.md`，再按需读取 reference，最终通过 `save_character_draft` 保存草稿。

## 当前进度与待办

已知近期重点：

- P0：消息分页与内存控制，避免长会话撑爆内存。
- P0：将 Zustand store 迁移到 persist 中间件，消除多处手动 load。
- P1：拆分 `settings.store`。
- P1：迁移到 Tauri 官方 `plugin-store`。
- P1：拆分 `pages/chat/utils.tsx`。
- P2：记忆增量压缩、内容安全过滤。
- P3：CI、测试补齐、文档建设。

服务端化方向：

- `db.rs`、`search.rs`、`comfy.rs` 基本是纯函数，可被 Tauri 和独立 server 复用。
- `file.rs` 主要依赖 `app.path()`，后续可改为路径注入或环境变量。
- `lan.rs` 已有 actix-web 服务基础，可增加 REST endpoint。
- 前端 `storage.ts` 已具备 Tauri -> REST -> localStorage 三级降级思路。

## 更新约定

- 新增工具时，同步更新源码定义、执行分支、工具 spec、测试和 `docs/*/developer/tools-and-skills.md`。
- 改动环境要求时，同步更新 `package.json`、README、贡献指南和双语构建文档。
- 新增用户可见功能时，同步更新中英文 guide、locales 和必要截图。
- 修复核心逻辑时优先补 `packages/core` 测试；修复 UI 流程时优先补 `apps/desktop` 测试。
