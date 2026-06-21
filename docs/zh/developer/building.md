# 构建

## 前置条件

- **Node.js** >= 24（参见根目录 `package.json` 的 `engines.node` 字段）
- **pnpm** 9+（推荐使用 corepack：`corepack enable && corepack prepare pnpm@latest --activate`）
- **Rust 工具链**（用于 Tauri 构建；通过 [rustup](https://rustup.rs/) 安装）
- 平台特定的 Tauri 依赖：参见 [Tauri v2 前置条件](https://v2.tauri.app/start/prerequisites/)

## 命令

### 开发

| 命令 | 用途 |
|---------|---------|
| `pnpm dev` | 启动 Vite 开发服务器——在浏览器中打开。React 组件热重载。 |
| `pnpm tauri dev` | 启动 Tauri 原生窗口，React 前端和 Rust 后端均支持热重载。 |

`pnpm dev` 以**浏览器模式**运行应用——没有 Tauri API，存储层回退到 REST API 或 localStorage。适用于快速的 UI 迭代。

`pnpm tauri dev` 编译 Rust 后端并打开原生窗口。Tauri IPC 命令（`invoke`）可用。

### 生产构建

| 命令 | 用途 |
|---------|---------|
| `pnpm build` | 构建生产环境的 Vite 前端——输出到 `apps/desktop/dist/`。 |
| `pnpm build:desktop` | 执行完整的 Tauri 生产构建——编译 Rust 后端并生成平台特定的安装包。 |

`pnpm build:desktop` 执行：
1. TypeScript 编译（`tsc -b`）
2. Vite 生产构建
3. Tauri Rust 编译（`cargo build --release`）
4. 平台打包（取决于操作系统生成 `.msi` / `.dmg` / `.AppImage`）

### 测试

| 命令 | 用途 |
|---------|---------|
| `pnpm test` | 运行工作区中**所有** vitest 测试套件。 |
| `pnpm --filter @neo-tavern/core test` | 仅运行 `core` 包测试。 |
| `pnpm --filter @neo-tavern/desktop test` | 仅运行 desktop 应用测试。 |

测试使用 **vitest** 编写。`core` 包有自己的 `vitest.config.ts`，其中包含 `@neo-tavern/shared` 的路径别名。

### 类型检查

```bash
# 检查 desktop 应用及其 workspace 引用
pnpm typecheck
```

### 代码检查

| 命令 | 用途 |
|---------|---------|
| `pnpm lint` | 在工作区中运行 ESLint。 |
| `pnpm lint:fix` | 运行 ESLint 并自动修复。 |

ESLint 配置位于根目录（`eslint.config.mts`），使用以下规则集：
- `@eslint/js` 推荐规则
- `typescript-eslint` 用于 TypeScript 文件
- `eslint-plugin-react` 用于 JSX 文件
- `eslint-plugin-react-hooks` 用于 hooks 正确性
- `eslint-plugin-react-compiler` 用于 React Compiler 安全

## 实用筛选器

```bash
# 在特定包中运行脚本
pnpm --filter @neo-tavern/ui exec echo "hello from ui"

# 列出工作区包
pnpm list -r --depth=-1
```

## 构建产物

| 构建命令 | 输出 |
|-------|--------|
| `pnpm build` | `apps/desktop/dist/`（静态 Web 资源） |
| `pnpm build:desktop` | `apps/desktop/src-tauri/target/release/bundle/`（平台安装包） |

自动化检查、release tag、校验和与构建来源证明见 [CI 与发布](./ci-release.md)。
