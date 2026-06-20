# Agentic Play

## 什么是 Agentic Play？

Agentic Play 是 Whale Play 内置的一种**实验性游戏主持人模式**。不同于与普通角色聊天，你将步入一个由 AI 叙述者驱动的故事，该叙述者扮演桌面游戏主持人（GM）的角色。

在此模式下：

- AI 将普通的角色预设替换为一个专门的 **GM 人设**——它负责设定场景、控制 NPC 并判定结果。
- 系统会在每条 prompt 中注入一个**结构化的场景状态**（包含地点、NPC、活跃任务、背包、危险等级以及完整的事件日志），使 GM 始终了解当前情况。
- GM 拥有**三个真实工具**：掷骰子、结构化玩家选项以及游戏状态追踪。

最终效果是一个回合制的叙事游戏，GM 描述世界、为你提供有意义的选项、用真实的骰子判定风险，并推动故事向前发展。

![Agentic Play 聊天掷骰](../../images/agentic-play-chat.png)

---

## 如何开始

1. 与任意角色打开聊天。
2. 在模式选择对话框中点击 **"Experiment Mode"**。
3. GM 人设将接管对话。你会看到骰子结果内联显示，输入栏上方出现可点击的操作按钮。

激活后，该模式会向 prompt 中注入四个预设模块：

| 模块             | 用途                                             |
| ---------------- | ------------------------------------------------ |
| `core_rules`     | 开场场景规则、角色登场、行动裁决、输出格式       |
| `writing_style`  | 沉浸式叙述、选项设计、工具使用风格               |
| `specific_rules` | 断点选项、自定义行动流程、掷骰时机、状态更新规则 |
| `host_style`     | 公正裁决、失败推进叙事、核心角色存在感           |

---

## 游戏流程

一个典型的回合流程如下：

```
1. GM 描述当前场景
2. GM 提供恰好 5 个带成功率和难度 DC 的选项
3. 你点击某个选项（或输入自定义行动）
4. GM 调用 roll_dice，判定成功/失败，叙述结果
5. GM 调用 update_game_state 追踪变化（生命值、物品、标记）
```

这个循环会自动运行——模型自行决定何时掷骰、何时提供选项以及何时更新状态。

### 示例回合

**GM：** _走廊向左右两侧延伸。微弱火炬的光芒从右侧通道闪烁而来，而左侧则渗入一股冷风。你怎么办？_

| 选项                     | 难度            |
| ------------------------ | --------------- |
| 调查火炬光芒（潜行）     | 困难（DC 15）   |
| 跟随冷风（感知）         | 中等（DC 12）   |
| 移动前先仔细聆听         | 简单（DC 8）    |
| 大声呼喊看看是否有人回应 | 高风险（DC 18） |

**你点击** → "跟随冷风"

**GM 掷骰** → `roll_dice("1d20", +3, difficulty 12)` → 总计 **14** → **成功！**

**GM 叙述** → _冷风将你引向一个隐藏的补给藏匿点……_

---

## 掷骰子

GM 通过 `roll_dice` 工具使用**真实的随机骰子**——而非模拟的叙述性结果。

```yaml
roll_dice(
  dice: "2d6",
  modifier: 2,
  difficulty: 12,
  success_probability: 70,
  reason: "说服守卫让你通过"
)
```

### 参数

| 参数                  | 类型    | 描述                                        |
| --------------------- | ------- | ------------------------------------------- |
| `dice`                | string  | 骰子表达式，例如 `"1d20"`、`"2d6"`、`"3d8"` |
| `modifier`            | integer | 可选的固定修正值（例如 +2、-1）             |
| `difficulty`          | integer | 可选的目标难度 DC                           |
| `success_probability` | integer | AI 预估的成功率（5–95）                     |
| `reason`              | string  | 进行该次掷骰的原因                          |

### 执行过程

1. 解析骰子表达式 → 骰子数量、面数
2. 如果提供了 `success_probability`，且表达式为 `1d20` 且未提供 `difficulty`，系统会自动转换：`difficulty = 21 + modifier - round(success_probability / 5)`
3. 执行一次真实的随机掷骰
4. 内联返回结果，显示成功/失败标识

**结果示例：**

```
→ 掷骰：[6, 4]，总计：10 + 2 = 12，DC：12 → 成功！
```

---

## 玩家选项

当 GM 调用 `present_player_options` 时，聊天会暂停，并在输入栏上方以**可点击按钮**的形式显示结构化的选项。

```yaml
present_player_options(
  scene_text: "走廊向左右两侧延伸……",
  question: "你走哪条路？",
  options: [
    { label: "向左走入黑暗", action: "我小心地向左前进", success_probability: 60, difficulty: 9 },
    { label: "向右走向火炬", action: "我朝光亮走去", success_probability: 75, difficulty: 6 },
    { label: "先听听", action: "我把耳朵贴在墙上听动静", success_probability: 90, difficulty: 3 },
    { label: "检查地面痕迹", action: "我查看地面是否有脚印或拖痕", success_probability: 70, difficulty: 7 },
    { label: "大声呼喊", action: "我向走廊深处喊话试探回应", success_probability: 45, difficulty: 12 }
  ]
)
```

每个选项包含：

- **Label** — 按钮上的简短文字
- **Action** — 点击后发送回 AI 的完整叙述性行动
- **Success Probability** — GM 对该行动成功可能性的预估
- **Difficulty** — 1d20 总值达到该 DC 即视为成功
- **Description**（可选）— 额外的描述性文字

选项应由工具生成，而不是写进正文。若模型把选项、成功率或 DC 写入叙述文本，系统会在显示前清理这些内联选项；如果当前回合必须停在玩家选择处，系统会要求模型重新调用 `present_player_options`。

---

## 游戏状态追踪

GM 维护着一个结构化的场景状态，并在每次有意义的变化后通过 `update_game_state` 进行更新。

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

状态补丁采用**深度合并**——对象递归合并，数组和原始值则直接替换。这意味着你可以只更新单个字段（如 `player.hp`），而无需重写整个状态。

---

## 获得良好体验的技巧

- **行动时描述详细一些**——GM 会利用你的输入来塑造场景。
- **预料之外的事情**——失败推动故事前进，而非阻碍故事。
- **尝试自定义行动**——你可以不点按钮，直接在输入框写出 AI 能够理解的任何行动。
- **状态在每个会话中持续存在**——你的生命值、背包和任务进度会持续追踪，直到你开始新游戏。

> 截图存放于 docs/images/ 目录，命名方式见英文版对应文档。
