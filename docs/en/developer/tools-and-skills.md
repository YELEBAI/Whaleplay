# Tools & Skills System

Whale Play uses a **tools/skills** architecture to let language models call typed functions during generation. Two contexts use this system:

- **Agentic Play** — AI-driven game master mode with three built-in tools
- **Whale Builder** — AI-assisted character/worldbook creation with a skill-based workflow

Both share the same underlying mechanism: the model declares a tool call via the API, the runtime executes it on the client, and the result is fed back into the conversation.

---

## Agentic Play Tools

Agentic Play tools are defined in `apps/desktop/src/features/agentic-play/agentic-play.ts` and registered as OpenAI function-calling tool definitions. The model calls them during `generateAgenticPlayTurn`.

### 1. `roll_dice` — Real Dice Roll

Executes a physical dice roll for uncertain RPG actions.

```typescript
Parameters:
  dice:                string   // Dice expression, e.g. "1d20", "2d6", "3d10"
  modifier:            integer  // Optional modifier added to the total (default: 0)
  difficulty:          integer  // Optional target Difficulty Class (DC)
  success_probability: integer  // AI's estimated success probability (5-95)
  reason:              string   // Why this roll is needed

Execution:
  1. Parse the dice expression → { count, sides }
  2. If `success_probability` is provided and expression is "1d20"
     and `difficulty` is omitted:
       → Auto-convert: difficulty = 21 + modifier - round(success_probability / 5)
  3. Roll `count` random numbers from 1 to `sides` using Math.random()
  4. Sum rolls, add modifier → total
  5. Determine outcome:
       • rolls[0] === 20  → "critical_success"
       • rolls[0] === 1   → "critical_failure"
       • total >= difficulty → "success"
       • total < difficulty  → "failure"
       • otherwise → "rolled"
  6. Return result object

Return:
  {
    dice,             // original expression
    rolls,            // array of individual die results
    roll,             // sum of rolls (before modifier)
    modifier,
    total,            // roll + modifier
    difficulty,       // effective DC used
    successProbability,
    outcome,          // "critical_success" | "success" | "failure" | "critical_failure" | "rolled"
    reason
  }
```

### 2. `present_player_options` — Structured Breakpoint Options

Stops generation and presents clickable action buttons to the player.

```typescript
Parameters:
  scene_text: string   // Visible narration up to the breakpoint (no options inline)
  question:  string    // Short question shown above the option panel
  options:   array     // Exactly 5 options, each with:
    ├─ label:                string  // Short label or full action text
    ├─ action:               string  // Exact instruction to send back on selection
    ├─ success_probability:  integer // Est. success probability (0-100)
    └─ description?:         string  // Optional note on risk or consequence

Execution:
  1. Normalize options (validate, assign IDs, trim labels)
  2. Set stopForUser = true
  3. Return scene_text + options to the UI
  4. UI renders clickable buttons above the input bar
  5. Player clicks a button (or types custom input)
  6. Selected action text becomes the next user input

Return:
  {
    ok:       boolean,  // true if >= 2 valid options
    question: string,
    options:  AgenticActionOption[]
  }
```

### 3. `update_game_state` — Patch Scene State

Updates the structured game state after a turn changes location, inventory, NPCs, quests, or flags.

```typescript
Parameters:
  state_patch: object   // JSON patch; objects deep-merged, arrays/primitives replace
  reason:      string   // Short explanation for the update

Execution:
  1. Validate that state_patch is a record
  2. Deep-merge state_patch into current AgenticGameState
  3. Normalize the merged state (ensure all required fields exist)
  4. Return the updated state

Return:
  {
    ok:           boolean,
    reason:       string,
    updated_state: AgenticGameState
  }
```

### Agentic Game State Structure

The state managed by `update_game_state`:

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

## Tool Execution Loop

The core loop lives in `generateAgenticPlayTurn` and runs as follows:

```
User Input
    │
    ▼
buildChatPrompt() → [system rules, presets, character,
                      context blocks, history, user input]
    │
    ▼
Model API (with tools + tool_choice: "auto")
    │
    ├─ No tool_calls → return content directly
    │
    └─ Has tool_calls (up to AGENTIC_PLAY_MAX_TOOL_ROUNDS = 8 rounds)
        │
        ├─ roll_dice → execute on client → push tool result message
        ├─ update_game_state → merge+normalize → push tool result message
        └─ present_player_options → set stopForUser → deliver options to UI

        │
        └─ Loop: model sees tool results + continues generation
            until no more tool_calls or stopForUser is set
```

Key details:
- **Maximum 8 tool rounds** per turn. If the model keeps calling tools beyond that, a system message forces it to produce visible content.
- Each round streams content deltas to the UI. If a tool call is received after content has been streamed, the content is **reset** and replaced with the tool-generated scene text.
- Tool results are pushed as `role: "tool"` messages so the model sees them on the next iteration.

---

## Option Cleanup and Repair

Agentic Play no longer relies on a separate `agentic-options.ts` fallback parser. Options should enter the UI through the `present_player_options` tool; if the model writes options into prose, `agentic-play.ts` cleans the visible content before rendering:

1. `stripInlineOptionList` removes numbered options, success-rate lines, and DC lines from prose
2. `sanitizeAgenticVisibleContent` filters tool-call notes, scratchpad reasoning, and internal state paragraphs
3. `normalizePlayerOptions` accepts exactly 5 valid structured options, each with success probability and 1d20 DC
4. When `requirePlayerOptions` is enabled but the model fails to call the tool, `AGENTIC_OPTIONS_REPAIR_PROMPT` forces the next round to call `present_player_options`
5. If tool calls exceed `AGENTIC_PLAY_MAX_TOOL_ROUNDS = 8`, the final round asks the model to produce visible content directly, or forces the option tool when options are required

---

## Whale Builder Tools

Whale Builder uses `WhaleBuilderToolRegistry` (`apps/desktop/src/features/character/builder/tool-registry.ts`) with a different set of tools specialized for character creation:

| Tool name                    | Purpose                                                    |
|------------------------------|------------------------------------------------------------|
| `list_skill_references`      | List available skill reference documents (supports query)  |
| `read_skill_reference`       | Read a specific skill reference document by ID             |
| `web_search`                 | Online search (requires opt-in)                            |
| `ask_user_options`           | Present structured follow-up questions (2-4 choices, or 2-5 questions at once) |
| `present_creation_plan`      | Show the character creation plan and personality palette, then wait for confirmation |
| `record_entry_output`        | Mark a planned entry as done, skipped, or in progress      |
| `evaluate_character_draft`   | Evaluate the character, worldbook, personality palette, and plan, then return actionable suggestions |
| `validate_character_draft`   | Validate a draft against skill rules; accepts `pack` or standalone fields |
| `save_character_draft`       | Save the final draft; supports `pack`, MVU, status bars, and triggers right-panel display |

Each tool has typed parameters, execution logic, and a result format — the same pattern as Agentic Play tools.

### Common Tool Pattern

All tools in Whale Play follow this structure:

```typescript
interface ToolDefinition {
  type: "function"
  function: {
    name: string            // Unique tool name, snake_case
    description: string     // What the tool does (model reads this!)
    parameters: {           // JSON Schema for the parameters
      type: "object"
      properties: { ... }
      required: string[]
    }
  }
}

interface ToolExecResult {
  output: unknown           // Result object returned to the model
  savedDraft?: Draft        // Draft provided to the UI after save_character_draft succeeds
  creationPlan?: NeoCreationPlan
  personalityPalette?: NeoPersonalityPalette
  evaluationReport?: NeoBuilderEvaluationReport
  mvu?: NeoMvuConfig
  statusBars?: NeoStatusBarConfig
  choices?: NeoBuilderChoice[]
  questions?: NeoBuilderQuestion[]
  stopForUser?: boolean     // If true, pauses generation for user interaction
}
```

### Builder Tool Groups

`WhaleBuilderToolRegistry` maintains two tool sets that can be sent to the model:

| Mode | Tools |
| ---- | ----- |
| Chat | `read_skill_reference`, `ask_user_options`, `present_creation_plan`, `web_search`, `validate_character_draft`, `save_character_draft`, `list_skill_references`, `evaluate_character_draft`, `record_entry_output` |
| One-shot | `read_skill_reference`, `list_skill_references`, `validate_character_draft`, `save_character_draft`, `evaluate_character_draft`, `record_entry_output` |

---

## Skills in Whale Builder

Skills are specialized tool instructions for character creation workflows. Unlike general tools that execute arbitrary code, a **Skill** defines:

1. **A workflow** — the sequence of steps the AI follows
2. **Data formats** — schemas for character cards, worldbook entries, MVU configs
3. **Writing rules** — stylistic and structural guidelines
4. **Validation rules** — what constitutes a valid draft

### Skill Prompt Injection

When the Builder starts, the system prompt tells the model:

1. Call `read_skill_reference('SKILL.md')` to load the skill entry point
2. The Skill is the single source of truth for workflow, format, and rules
3. Use `list_skill_references` when unsure what to read next
4. Call `save_character_draft` when the draft is complete

Skill reference documents live at:
```
apps/desktop/src/features/character/builder/skill/references/
```

### Tool Injection Position

| Content               | Injection method                              | Position                                       |
|-----------------------|-----------------------------------------------|------------------------------------------------|
| System Rules          | `buildChatPrompt` `systemRules` param         | Message list, position 0                      |
| Preset Items          | `buildChatPrompt` `presetItems` param         | After system rules, before character block     |
| Character Block       | `buildChatPrompt` `character` param           | After preset items                             |
| User Persona          | `buildChatPrompt` `userPersona` param         | After character block                         |
| Worldbook (static)    | `ContextBlock`, `position: "beforeHistory"`   | After persona, before history                 |
| Worldbook (recalled)  | `ContextBlock`, `position: "afterHistory"`    | After history, before user input              |
| Agentic Play State    | `ContextBlock`, `position: "afterHistory"`    | After history, before user input              |
| Tools Definition      | OpenAI `tools` parameter                      | Sent with API request, not in prompt text     |
| Tool Results          | `role: "tool"` message                        | Inserted after the calling assistant message  |

---

## Adding a New Tool

To add a new tool to Agentic Play:

1. **Add the definition** to `AGENTIC_PLAY_TOOL_DEFINITIONS` in `agentic-play.ts` — include name, description, and JSON Schema parameters.
2. **Implement the handler** in `executeTool()` — parse arguments, perform the action, return `{ nextState, result }`.
3. **Set `stopForUser`** if the tool should pause generation for user interaction.
4. **Update agentic-play tests** in `agentic-play.test.ts`.

To add a new tool to Whale Builder:

1. **Add the definition** to `COMMON_TOOLS` or `CHAT_ONLY_TOOLS` in `tool-registry.ts`.
2. **Implement a private handler** method on `WhaleBuilderToolRegistry`.
3. **Wire it** in the `execute()` `switch` branch.
4. **Add specs** to `ONE_SHOT_SPECS` or `CHAT_TOOL_SPECS` for the execution loop.
