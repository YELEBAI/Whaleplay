# Architecture

Whale Play is a **Tauri v2 + React monorepo** — a desktop application for character card creation and roleplay chat. This document describes the monorepo layout, package dependency flow, and key design decisions.

## Monorepo Layout

```
Neo/
├── apps/
│   └── desktop/                  # Tauri application
│       ├── src/                  #   React frontend source
│       │   ├── app/              #     App entry, theme store, router, seed data
│       │   ├── components/       #     Shared UI components (Layout, LoginGate, etc.)
│       │   ├── db/               #     Storage abstraction & repositories
│       │   │   └── repositories/ #       Data access layer per entity
│       │   ├── features/         #     Feature modules
│       │   │   ├── character/    #       Character management
│       │   │   ├── chat/         #       Chat store, types, memory utilities
│       │   │   ├── preset/       #       Prompt preset management
│       │   │   ├── settings/     #       Model configs, regex rules, worldbooks
│       │   │   ├── billing/      #       Usage cost tracking
│       │   │   ├── image-generation/
│       │   │   └── agentic-play/ #       Experimental game-master mode
│       │   ├── pages/            #     Page-level components
│       │   │   ├── chat/         #       Chat UI sub-components
│       │   │   ├── neo-builder/  #       Character builder page
│       │   │   └── settings/     #       Settings page
│       │   ├── i18n/             #     i18next initialization
│       │   ├── locales/          #     Translation JSON files (en, zh)
│       │   └── utils/            #     Small utilities (parse, toast)
│       └── src-tauri/            #   Rust/Tauri backend (commands, plugins, SQLite)
├── packages/
│   ├── core/                     # Core logic: prompt building, regex, memory, worldbook
│   ├── shared/                   # Shared TypeScript types and utilities
│   └── ui/                       # Radix-based UI component library
├── pnpm-workspace.yaml
├── package.json
├── eslint.config.mts
└── tsconfig.base.json
```

## Dependency Flow

The dependency graph follows a strict **bottom-up hierarchy**:

```
desktop (@neo-tavern/desktop)
  ├── core (@neo-tavern/core)          →  shared (@neo-tavern/shared)
  └── ui   (@neo-tavern/ui)            →  shared (@neo-tavern/shared)
```

### Packages

| Package               | Dependencies               | Purpose                                                                                                                                                                                                 |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@neo-tavern/shared`  | —                          | Pure TypeScript types, interfaces, and small utilities. Zero runtime dependencies.                                                                                                                      |
| `@neo-tavern/core`    | `shared`                   | Prompt building, chat-engine, plugin registry, flood guard, regex rule processing, worldbook resolution, long-term memory, token estimation. No DOM or UI dependencies. Testable with `vitest` in Node. |
| `@neo-tavern/ui`      | `shared`, Radix primitives | Reusable component library: buttons, cards, dialogs, textareas, scroll areas, toasts.                                                                                                                   |
| `@neo-tavern/desktop` | `core`, `shared`, `ui`     | The Tauri application — React frontend wired to Tauri IPC, feature stores, page components, and repositories.                                                                                           |

### Key Rules

- **`core` has no UI dependencies.** It never imports from `ui` or `react`. This keeps prompt processing and regex logic testable in a plain Node environment.
- **`desktop` is the only consumer** that imports all three packages. Feature modules inside `apps/desktop/src/features/` hold Zustand stores and page-specific logic.
- **`shared` is a leaf package.** Nothing depends on it except `core`, `ui`, and `desktop`.

## Bundling & Build Pipeline

- `pnpm-workspace.yaml` registers `apps/*` and `packages/*` as workspace packages.
- Each package defines its own `tsconfig.json` extending `tsconfig.base.json` from the root.
- The `@vitejs/plugin-react` plugin handles React JSX compilation in the desktop app.
- `core` exports its source directly (`"main": "./src/index.ts"`) so Vite can compile it inline with the app — no separate build step needed for workspace packages during development.

## Folder Conventions

```
apps/desktop/src/features/{feature}/
├── {feature}.store.ts       # Zustand store
├── {feature}.types.ts       # Feature-specific types
└── [...]                    # Hooks, utilities, sub-components
```

Repositories mirror this pattern:

```
apps/desktop/src/db/repositories/
├── {entity}.repository.ts   # CRUD operations via storage abstraction
└── index.ts                 # Re-exports
```

Pages are thin components that compose feature stores and repository functions together.

## Chat Feature Layering

Chat is split into two layers:

- `apps/desktop/src/pages/chat/`: page and UI components for layout, message rendering, input, side panels, image blocks, and Agentic choices.
- `apps/desktop/src/features/chat/`: desktop chat logic for the store, message lifecycle, context assembly, generation, memory, image jobs, and worldbook adapters.

Key files in `features/chat`:

| File                       | Responsibility                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `hooks/useSendMessage.ts`  | React facade. Handles send/regenerate commands, store callbacks, and UI entry params.                     |
| `assistant-turn-runner.ts` | Shared lifecycle for one assistant reply: assemble context, create draft, generate, finalize.             |
| `context-assembler.ts`     | Combines preset, memory, worldbook, Agentic state, healthy mode, and flood hooks into model context.      |
| `generation-runner.ts`     | Normal/Agentic generation, stream/non-stream handling, debug prompts, empty-reply retry, usage recording. |
| `memory-planner.ts`        | Long-term memory summaries and cache reuse; future RAG / compression strategies should attach here first. |
| `auto-image-runner.ts`     | Automatic image planning and ComfyUI generation after assistant completion.                               |
| `turn-finalizer.ts`        | Healthy-mode output blocking, notifications, auto-image trigger, error wording.                           |
| `turn-runtime.ts`          | Per-chat generation exclusivity, abort, and Zustand generation state.                                     |
| `worldbook-context.ts`     | Shared rule: character-bound worldbook wins over the global active worldbook.                             |

The goal is: pages do not know model-call details, generation runners do not know React, and future RAG/compression/plugin work attaches to context, memory, or chat-engine layers instead of expanding `ChatPage` or `useSendMessage`.

## Chat Engine And Plugin Skeleton

`packages/core/src/chat-engine/` provides the cross-platform turn engine, events, strategy contracts, and plugin registry. Desktop still has an adapter layer, but core now includes a minimal built-in plugin shape:

```typescript
import { ChatPluginRegistry, createFloodGuardPlugin } from "@neo-tavern/core";

const registry = new ChatPluginRegistry();
registry.register(createFloodGuardPlugin());
```

Plugins can hook into:

- `onBeforePromptBuild`: adjust turn context before prompt assembly.
- `onContextBlocks`: append, filter, or reorder context blocks.
- `onContentDelta` / `onReasoningDelta`: observe streaming output.
- `inspectOutput`: inspect accumulated output; useful for terminating plugins such as flood guard.
- `onAfterTurn`: run logging, metrics, or side effects after completion.

For now, the plugin system is for structured built-in capabilities. It is not yet a third-party plugin marketplace or sandbox. `flood guard` is the first example plugin.
