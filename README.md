# Whale Play

![Whale Play](apps/desktop/src-tauri/icons/128x128.png)

![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript)
![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Whale Play 是一款桌面应用，用于**角色卡创作**和**角色扮演聊天**。你创建角色卡，AI 扮演角色与你对话——就像在桌游里一样，由 AI 驱动。

- 创建和管理多角色卡，与每个角色独立对话
- 使用世界书（Lorebook）为 AI 提供背景知识
- 用预设提示词自定义 AI 的行为风格
- Agentic Play 实验模式：AI 当主持人，带你跑剧情、掷骰子
- Whale Builder：通过聊天对话，让 AI 帮你一步步完成角色卡创作

> 📖 [**中文文档**](docs/zh/readme.md) · [English Docs](docs/en/readme.md)

---

## 快速上手

Whale Play 提供打包好的应用，通过[github release](https://github.com/YELEBAI/Whaleplay/releases/)分发，你可以直接下载并安装。

你也可以通过克隆仓库到本地，体验最新功能。

**环境要求：** Node.js 22+、pnpm

```bash
git clone https://github.com/YELEBAI/Whaleplay.git
cd Whaleplay
pnpm install     # 安装依赖
pnpm dev         # 启动浏览器版
```

- Windows 用户也可以直接运行 `一键安装启动.bat` 或 `setup.ps1`
- 需要桌面原生窗口？运行 `pnpm tauri dev`（需安装 Rust）

启动后打开浏览器进入应用，第一步是去 **设置 → API 配置** 填入你的 API Key（支持 DeepSeek、OpenAI 兼容服务）。

> 完整安装指引见 [安装指南](docs/zh/guide/installation.md)，快速上手见[快速上手](docs/zh/guide/quick-start.md)。

---

## 功能一览

| 功能 | 说明 |
|------|------|
| **角色卡聊天** | 创建角色 → 开始对话。支持多角色、多会话、消息编辑/删除/复制/重新生成 |
| **世界书** | 为角色配备背景知识库，AI 在对话中自动按关键词召回相关条目 |
| **预设提示词** | 定制 AI 的系统指令，支持排序、开关、导入导出 |
| **用户人设** | 设定你的名字和简介，自动注入到每轮对话中 |
| **Agentic Play** | 实验模式，AI 当主持人：推进剧情、掷骰判定、提供行动选项 |
| **Whale Builder** | 通过聊天对话，让 AI 引导你走完角色卡创作全流程 |
| **正则后处理** | 将 AI 回复拆为对话/叙述块，支持剥离显示文本 |
| **用量统计** | Token 计数、缓存命中率、费用估算 |

---

## 项目结构

```
Whaleplay/
├── apps/desktop/         # 桌面应用（前端 + Tauri 壳）
├── packages/
│   ├── core/             # 提示词构建、正则、世界书引擎
│   ├── shared/           # 共享类型和工具
│   └── ui/               # 共享 UI 组件
├── docs/                 # 文档（中文/英文）
│   ├── zh/               # 中文文档
│   └── en/               # English docs
├── setup.ps1             # Windows 安装脚本
└── 一键安装启动.bat
```

---

## 开发者

- [贡献指南](CONTRIBUTING.md)
- [开发者文档](docs/zh/developer/architecture.md)

---

## 许可证

MIT License，详见 [LICENSE](./LICENSE)。

### 致谢

Whale Builder 的内置 skill 基于 **Tavern Cards** 修改适配，原作者：`ai4rpg`，[仓库](https://github.com/ai4rpg/tavern-cards)。主要用于服务角色卡/世界书生成工作流，不等同于独立发布的 CLI 产品。
