# Agentic Play

## What is Agentic Play?

Agentic Play is an **experimental game-master mode** built into Whale Play. Instead of chatting with a regular character, you step into a story driven by an AI narrator who acts as a tabletop Game Master (GM).

In this mode:

- The AI replaces the normal character preset with a dedicated **GM persona** — it sets scenes, controls NPCs, and judges outcomes.
- The system injects a **structured scene state** (location, NPCs, active quests, inventory, danger levels, and a full event log) into every prompt, so the GM always knows what's happening.
- The GM has access to **three real tools**: dice rolling, structured player choices, and game-state tracking.

The result is a turn-based narrative game where the GM describes the world, presents you with meaningful choices, rolls real dice to resolve risk, and keeps the story moving forward.

![Agentic Play chat with dice roll](../../images/agentic-play-chat.png)

---

## How to Start

1. Open a chat with any character.
2. Click **"Experiment Mode"** in the mode selection dialog.
3. The GM persona takes over. You'll see dice results appear inline and clickable action buttons above the input bar.

Once activated, the mode injects four preset modules into the prompt:

| Module           | Purpose                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| `core_rules`     | Opening scene rules, character entrances, action resolution, output format |
| `writing_style`  | Immersive narration, option design, tool usage style                       |
| `specific_rules` | Breakpoint options, custom action flow, dice timing, state update rules    |
| `host_style`     | Fair judgment, fail-forward storytelling, core character presence          |

---

## Gameplay Flow

A typical turn plays out like this:

```
1. GM describes the current scene
2. GM presents exactly 5 options with success probabilities and DCs
3. You click an option (or type a custom action)
4. GM calls roll_dice, checks success/failure, narrates the result
5. GM calls update_game_state to track changes (health, items, flags)
```

The loop runs automatically — the model decides when to roll, when to present options, and when to update state.

### Example Turn

**GM:** _The corridor branches left and right. Faint torchlight flickers from the right passage, while a cold draft seeps from the left. What do you do?_

| Option                               | Difficulty     |
| ------------------------------------ | -------------- |
| Investigate the torchlight (Stealth) | Hard (DC 15)   |
| Follow the cold draft (Perception)   | Medium (DC 12) |
| Listen carefully before moving       | Easy (DC 8)    |
| Call out to see if anyone answers    | Risky (DC 18)  |

**You click** → "Follow the cold draft"

**GM rolls** → `roll_dice("1d20", +3, difficulty 12)` → total **14** → **Success!**

**GM narrates** → _The draft leads you to a hidden supply cache..._

---

## Dice Rolling

The GM uses **real random dice** via the `roll_dice` tool — not simulated narrative outcomes.

```yaml
roll_dice(
  dice: "2d6",
  modifier: 2,
  difficulty: 12,
  success_probability: 70,
  reason: "Persuade the guard to let you pass"
)
```

### Parameters

| Parameter             | Type    | Description                                      |
| --------------------- | ------- | ------------------------------------------------ |
| `dice`                | string  | Dice expression, e.g. `"1d20"`, `"2d6"`, `"3d8"` |
| `modifier`            | integer | Optional flat modifier (e.g. +2, -1)             |
| `difficulty`          | integer | Optional target difficulty DC                    |
| `success_probability` | integer | AI's estimated success chance (5–95)             |
| `reason`              | string  | Why the roll is being made                       |

### Execution

1. Parse the dice expression → count, sides
2. If `success_probability` is provided with a `1d20` expression and no `difficulty`, the system auto-converts: `difficulty = 21 + modifier - round(success_probability / 5)`
3. Perform a real random roll
4. Return the result inline with success/failure indication

**Result example:**

```
→ rolls: [6, 4], total: 10 + 2 = 12, DC: 12 → Success!
```

---

## Player Options

When the GM calls `present_player_options`, the chat pauses and displays structured choices as **clickable buttons** above the input bar.

```yaml
present_player_options(
  scene_text: "The corridor branches left and right...",
  question: "Which path do you take?",
  options: [
    { label: "Go left into the darkness", action: "I carefully proceed left", success_probability: 60, difficulty: 9 },
    { label: "Go right toward the torchlight", action: "I head toward the light", success_probability: 75, difficulty: 6 },
    { label: "Listen first", action: "I press my ear to the wall and listen", success_probability: 90, difficulty: 3 },
    { label: "Check the floor", action: "I inspect the floor for tracks or drag marks", success_probability: 70, difficulty: 7 },
    { label: "Call out", action: "I call into the corridor and listen for a response", success_probability: 45, difficulty: 12 }
  ]
)
```

Each option includes:

- **Label** — Short button text
- **Action** — The full narrative action sent back to the AI when clicked
- **Success Probability** — The GM's estimate of how likely the action is to succeed
- **Difficulty** — The 1d20 DC that must be met or beaten
- **Description** (optional) — Additional flavor text

Options should be produced by the tool, not written into prose. If the model writes options, success rates, or DCs into narration, the app cleans those inline options before display; when the turn must stop for player choice, the app asks the model to call `present_player_options` again.

---

## Game State Tracking

The GM maintains a structured scene state and updates it with `update_game_state` after every meaningful change.

```ts
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

State patches are **deep-merged** — objects merge recursively, while arrays and primitive values are replaced. This means you can update a single field (like `player.hp`) without rewriting the entire state.

---

## Tips for a Great Experience

- **Be descriptive** in your actions — the GM uses your input to shape the scene.
- **Expect the unexpected** — failures push the story forward, not block it.
- **Try custom actions** — you can ignore the buttons and type any action the AI can interpret.
- **State persists per session** — your health, inventory, and quest progress are tracked until you start a new game.
