# 提示词注入流水线

提示词流水线是核心机制，用于组装在聊天会话中发送给语言模型的每条消息。它在 `@neo-tavern/core` 的 `buildChatPrompt` 函数中实现（`packages/core/src/prompt/prompt-builder.ts`）。

## 构建顺序

消息按以下顺序追加到提示词消息列表中：

```
 1. 系统规则（System Rules）
     └─ 默认或自定义的系统级指令
 2. 预设项（Preset Items，按 injectionOrder 排序）
     └─ 合并为单条消息，插槽占位符被解析
 3. 角色块（Character Block）
     └─ 名称、描述、性格、场景、示例对话
 4. 用户人设（User Persona）
     └─ 用户自己的角色表
 5. 历史前的上下文块（Before-History Context Blocks）
     └─ 世界书（前置上下文）、记忆摘要、安全规则
 6. 聊天历史（Chat History）
     ├─ 按 token 预算裁剪（从最旧的消息开始）
     ├─ atDepth 块插入到历史中的指定深度位置
     └─ 新会话中预置首条消息
 7. 历史后的上下文块（After-History Context Blocks）
     └─ 世界书（召回）、agentic play 状态
 8. 用户输入（User Input）
     └─ 当前用户消息
```

## Context Block 模型

所有不属于核心对话的上下文数据都被建模为 `ContextBlock`：

```typescript
interface ContextBlock {
  id: string;
  source: "character" | "worldbook" | "memory" | "agentic" | "persona" | "system" | "safety";
  title: string;
  content: string;
  priority: number;
  role?: "system" | "user" | "assistant";
  position?: "beforeHistory" | "afterHistory" | "atDepth";
  depth?: number;
}
```

### Source、Position 与 Priority

| source          | 含义                  | 典型位置（position）             | 优先级（priority） |
| --------------- | --------------------- | -------------------------------- | ------------------ |
| `character`     | 角色卡信息            | `beforeHistory`                  | 0                  |
| `worldbook`     | 世界书条目            | `beforeHistory` / `afterHistory` | 条目优先级         |
| `memory`        | 长期记忆摘要          | `beforeHistory`                  | 低                 |
| `persona`       | 用户人设              | `beforeHistory`                  | —                  |
| `agentic`       | Agentic Play 场景状态 | `afterHistory`                   | 20000              |
| `system/safety` | 系统安全规则          | `beforeHistory`                  | —                  |

优先级决定同一 position 内的排序顺序：优先级更高的块排在前面。世界书条目携带各自的条目级优先级值。

## 预设项

预设项是用户可配置的提示词片段，在角色块之前注入。它们按 `injectionOrder`（升序）排序并合并为单条消息。

预设项可以包含在构建时解析的 `<extra_preset_slot />` 占位符。有三个内置插槽可用：

| 插槽名称       | 解析后的内容                                   |
| -------------- | ---------------------------------------------- |
| `chat history` | 格式化后的聊天历史，其中嵌入了 atDepth 块      |
| `前置世界书`   | 静态世界书条目（`position: "beforeHistory"`）  |
| `召回世界书`   | 召回的世界书条目（`position: "afterHistory"`） |

这使得预设项可以精确控制历史和世界书内容出现的位置，而不是依赖默认的注入顺序。

## 世界书注入流程

世界书条目是注入背景知识和动态上下文的主要机制。注入分为五个步骤：

1. **正则后处理**——AI 响应后，从回复文本中提取 display 块。
2. **关键词匹配**——将最近的对话文本与世界书条目的关键词进行匹配。
3. **按 position 拆分**——匹配到的条目分为两组：
   - `beforeHistory` 条目 → **静态世界书**（前置上下文）
   - `afterHistory` 条目 → **召回世界书**（后置上下文）
4. **静态世界书**在聊天历史之前注入，与其他 before-history 块一起。
5. **召回世界书**在聊天历史之后、用户输入之前注入。

## Token 预算与历史裁剪

当提供了 `maxTotalTokens` 时，构建器会计算聊天历史的 token 预算：

```text
overhead = 系统规则 + 预设内容 + 角色块
         + 用户人设 + 用户输入 + 上下文块开销
         + 首条消息（如果存在）+ 100（安全余量）

historyBudget = maxTotalTokens - overhead

history = trimMessagesByTokens(recentMessages, historyBudget)
```

裁剪方式为**从最旧的开始**：消息从数组末尾向前保留，超出预算时丢弃最早的消息。

## atDepth 上下文块

`position: "atDepth"` 的上下文块会插入到聊天历史的特定位置。深度值（从历史末尾开始，基于 0）决定插入位置：

```typescript
const index = Math.max(0, historyMessages.length - depth);
historyMessages.splice(index, 0, block);
```

这对于在对话中间（而非开头或结尾）注入提醒或规则非常有用。

## Chat Turn 与插件钩子

桌面端当前通过 `apps/desktop/src/features/chat/assistant-turn-runner.ts` 执行一轮 assistant 回复：先调用 `context-assembler` 组装 prompt，再调用 `generation-runner` 生成，最后交给 `turn-finalizer` 处理通知、健康模式输出拦截和自动图片。

跨平台的插件雏形位于 `packages/core/src/chat-engine/`：

```typescript
import { ChatPluginRegistry, createFloodGuardPlugin } from "@neo-tavern/core";

const registry = new ChatPluginRegistry();
registry.register(createFloodGuardPlugin());
```

插件不会直接修改 `buildChatPrompt` 的核心顺序，而是在 turn engine 周围提供扩展点：

| 钩子                                  | 用途                                         |
| ------------------------------------- | -------------------------------------------- |
| `onBeforePromptBuild`                 | prompt 组装前检查或调整 turn context         |
| `onContextBlocks`                     | 添加、过滤或排序上下文块，例如未来 RAG 命中  |
| `onContentDelta` / `onReasoningDelta` | 观察流式输出                                 |
| `inspectOutput`                       | 检查累计输出，可中止刷屏、重复输出等异常生成 |
| `onAfterTurn`                         | 生成后记录统计、调试信息或副作用             |

当前 `flood guard` 已有内置插件工厂，但 desktop 仍在适配层直接使用 `GenerationHooks.inspectOutput`。后续把 RAG、压缩、调试保存等能力插件化时，应优先保持“插件只声明钩子，具体存储/UI 仍由 desktop adapter 注入”的边界。

## `buildChatPrompt` 函数签名

```typescript
function buildChatPrompt(input: BuildPromptInput): BuiltPrompt;

interface BuildPromptInput {
  character: Character;
  recentMessages: Message[];
  userInput: string;
  maxTotalTokens?: number;
  systemRules?: string;
  userPersona?: string;
  userName?: string;
  contextBlocks?: ContextBlock[];
  presetItems?: { role; content; injectionOrder }[];
}

interface BuiltPrompt {
  messages: GenerateMessage[];
  previewText: string;
  tokenEstimate: number;
  includedContextBlocks: ContextBlock[];
}
```

## 注入位置汇总

| 内容                                   | 注入方法                                    | 在消息列表中的位置                  |
| -------------------------------------- | ------------------------------------------- | ----------------------------------- |
| 系统规则（System Rules）               | `buildChatPrompt` 的 `systemRules` 参数     | 消息列表，位置 0                    |
| 预设项（Preset Items）                 | `buildChatPrompt` 的 `presetItems` 参数     | 系统规则之后，角色块之前            |
| 角色块（Character Block）              | `buildChatPrompt` 的 `character` 参数       | 预设项之后                          |
| 用户人设（User Persona）               | `buildChatPrompt` 的 `userPersona` 参数     | 角色块之后                          |
| 世界书（静态）                         | `ContextBlock`，`position: "beforeHistory"` | 用户人设之后，历史之前              |
| 世界书（召回）                         | `ContextBlock`，`position: "afterHistory"`  | 历史之后，用户输入之前              |
| 记忆摘要（Memory Summary）             | `ContextBlock`，`position: "beforeHistory"` | 与静态世界书一起排序                |
| Agentic Play 状态                      | `ContextBlock`，`position: "afterHistory"`  | 历史之后，用户输入之前              |
| 工具定义（Tools Definition）           | OpenAI `tools` 参数                         | 随 API 请求发送，不在提示词文本中   |
| 工具执行结果（Tool Execution Results） | `role: "tool"` 消息                         | 在调用工具的 assistant 消息之后插入 |
