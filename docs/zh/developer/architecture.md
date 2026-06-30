# 架构

Whale Play 是一个 **Tauri v2 + React monorepo** 桌面应用，用于角色卡创建和角色扮演聊天。本文档描述了 monorepo 的目录结构、包依赖流向以及关键设计决策。

## Monorepo 目录结构

```
Neo/
├── apps/
│   └── desktop/                  # Tauri 应用
│       ├── src/                  #   React 前端源码
│       │   ├── app/              #     应用入口、主题 store、路由、种子数据
│       │   ├── components/       #     共享 UI 组件（Layout、LoginGate 等）
│       │   ├── db/               #     存储抽象层与仓库
│       │   │   └── repositories/ #       按实体的数据访问层
│       │   ├── features/         #     功能模块
│       │   │   ├── character/    #       角色管理
│       │   │   ├── chat/         #       聊天 store、类型、记忆工具
│       │   │   ├── preset/       #       提示词预设管理
│       │   │   ├── settings/     #       模型配置、正则规则、世界书
│       │   │   ├── billing/      #       用量成本跟踪
│       │   │   ├── image-generation/
│       │   │   └── agentic-play/ #       实验性游戏主持人模式
│       │   ├── pages/            #     页面级组件
│       │   │   ├── chat/         #       聊天 UI 子组件
│       │   │   ├── neo-builder/  #       角色构建器页面
│       │   │   └── settings/     #       设置页面
│       │   ├── i18n/             #     i18next 初始化
│       │   ├── locales/          #     翻译 JSON 文件（en, zh）
│       │   └── utils/            #     小型工具（解析、通知）
│       └── src-tauri/            #   Rust/Tauri 后端（命令、插件、SQLite）
├── packages/
│   ├── core/                     # 核心逻辑：提示词构建、正则、记忆、世界书
│   ├── shared/                   # 共享 TypeScript 类型与工具
│   └── ui/                       # 基于 Radix 的 UI 组件库
├── pnpm-workspace.yaml
├── package.json
├── eslint.config.mts
└── tsconfig.base.json
```

## 依赖流向

依赖图遵循严格的**自底向上层级结构**：

```
desktop (@neo-tavern/desktop)
  ├── core (@neo-tavern/core)          →  shared (@neo-tavern/shared)
  └── ui   (@neo-tavern/ui)            →  shared (@neo-tavern/shared)
```

### 包

| 包                    | 依赖                     | 用途                                                                                                                                                |
| --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@neo-tavern/shared`  | —                        | 纯 TypeScript 类型、接口和小型工具。零运行时依赖。                                                                                                  |
| `@neo-tavern/core`    | `shared`                 | 提示词构建、chat-engine、插件注册表、flood guard、正则规则处理、世界书解析、长期记忆、token 估算。无 DOM 或 UI 依赖。可在 Node 中用 `vitest` 测试。 |
| `@neo-tavern/ui`      | `shared`、Radix 基础组件 | 可复用的组件库：按钮、卡片、对话框、文本域、滚动区域、通知。                                                                                        |
| `@neo-tavern/desktop` | `core`、`shared`、`ui`   | Tauri 应用——通过 Tauri IPC 连接的 React 前端、功能 store、页面组件和仓库。                                                                          |

### 关键规则

- **`core` 没有任何 UI 依赖。** 它不会从 `ui` 或 `react` 导入任何内容。这使得提示词处理和正则逻辑可以在纯 Node 环境中进行测试。
- **`desktop` 是唯一的消费者**，它导入所有三个包。`apps/desktop/src/features/` 内部的功能模块持有 Zustand store 和页面特有逻辑。
- **`shared` 是一个叶包。** 只有 `core`、`ui` 和 `desktop` 依赖它。

## 打包与构建流水线

- `pnpm-workspace.yaml` 将 `apps/*` 和 `packages/*` 注册为 workspace 包。
- 每个包定义自己的 `tsconfig.json`，继承根目录的 `tsconfig.base.json`。
- `@vitejs/plugin-react` 插件处理 desktop 应用中的 React JSX 编译。
- `core` 直接导出其源码（`"main": "./src/index.ts"`），以便 Vite 可以将其与应用程序内联编译——开发期间 workspace 包无需单独的构建步骤。

## 文件夹约定

```
apps/desktop/src/features/{feature}/
├── {feature}.store.ts       # Zustand store
├── {feature}.types.ts       # 功能特有类型
└── [...]                    # 钩子、工具、子组件
```

仓库遵循同样的模式：

```
apps/desktop/src/db/repositories/
├── {entity}.repository.ts   # 通过存储抽象层进行 CRUD 操作
└── index.ts                 # 重新导出
```

页面是精简的组件，负责组合功能 store 和仓库函数。

## Chat 功能分层

聊天功能拆成两层：

- `apps/desktop/src/pages/chat/`：页面和 UI 组件，负责布局、消息渲染、输入框、右侧栏、图片块、Agentic 选项等用户界面。
- `apps/desktop/src/features/chat/`：桌面端 chat 逻辑，负责 store、消息生命周期、上下文组装、生成、记忆、图片任务和 worldbook 适配。

`features/chat` 里的关键文件：

| 文件                       | 责任                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `hooks/useSendMessage.ts`  | React facade。只处理发送/重新生成命令、store callback 和 UI 入口参数。               |
| `assistant-turn-runner.ts` | 一轮 assistant 回复的公共生命周期：组装上下文、创建草稿、生成、收尾。                |
| `context-assembler.ts`     | 将 preset、memory、worldbook、Agentic 状态、健康模式和 flood hook 组合成模型上下文。 |
| `generation-runner.ts`     | 普通/Agentic 生成、stream/non-stream 处理、debug prompt、空回复 retry、usage 记录。  |
| `memory-planner.ts`        | 长期记忆摘要和缓存复用；后续 RAG / 新压缩策略应优先接在这里。                        |
| `auto-image-runner.ts`     | assistant 回复完成后的自动图片规划和 ComfyUI 生成。                                  |
| `turn-finalizer.ts`        | 健康模式输出拦截、通知、自动图片触发、错误文案映射。                                 |
| `turn-runtime.ts`          | 单 chat 生成任务互斥、abort 和 Zustand 生成状态。                                    |
| `worldbook-context.ts`     | 统一角色绑定 worldbook 优先于全局 active worldbook 的选择规则。                      |

这个边界的目标是：页面不关心模型调用细节，生成 runner 不关心 React，未来 RAG、压缩或插件能力可以接入 context/memory/chat-engine 层，而不是继续扩大 `ChatPage` 或 `useSendMessage`。

## Chat Engine 与插件雏形

`packages/core/src/chat-engine/` 提供跨平台的 turn engine、事件、strategy 和 plugin registry。当前 desktop 仍有一层适配逻辑，但 core 已有最小插件雏形：

```typescript
import { ChatPluginRegistry, createFloodGuardPlugin } from "@neo-tavern/core";

const registry = new ChatPluginRegistry();
registry.register(createFloodGuardPlugin());
```

插件可以挂在这些点上：

- `onBeforePromptBuild`：prompt 组装前调整 turn context。
- `onContextBlocks`：追加、过滤或排序上下文块。
- `onContentDelta` / `onReasoningDelta`：观察流式输出。
- `inspectOutput`：检查累计输出，可用于 flood guard 这类中止型插件。
- `onAfterTurn`：生成完成后的统计、日志或副作用。

短期内，插件系统用于内置能力的结构化接入；不要把它当成完整插件市场或第三方沙箱。`flood guard` 是第一个示例插件。
