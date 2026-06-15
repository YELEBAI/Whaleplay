# 工具与技能系统

Whale Play 采用 **tools/skills** 架构，让语言模型在生成过程中调用类型化函数。以下两个上下文使用该系统：

- **Agentic Play**——AI 驱动的游戏主持人模式，内置三个工具
- **Whale Builder**——AI 辅助的角色/世界书创建，基于技能的工作流

两者共享相同的基础机制：模型通过 API 声明工具调用，运行时在客户端执行，并将结果反馈回对话中。

---

## Agentic Play 工具

Agentic Play 工具定义在 `apps/desktop/src/features/agentic-play/agentic-play.ts` 中，并注册为 OpenAI function calling 工具定义。模型在 `generateAgenticPlayTurn` 期间调用它们。

### 1. `roll_dice`——真实骰子投掷

对不确定的 RPG 动作执行真实的骰子投掷。

```typescript
Parameters:
  dice:                string   // 骰子表达式，例如 "1d20"、"2d6"、"3d10"
  modifier:            integer  // 可选的调整值，加到总数上（默认：0）
  difficulty:          integer  // 可选的目标难度等级（DC）
  success_probability: integer  // AI 预估的成功概率（5-95）
  reason:              string   // 为什么需要进行这次投掷

Execution:
  1. 解析骰子表达式 → { count, sides }
  2. 如果提供了 `success_probability` 且表达式为 "1d20"
     且 `difficulty` 被省略：
       → 自动转换：difficulty = 21 + modifier - round(success_probability / 5)
  3. 使用 Math.random() 生成 `count` 个 1 到 `sides` 之间的随机数
  4. 求和，加上 modifier → total
  5. 判定结果：
       • rolls[0] === 20  → "critical_success"
       • rolls[0] === 1   → "critical_failure"
       • total >= difficulty → "success"
       • total < difficulty  → "failure"
       • 其他情况 → "rolled"
  6. 返回结果对象

Return:
  {
    dice,             // 原始表达式
    rolls,            // 每次骰子的结果数组
    roll,             // 骰子总和（未加 modifier 前）
    modifier,
    total,            // roll + modifier
    difficulty,       // 实际使用的 DC
    successProbability,
    outcome,          // "critical_success" | "success" | "failure" | "critical_failure" | "rolled"
    reason
  }
```

### 2. `present_player_options`——结构化断点选项

暂停生成过程，向玩家展示可点击的操作按钮。

```typescript
Parameters:
  scene_text: string   // 断点之前的可见叙述（选项中不包含内联文本）
  question:  string    // 选项面板上方显示的简短问题
  options:   array     // 恰好 5 个选项，每个包含：
    ├─ label:                string  // 简短标签或完整操作文本
    ├─ action:               string  // 选中后发送的确切指令
    ├─ success_probability:  integer // 预估的成功概率（0-100）
    └─ description?:         string  // 关于风险或后果的可选说明

Execution:
  1. 标准化选项（验证、分配 ID、修剪标签）
  2. 设置 stopForUser = true
  3. 将 scene_text + options 返回给 UI
  4. UI 在输入栏上方渲染可点击的按钮
  5. 玩家点击按钮（或输入自定义内容）
  6. 选中的操作文本成为下一条用户输入

Return:
  {
    ok:       boolean,  // 如果有 >= 2 个有效选项则为 true
    question: string,
    options:  AgenticActionOption[]
  }
```

### 3. `update_game_state`——更新场景状态

在一轮结束后，当位置、背包、NPC、任务或标志发生变化时，更新结构化的游戏状态。

```typescript
Parameters:
  state_patch: object   // JSON 补丁；对象会深度合并，数组/基本类型会替换
  reason:      string   // 更新的简短说明

Execution:
  1. 验证 state_patch 是否为 record 类型
  2. 将 state_patch 深度合并到当前的 AgenticGameState 中
  3. 标准化合并后的状态（确保所有必要字段存在）
  4. 返回更新后的状态

Return:
  {
    ok:           boolean,
    reason:       string,
    updated_state: AgenticGameState
  }
```

### Agentic 游戏状态结构

由 `update_game_state` 管理的状态：

```typescript
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

---

## 工具执行循环

核心循环位于 `generateAgenticPlayTurn` 中，运行流程如下：

```
用户输入
    │
    ▼
buildChatPrompt() → [系统规则、预设、角色、
                     上下文块、历史、用户输入]
    │
    ▼
模型 API（带 tools + tool_choice: "auto"）
    │
    ├─ 没有 tool_calls → 直接返回内容
    │
    └─ 有 tool_calls（最多 AGENTIC_PLAY_MAX_TOOL_ROUNDS = 8 轮）
        │
        ├─ roll_dice → 在客户端执行 → 推送工具结果消息
        ├─ update_game_state → 合并+标准化 → 推送工具结果消息
        └─ present_player_options → 设置 stopForUser → 将选项传给 UI

        │
        └─ 循环：模型看到工具结果 + 继续生成
            直到没有更多 tool_calls 或 stopForUser 被设置
```

关键细节：

- 每轮最多 **8 轮工具调用**。如果模型持续调用工具超过该限制，系统消息会强制其生成可见内容。
- 每轮都会向 UI 流式传输内容增量。如果在内容已流式传输后收到工具调用，则内容会被**重置**并替换为工具生成的场景文本。
- 工具结果以 `role: "tool"` 消息的形式推送，以便模型在下一次迭代中看到它们。

---

## 选项清理与修复

Agentic Play 当前不再依赖独立的 `agentic-options.ts` 回退解析文件。选项应通过 `present_player_options` 工具进入 UI；如果模型把选项写进正文，`agentic-play.ts` 会在可见内容输出前做清理：

1. `stripInlineOptionList` 移除正文中的编号选项、成功率和 DC 行
2. `sanitizeAgenticVisibleContent` 过滤工具调用说明、草稿式推理和内部状态段落
3. `normalizePlayerOptions` 只接受恰好 5 个有效结构化选项，并要求每项包含成功率和 1d20 DC
4. 当 `requirePlayerOptions` 开启但模型没有正确调用工具时，`AGENTIC_OPTIONS_REPAIR_PROMPT` 会强制下一轮调用 `present_player_options`
5. 如果工具回合超过 `AGENTIC_PLAY_MAX_TOOL_ROUNDS = 8`，最后一轮会要求模型直接产出可见内容，或在需要选项时强制调用选项工具

---

## Whale Builder 工具

Whale Builder 使用 `WhaleBuilderToolRegistry`（`apps/desktop/src/features/character/builder/tool-registry.ts`），其中包含一组专门用于角色创建的不同工具：

| 工具名称                   | 用途                                         |
| -------------------------- | -------------------------------------------- |
| `list_skill_references`    | 列出可用的技能参考文档（支持查询）           |
| `read_skill_reference`     | 按 ID 读取指定的技能参考文档                 |
| `web_search`               | 在线搜索（需用户选择启用）                   |
| `ask_user_options`         | 展示结构化的后续问题（单题 2-4 项，或一次 2-5 个问题） |
| `present_creation_plan`    | 展示角色卡创作规划、性格调色盘并等待用户确认 |
| `record_entry_output`      | 登记规划条目的完成、跳过或进行中状态         |
| `evaluate_character_draft` | 评估角色卡、世界书、性格调色盘和创作规划，输出修改建议 |
| `validate_character_draft` | 根据技能规则验证角色卡草稿，支持 `pack` 或独立字段 |
| `save_character_draft`     | 保存最终草稿，支持 `pack`、MVU、状态栏配置，并触发右侧面板显示 |

每个工具都有类型化参数、执行逻辑和结果格式——与 Agentic Play 工具的模式相同。

### 通用工具模式

Whale Play 中所有工具都遵循以下结构：

```typescript
interface ToolDefinition {
  type: "function"
  function: {
    name: string            // 唯一的工具名称，蛇形命名（snake_case）
    description: string     // 工具的用途说明（模型会读取此内容！）
    parameters: {           // 参数的 JSON Schema
      type: "object"
      properties: { ... }
      required: string[]
    }
  }
}

interface ToolExecResult {
  output: unknown           // 返回给模型的结果对象
  savedDraft?: Draft        // save_character_draft 成功后提供给 UI 的草稿
  creationPlan?: NeoCreationPlan
  personalityPalette?: NeoPersonalityPalette
  evaluationReport?: NeoBuilderEvaluationReport
  mvu?: NeoMvuConfig
  statusBars?: NeoStatusBarConfig
  choices?: NeoBuilderChoice[]
  questions?: NeoBuilderQuestion[]
  stopForUser?: boolean     // 如果为 true，暂停生成等待用户交互
}
```

### Builder 工具分组

`WhaleBuilderToolRegistry` 维护两套发送给模型的工具集合：

| 模式 | 工具 |
| ---- | ---- |
| Chat | `read_skill_reference`、`ask_user_options`、`present_creation_plan`、`web_search`、`validate_character_draft`、`save_character_draft`、`list_skill_references`、`evaluate_character_draft`、`record_entry_output` |
| One-shot | `read_skill_reference`、`list_skill_references`、`validate_character_draft`、`save_character_draft`、`evaluate_character_draft`、`record_entry_output` |

---

## Whale Builder 中的技能

技能是角色创建工作流中专用的工具指令。与执行任意代码的通用工具不同，**技能**定义的是：

1. **工作流**——AI 遵循的步骤序列
2. **数据格式**——角色卡、世界书条目、MVU 配置的 schema
3. **写作规则**——风格和结构指南
4. **验证规则**——什么是有效的草稿

### 技能提示词注入

当 Builder 启动时，系统提示词告诉模型：

1. 调用 `read_skill_reference('SKILL.md')` 来加载技能入口点
2. 技能是工作流、格式和规则的单一数据源
3. 不确定下一步读什么时使用 `list_skill_references`
4. 草稿完成后调用 `save_character_draft`

技能参考文档位于：

```
apps/desktop/src/features/character/builder/skill/references/
```

### 工具注入位置

| 内容                         | 注入方法                                    | 位置                                  |
| ---------------------------- | ------------------------------------------- | ------------------------------------- |
| 系统规则（System Rules）     | `buildChatPrompt` 的 `systemRules` 参数     | 消息列表，位置 0                      |
| 预设项（Preset Items）       | `buildChatPrompt` 的 `presetItems` 参数     | 系统规则之后，角色块之前              |
| 角色块（Character Block）    | `buildChatPrompt` 的 `character` 参数       | 预设项之后                            |
| 用户人设（User Persona）     | `buildChatPrompt` 的 `userPersona` 参数     | 角色块之后                            |
| 世界书（静态）               | `ContextBlock`，`position: "beforeHistory"` | 用户人设之后，历史之前                |
| 世界书（召回）               | `ContextBlock`，`position: "afterHistory"`  | 历史之后，用户输入之前                |
| Agentic Play 状态            | `ContextBlock`，`position: "afterHistory"`  | 历史之后，用户输入之前                |
| 工具定义（Tools Definition） | OpenAI `tools` 参数                         | 随 API 请求发送，不在提示词文本中     |
| 工具结果（Tool Results）     | `role: "tool"` 消息                         | 在调用该工具的 assistant 消息之后插入 |

---

## 添加新工具

要为 Agentic Play 添加新工具：

1. **添加定义**到 `agentic-play.ts` 中的 `AGENTIC_PLAY_TOOL_DEFINITIONS`——包括名称、描述和 JSON Schema 参数。
2. **实现处理器**在 `executeTool()` 中——解析参数、执行操作、返回 `{ nextState, result }`。
3. **设置 `stopForUser`** 如果该工具需要暂停生成等待用户交互。
4. **更新 agentic-play 测试**在 `agentic-play.test.ts` 中。

要为 Whale Builder 添加新工具：

1. **添加定义**到 `tool-registry.ts` 中的 `COMMON_TOOLS` 或 `CHAT_ONLY_TOOLS`。
2. **实现私有处理器**方法在 `WhaleBuilderToolRegistry` 上。
3. **连接**到 `execute()` 的 `switch` 分支。
4. **添加 spec**到执行循环的 `ONE_SHOT_SPECS` 或 `CHAT_TOOL_SPECS` 中。
