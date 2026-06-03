# Whale Play 创作规划结构

Whale Builder 不写外部文件，但完整项目必须生成等价的创作规划对象，并在右侧以"创作规划.yaml"产出物展示。该对象是断点续接、逐条产出和编辑评估的事实来源。

## present_creation_plan 参数建议

- projectName：项目或角色名。
- worldbookName：计划生成的世界书名称。
- sourceType：原创 / 用户材料 / 联网资料 / 混合。
- planningMode：粗略规划 / 一次确认 / 直接生成。
- summary：一句话说明创作方向。
- characterPlan / characters：角色名、身份、关系入口、核心冲突。
- personalityPalette：底色、主色调、点缀、衍生。
- worldPlan / world：世界观、地点、组织、规则。
- entryPlan：计划生成的世界书条目列表，每条必须有 name、type、purpose，最好有 keys。
- firstMessagePlan / firstMessage：开场方式。
- openQuestions：必须用户确认的问题。
- yaml：可选；不传时工具会自动生成。
- options：确认或调整的可点击选项。

## YAML 结构

~~~yaml
project:
  name: xxx
  worldbookName: xxx
  form: charactercard
  sourceType: 原创
  planningMode: 粗略规划

world:
  overview: xxx
  regions:
    - xxx
  factions:
    - xxx

characters:
  - name: xxx
    identity: xxx
    relationship: xxx
    palette:
      base: xxx
      main:
        - xxx
      accents:
        - xxx

style:
  perspective: 第三人称
  tone: 克制、直接
  mood: 悬疑

entries:
  - id: entry_1
    name: 世界设定
    type: 世界观
    path: 世界书/世界观/世界设定.yaml
    purpose: 约束底层世界规则
    status: planned
    keywords:
      - xxx

first_message:
  format: 叙事式
  word_count: 120-350
  scene: xxx
  opening_situation: xxx
~~~

## 展示给用户的确认内容

- 角色名、地名、组织名是否正确。
- 性格调色盘的底色、主色调、点缀是否符合用户想法。
- 哪些性格衍生需要用户亲自补。
- 角色和用户的关系入口是否符合预期。
- 世界书条目数量和类型是否合适。
- 是否需要联网搜索补资料。
- firstMessage 的切入点是否正确。

## 何时可以跳过确认

用户明确说"直接生成""不用问""你决定"，且没有关键专有名词缺失时，可以直接进入创作。但仍要生成 creationPlan，并在保存前调用 validate_character_draft。
