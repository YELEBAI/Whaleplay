# Whale Play 文档

Whale Play 是一款用于角色卡创建和角色扮演聊天的桌面应用程序，基于 Tauri v2、React 和 TypeScript 构建。

## 📖 用户指南

| 文档 | 描述 |
|----------|-------------|
| [安装](guide/installation.md) | 系统要求、一键安装、手动安装、预编译二进制文件 |
| [快速开始](guide/quick-start.md) | 从零到第一次聊天的 5 个步骤 |
| [角色](guide/characters.md) | 创建、编辑、导入/导出角色卡 |
| [聊天](guide/chat.md) | 发送消息、编辑、删除、重新生成、停止生成 |
| [世界书](guide/worldbook.md) | 管理世界书和条目、上下文注入机制 |
| [预设](guide/presets.md) | 管理系统/用户 prompt 卡、排序、模板、导入/导出 |
| [Persona](guide/persona.md) | 配置你的用户 persona 及其注入方式 |
| [Agentic Play](guide/agentic-play.md) | 实验性的游戏主持人模式，支持掷骰和选择 |
| [图片生成](guide/image-generation.md) | ComfyUI 连接、工作流、生成参数 |
| [设置](guide/settings.md) | API 配置、外观主题、上下文 token、正则规则 |
| [Whale Builder](guide/builder.md) | 聊天驱动的角色创建流程和 Skill 系统 |

## 🔧 开发者指南

| 文档 | 描述 |
|----------|-------------|
| [架构](developer/architecture.md) | Monorepo 结构、包依赖、构建流水线 |
| [Prompt 流水线](developer/prompt-pipeline.md) | 聊天 prompt 如何从上下文块组装 |
| [工具与技能](developer/tools-and-skills.md) | 工具执行循环、定义新工具、Skill 系统 |
| [存储](developer/storage.md) | 三层存储回退机制（Tauri/SQLite → REST → localStorage） |
| [主题](developer/theming.md) | CSS 变量、深色/棕褐色主题、`@apply` 工具类 |
| [国际化](developer/i18n.md) | 使用 react-i18next 实现国际化、命名空间、添加语言 |
| [构建](developer/building.md) | 开发/构建命令、Tauri 打包、CI/CD |
| [贡献](developer/contributing.md) | 代码风格、ESLint、提交信息格式 |

## 📋 参考

| 文档 | 描述 |
|----------|-------------|
| [模型配置](reference/model-config.md) | 模型配置字段、提供商类型、参数说明 |
| [正则规则](reference/regex-rules.md) | 正则模式 DSL、template、strip、displayTemplate |
| [世界书模式](reference/worldbook-schema.md) | 条目模式：keys、triggerMode、position、depth |
| [键盘快捷键](reference/shortcuts.md) | 可用的键盘快捷键 |

## 🖼️ 截图

截图存储在 `docs/images/` 目录下。每个指南中均包含具体的截图说明。

## 🚀 快速链接

- [安装指南](guide/installation.md) — 立即开始
- [GitHub 仓库](https://github.com/your-org/neo) — 源代码
- [README](../README.md) — 项目概述
