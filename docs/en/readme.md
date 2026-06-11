# Whale Play Documentation

Whale Play is a desktop application for character card creation and roleplay chat, built with Tauri v2, React, and TypeScript.

## 📖 User Guide

| Document | Description |
|----------|-------------|
| [Installation](guide/installation.md) | System requirements, one-click setup, manual install, prebuilt binaries |
| [Quick Start](guide/quick-start.md) | From zero to first chat in 5 steps |
| [Characters](guide/characters.md) | Creating, editing, importing/exporting character cards |
| [Chat](guide/chat.md) | Sending messages, editing, deleting, regenerating, stopping generation |
| [World Book](guide/worldbook.md) | Managing world books and entries, context injection mechanism |
| [Presets](guide/presets.md) | Managing system/user prompt cards, sorting, templates, import/export |
| [Persona](guide/persona.md) | Configuring your user persona and how it's injected |
| [Agentic Play](guide/agentic-play.md) | Experimental game-master mode with dice rolls and choices |
| [Image Generation](guide/image-generation.md) | ComfyUI connection, workflows, generation parameters |
| [Settings](guide/settings.md) | API configuration, appearance theme, context tokens, regex rules |
| [Whale Builder](guide/builder.md) | Chat-driven character creation workflow and Skill system |

## 🔧 Developer Guide

| Document | Description |
|----------|-------------|
| [Architecture](developer/architecture.md) | Monorepo structure, package dependencies, build pipeline |
| [Prompt Pipeline](developer/prompt-pipeline.md) | How chat prompts are assembled from context blocks |
| [Tools & Skills](developer/tools-and-skills.md) | Tool execution loop, defining new tools, Skill system |
| [Storage](developer/storage.md) | Three-layer storage fallback (Tauri/SQLite → REST → localStorage) |
| [Theming](developer/theming.md) | CSS variables, dark/sepia themes, `@apply` utility classes |
| [i18n](developer/i18n.md) | Internationalization with react-i18next, namespaces, adding languages |
| [Building](developer/building.md) | Dev/build commands, Tauri packaging, CI/CD |
| [Contributing](developer/contributing.md) | Code style, ESLint, commit message format |

## 📋 Reference

| Document | Description |
|----------|-------------|
| [Model Configuration](reference/model-config.md) | Model config fields, provider types, parameter descriptions |
| [Regex Rules](reference/regex-rules.md) | Regex pattern DSL, template, strip, displayTemplate |
| [World Book Schema](reference/worldbook-schema.md) | Entry schema: keys, triggerMode, position, depth |
| [Keyboard Shortcuts](reference/shortcuts.md) | Available keyboard shortcuts |

## 🖼️ Screenshots

Screenshots are stored in `docs/images/`. See each guide for specific screenshot instructions.

## 🚀 Quick Links

- [Installation Guide](guide/installation.md) — get started now
- [GitHub Repository](https://github.com/your-org/neo) — source code
- [README](../README.md) — project overview
