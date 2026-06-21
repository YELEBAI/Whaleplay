# Building

## Prerequisites

- **Node.js** >= 24 (see the root `package.json` `engines.node` field)
- **pnpm** 9+ (corepack is recommended: `corepack enable && corepack prepare pnpm@latest --activate`)
- **Rust toolchain** (for Tauri builds; install via [rustup](https://rustup.rs/))
- Platform-specific Tauri dependencies: see [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

## Commands

### Development

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start the Vite dev server — opens in the browser. Hot-reloads React components. |
| `pnpm tauri dev` | Start the Tauri native window with hot-reload for both the React frontend and the Rust backend. |

`pnpm dev` runs the app in **browser mode** — no Tauri APIs are available, and the storage layer falls back to REST API or localStorage. Use this for rapid UI iteration.

`pnpm tauri dev` compiles the Rust backend and opens a native window. Tauri IPC commands (`invoke`) are available.

### Production Builds

| Command | Purpose |
|---------|---------|
| `pnpm build` | Build the Vite frontend for production — outputs to `apps/desktop/dist/`. |
| `pnpm build:desktop` | Run a full Tauri production build — compiles the Rust backend and produces platform-specific installers/bundles. |

`pnpm build:desktop` runs:
1. TypeScript compilation (`tsc -b`)
2. Vite production build
3. Tauri Rust compilation (`cargo build --release`)
4. Platform bundling (`.msi` / `.dmg` / `.AppImage` depending on OS)

### Testing

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run **all** vitest test suites across the workspace. |
| `pnpm --filter @neo-tavern/core test` | Run only `core` package tests. |
| `pnpm --filter @neo-tavern/desktop test` | Run only desktop app tests. |

Tests are written with **vitest**. The `core` package has its own `vitest.config.ts` with a path alias for `@neo-tavern/shared`.

### Type Checking

```bash
# Type check the desktop app and its workspace references
pnpm typecheck
```

### Linting

| Command | Purpose |
|---------|---------|
| `pnpm lint` | Run ESLint across the workspace. |
| `pnpm lint:fix` | Run ESLint with auto-fix. |

The ESLint configuration is at the root (`eslint.config.mts`) and uses:
- `@eslint/js` recommended rules
- `typescript-eslint` for TypeScript files
- `eslint-plugin-react` for JSX files
- `eslint-plugin-react-hooks` for hooks correctness
- `eslint-plugin-react-compiler` for React Compiler safety

## Useful Filters

```bash
# Run a script in a specific package
pnpm --filter @neo-tavern/ui exec echo "hello from ui"

# List workspace packages
pnpm list -r --depth=-1
```

## Output Artifacts

| Build | Output |
|-------|--------|
| `pnpm build` | `apps/desktop/dist/` (static web assets) |
| `pnpm build:desktop` | `apps/desktop/src-tauri/target/release/bundle/` (platform installer) |

See [CI and releases](./ci-release.md) for automated checks, release tags, checksums, and build provenance.
