# Whale Play — 原始 README 存档

> 此文件为旧版 README.md 的完整备份。技术细节已迁移至 `docs/` 目录对应文档，此文件保留供历史参考。

## 原 README 内容（按章节）

### 当前重点

- 角色卡聊天：多角色、多会话、开场白、消息编辑、删除、复制、重新生成和停止生成。
- Agentic Play 实验模式：使用专用主持人提示词、结构化场景状态、真实骰子工具和可点击行动选项。
- Whale Builder：通过聊天式流程生成角色卡、世界书、性格调色盘、创作规划和可保存产物。
- 世界书：管理世界书与条目，按上下文召回并注入提示词。
- 预设提示词：管理 system/user prompt 卡片，支持排序、启用/禁用、导入和导出。
- 正则后处理：把模型输出拆成正文、展示块、图片标记、按钮等前端结构，并可控制是否进入下一轮提示词。
- 用量与调试：显示 token、缓存命中、费用估算、Prompt Preview 和调试 prompt 文件。

### Prompt 注入管线

> 已迁移至 `docs/zh/developer/prompt-pipeline.md` | `docs/en/developer/prompt-pipeline.md`

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

### Agentic Play

> 已迁移至 `docs/zh/guide/agentic-play.md` | `docs/en/guide/agentic-play.md`

（略，见 docs）

### Whale Builder

> 已迁移至 `docs/zh/guide/builder.md` | `docs/en/guide/builder.md`

（略，见 docs）

### 技术栈

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

### 项目结构

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

### 环境要求

- Node.js 20 或更高版本。
- pnpm。
- Rust stable。仅在运行 Tauri 桌面开发模式或构建桌面安装包时需要。

### 安装

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

### 开发

Web/Vite 开发模式：`pnpm dev`
Tauri 桌面开发模式：`pnpm tauri dev`

### 构建

前端构建：`pnpm build`
桌面应用构建：`pnpm build:desktop`

### 测试与检查

桌面端测试：`pnpm --filter @neo-tavern/desktop test`
桌面端类型检查：`pnpm --filter @neo-tavern/desktop build`
Rust 检查：`cd apps/desktop/src-tauri && cargo check`

### 模型配置

在应用 Settings 中新增 API 配置。详见 `docs/zh/reference/model-config.md`。

### 本地数据

Tauri 环境下，应用数据写入系统 app-data 目录。详见 `docs/zh/developer/storage.md`。

### 注意事项

- Agentic Play 仍是实验模式，提示词、状态结构和工具协议还会继续调整。
- Whale Builder 的内置 skill 基于 **Tavern Cards — SillyTavern 角色卡与世界书编写工具** 修改适配，原作者：`ai4rpg`。https://github.com/ai4rpg/tavern-cards
