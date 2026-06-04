# Whale Play

![Whale Play](apps/desktop/src-tauri/icons/128x128.png)


![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript)
![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Whale Play 是一个面向角色卡创作和角色扮演聊天的桌面应用。它把角色卡、世界书、预设提示词、长上下文聊天、实验性主持人模式和 Whale Builder 创作工作流放在同一个本地客户端里。

项目基于 Tauri v2、React、TypeScript、Vite 和 pnpm workspace 构建，模型接口使用 OpenAI-compatible API，可接入 DeepSeek、OpenAI 兼容服务或其他同协议模型。

## 当前重点

- 角色卡聊天：多角色、多会话、开场白、消息编辑、删除、复制、重新生成和停止生成。
- Agentic Play 实验模式：使用专用主持人提示词、结构化场景状态、真实骰子工具和可点击行动选项。
- Whale Builder：通过聊天式流程生成角色卡、世界书、性格调色盘、创作规划和可保存产物。
- 世界书：管理世界书与条目，按上下文召回并注入提示词。
- 预设提示词：管理 system/user prompt 卡片，支持排序、启用/禁用、导入和导出。
- 正则后处理：把模型输出拆成正文、展示块、图片标记、按钮等前端结构，并可控制是否进入下一轮提示词。
- 用量与调试：显示 token、缓存命中、费用估算、Prompt Preview 和调试 prompt 文件。

## Prompt 注入管线

聊天提示词由 `@neo-tavern/core` 的 `buildChatPrompt` 按以下顺序构建：

```text
┌─ 1. System Rules（默认或自定义系统规则）
├─ 2. Preset Items（预设提示词卡片，按 injectionOrder 排序后合并为单条消息）
├─ 3. Character Block（角色名、描述、性格、场景、示例对话）
├─ 4. User Persona（用户人设）
├─ 5. Before-History Context Blocks（position: "beforeHistory"）
│    └─ 来源：worldbook（前置世界书）、memory（记忆摘要）、safety 等
├─ 6. Chat History（消息历史，按 token 预算从旧到新裁剪）
│    ├─ atDepth Context Blocks（position: "atDepth"，插入到指定深度位置）
│    └─ First Message（新会话开场白，插入到历史末尾）
├─ 7. After-History Context Blocks（position: "afterHistory"）
│    └─ 来源：worldbook（召回世界书）、agentic（Agentic Play 状态）
└─ 8. User Input（当前用户输入）
```

**Context Block 的来源与注入策略：**

| source              | 含义                  | 典型 position                | priority      |
| ------------------- | --------------------- | ---------------------------- | ------------- |
| `character`         | 角色卡信息            | beforeHistory                | 0             |
| `worldbook`         | 世界书条目            | beforeHistory / afterHistory | 条目 priority |
| `memory`            | 长期记忆摘要          | beforeHistory                | 低            |
| `persona`           | 用户人设              | beforeHistory                | -             |
| `agentic`           | Agentic Play 场景状态 | afterHistory                 | 20000         |
| `system` / `safety` | 系统安全规则          | beforeHistory                | -             |

**Worldbook 注入流程：**

1. 正则后处理提取本轮 AI 回复的所有 display blocks 文本
2. 拼接最近若干轮对话的纯文本，用 worldbook 条目 keywords 匹配
3. 匹配到的条目按 position 分入 beforeHistory / afterHistory
4. `position: "beforeHistory"` 的条目注入到聊天历史之前（前置世界书）
5. `position: "afterHistory"` 的条目注入到聊天历史之后、用户输入之前（召回世界书）

## Agentic Play

Agentic Play 是聊天页里的实验模式，使用主持人型 prompt。它替换普通预设组，注入专用主持人模块和结构化场景状态。

### Prompt 注入结构

Agentic Play 模式通过 `buildAgenticPlayPresetItems` 替换普通预设卡片，注入四个模块：

```text
├─ core_rules（injectionOrder: 10）
│   └─ 开局断点规则、角色出场规则、行动判定规则、输出格式规则
├─ writing_style（injectionOrder: 15）
│   └─ 描写风格：沉浸感、选项设计、工具使用
├─ specific_rules（injectionOrder: 20）
│   └─ 断点选项规则、自定义行动流程、roll_dice 调用时机、update_game_state 规则
└─ host_style（injectionOrder: 30）
    └─ 主持人风格：公正评判、失败推动剧情、核心角色存在感
```

同时注入 `createAgenticPlayContextBlock` 作为 `position: "afterHistory"`、`priority: 20000` 的 context block，包含完整结构化场景状态。

### 场景状态结构

```ts
AgenticGameState {
  mode: "narrative_dice"
  player:   { name, hp, max_hp, traits[], skills{} }
  location: string
  quest:    { main, current_objective, completed_objectives[] }
  npcs:     [{ name, role, attitude }]
  inventory: unknown[]
  flags:    Record<string, unknown>
  scene:    { time, danger_level, active_conflict }
  log:      string[]
}
```

状态通过 `update_game_state` 工具调用持续更新，模型在每轮中看到的始终是最新状态。

### Tools 定义与执行流程

模型在对话中通过 OpenAI function calling 调用三个工具：

#### `roll_dice` — 真实骰子判定

```yaml
参数:
  dice:                string  # 骰子表达式，如 "1d20", "2d6"
  modifier:            integer # 可选修正值
  difficulty:          integer # 可选目标难度 DC
  success_probability: integer # AI 预估成功率 5-95
  reason:              string  # 掷骰原因

执行:
  1. 解析骰子表达式 → count, sides
  2. 如提供 success_probability 且表达式为 1d20 且未提供 difficulty
     → 自动转换: difficulty = 21 + modifier - round(success_probability / 5)
  3. 执行真实随机掷骰
  4. 返回 { dice, rolls[], total, difficulty, successProbability, outcome, reason }
```

#### `present_player_options` — 结构化断点选项

```yaml
参数:
  scene_text: string # 断点前的可见叙述（不含选项）
  question: string # 选项栏上方的简短提问
  options: array # 恰好 5 个选项，每个 { label, action, success_probability, description? }

执行: → stopForUser = true
  → 选项渲染到输入栏上方的可点击按钮
  → 玩家点击或输入自定义行动 → 文本作为下轮 user input 发回 AI
```

#### `update_game_state` — 更新场景状态

```yaml
参数:
  state_patch: object # JSON patch，对象深度合并，数组和原始值替换
  reason: string # 更新原因

执行: → 合并 patch 到当前 state → normalize
  → 返回 { ok, reason, updated_state }
```

### Tools 执行循环

```text
用户输入 → buildChatPrompt() → [system rules, presets, character, context blocks, history, user input]
  │
  ▼
Model API（带 tools + tool_choice: "auto"）
  │
  ├─ 无 tool_calls → 直接返回 content
  │
  └─ 有 tool_calls（最多 8 轮）
      │
      ├─ roll_dice        → 执行骰子 → 结果注入 tool message → 继续循环
      ├─ update_game_state → 合并状态 → 结果注入 tool message → 继续循环
      └─ present_player_options → stopForUser → 返回 scene_text + 选项
```

### 选项解析（Fallback）

如果 AI 在正文中内联输出选项（而非使用 `present_player_options` 工具），`extractAgenticOptions` 会尝试从正文中解析选项：

- 匹配 `选项 1.` / `A.` / `1)` 等格式
- 提取成功率标记（如 `成功率 65%`）
- 清理 markdown 格式
- 少于 2 个有效选项则退回纯文本

## Whale Builder

Whale Builder 是内置的角色卡与世界书创作工作流。它基于 **Skill** 架构，使用 Skill 文件定义工作流和创作规范。

### Skill 系统

Builder 启动后，系统注入包含 Skill 指令的 system prompt，告知模型：

1. 必须先调用 `read_skill_reference('SKILL.md')` 加载 Skill 入口
2. Skill 是唯一事实来源 — 工作流、数据格式、写作规则均以 Skill 为准
3. 不确定读什么文档时调用 `list_skill_references`
4. 完成后必须调用 `save_character_draft` 保存最终草稿

Skill references 位于：`apps/desktop/src/features/character/neo-builder-skill-references/`

### Tools 定义

Builder 使用 `WhaleBuilderToolRegistry` 注册以下工具：

| 工具名                     | 用途                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `list_skill_references`    | 列出可用 Skill 参考资料，支持 query 过滤                             |
| `read_skill_reference`     | 读取指定 Skill 参考文档内容                                          |
| `web_search`               | 联网搜索（需开启）                                                   |
| `ask_user_options`         | 向用户展示结构化追问选项（一次性 2-5 个问题）                        |
| `show_creation_plan`       | 展示/更新创作规划                                                    |
| `validate_character_draft` | 校验角色卡草稿规范性                                                 |
| `save_character_draft`     | 保存最终草稿（Skill 兼容格式），只有调用此工具产出物才显示在右侧面板 |

### Prompt 注入结构

Builder 的 system prompt 包含：

- Skill 入口指令
- 工具使用说明
- 联网搜索状态
- 追问规则（同一阶段最多调用一次 `ask_user_options`）
- 保存规则（信息足够时必须调用 `save_character_draft`）

Context prompt 包含结构化创作上下文：

- `currentDraft`：当前角色卡草稿
- `currentWorldbookEntries`：当前世界书条目
- `creationPlan`：创作规划
- `personalityPalette`：性格调色盘
- `mvu`：MVU 配置
- `evaluationReport`：评估报告

### 工具注入位置的规范

**Prompt 注入位置规范：**

| 注入内容               | 注入方式                                                | 注入位置                                                             |
| ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| System Rules           | `buildChatPrompt` systemRules 参数                      | 消息列表第 1 条                                                      |
| Preset Items           | `buildChatPrompt` presetItems 参数                      | 按 injectionOrder 排序后，在 system rules 之后、character block 之前 |
| Character Block        | `buildChatPrompt` character 参数                        | preset items 之后                                                    |
| User Persona           | `buildChatPrompt` userPersona 参数                      | character block 之后                                                 |
| Worldbook (前置)       | ContextBlock, position: "beforeHistory"                 | persona 之后、history 之前                                           |
| Worldbook (召回)       | ContextBlock, position: "afterHistory"                  | history 之后、user input 之前                                        |
| Memory Summary         | ContextBlock, position: "beforeHistory"                 | 与前置 worldbook 一起排序                                            |
| Agentic Play State     | ContextBlock, position: "afterHistory", priority: 20000 | history 之后、user input 之前                                        |
| Tools Definition       | OpenAI `tools` 参数                                     | 随 API 请求发送，不入 prompt 正文                                    |
| Tool Execution Results | `role: "tool"` 消息                                     | 插入到当前 assistant 消息之后                                        |

## 技术栈

| 模块                       | 技术                                   |
| -------------------------- | -------------------------------------- |
| 桌面壳                     | Tauri v2 + Rust                        |
| 前端                       | React 18 + TypeScript + Vite           |
| 状态管理                   | Zustand                                |
| UI                         | Tailwind CSS + Radix UI + Lucide Icons |
| 虚拟列表                   | @tanstack/react-virtual                |
| Prompt / Regex / Worldbook | `@neo-tavern/core`                     |
| 共享类型                   | `@neo-tavern/shared`                   |
| 共享 UI                    | `@neo-tavern/ui`                       |
| 包管理                     | pnpm workspace                         |

## 项目结构

```text
Whaleplay/
├── apps/
│   └── desktop/
│       ├── src/
│       │   ├── app/                # 路由、启动、主题、种子数据
│       │   ├── components/         # 通用前端组件
│       │   ├── db/                 # 存储适配器和 repositories
│       │   ├── features/           # chat / character / builder / settings 等业务逻辑
│       │   ├── pages/              # 页面和页面局部组件
│       │   └── main.tsx
│       ├── public/                 # 静态资源
│       └── src-tauri/              # Tauri Rust 后端
├── packages/
│   ├── core/                       # prompt builder、模型 provider、regex、worldbook
│   ├── shared/                     # 共享类型和工具
│   └── ui/                         # 共享 UI 组件
├── setup.ps1                       # Windows 安装启动脚本
├── uninstall-project.ps1           # Windows 清理脚本
├── 一键安装启动.bat
├── 一键清理卸载.bat
├── package.json
└── pnpm-workspace.yaml
```

## 环境要求

- Node.js 20 或更高版本。
- pnpm。
- Rust stable。仅在运行 Tauri 桌面开发模式或构建桌面安装包时需要。

## 安装

```bash
git clone https://github.com/YELEBAI/Whaleplay.git
cd Whaleplay
pnpm install
```

Windows 上也可以直接运行：

```text
一键安装启动.bat
```

或：

```powershell
./setup.ps1
```

## 开发

Web/Vite 开发模式：

```bash
pnpm dev
```

Tauri 桌面开发模式：

```bash
pnpm tauri dev
```

等价显式命令：

```bash
pnpm --filter @neo-tavern/desktop tauri dev
```

## 构建

前端构建：

```bash
pnpm build
```

桌面应用构建：

```bash
pnpm build:desktop
```

或：

```bash
pnpm --filter @neo-tavern/desktop tauri build
```

## 测试与检查

桌面端测试：

```bash
pnpm --filter @neo-tavern/desktop test
```

桌面端类型检查和前端构建：

```bash
pnpm --filter @neo-tavern/desktop build
```

Rust 检查：

```bash
cd apps/desktop/src-tauri
cargo check
```

## 模型配置

在应用 Settings 中新增 API 配置：

1. 选择或新增 OpenAI-compatible 配置。
2. 填写 Base URL。
3. 填写 API Key。
4. 填写模型名。
5. 保存并切换到该配置。

聊天、Agentic Play、Whale Builder、图片规划和记忆压缩都会读取当前设置中的模型配置。部分辅助功能可以单独配置次级模型。

## 本地数据

Tauri 环境下，应用数据写入系统 app-data 目录。

- 聊天消息使用 SQLite：`neotavern.sqlite3`
- 其他配置和资源使用 JSON store：`store.json`
- 浏览器开发环境会 fallback 到 localStorage 或本地 REST fallback

应用保留了旧 `neotavern*` localStorage 数据迁移逻辑，用于兼容早期开发版本。

## 注意事项

- Agentic Play 仍是实验模式，提示词、状态结构和工具协议还会继续调整。
- Whale Builder 角色卡生成器中的内置 skill 基于 **Tavern Cards — SillyTavern 角色卡与世界书编写工具** 修改适配，原作者：`ai4rpg`。
- Whale Builder 的内置 skill references 和 `tavern-cards-forge.mjs` 主要服务角色卡/世界书生成工作流，不等同于独立发布的 CLI 产品。

## 许可证

本项目使用 MIT License，详见 [LICENSE](./LICENSE)。
