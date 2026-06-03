# 创作执行

根据已确认的 Whale Play 创作规划执行角色字段、世界书条目、开场白和最终草稿保存。

## 前置必读

开始创作前必须先加载：

- references/rules.md：写作规则。
- references/conventions.md：Whale Play 字段、世界书、关键词和保存约定。

## 执行原则

- 创作规划是本轮事实来源，按规划顺序执行。
- 可以根据依赖调整执行顺序，但不得漏掉用户确认过的关键条目。
- 信息不足时先 ask_user_options，不要硬编关键名称。
- 每个条目写完都要做质量扫描，最后统一 validate_character_draft。

## 推荐顺序

1. 世界观概览：如果世界观会影响角色行为，先写。
2. 地点/组织/时间线：只写模型会用错的差异信息。
3. 核心角色：基础信息 -> 性格调色盘 -> 三面性或多阶段 -> 二次解释。
4. NPC/关系：只写会影响互动的 NPC。
5. 扮演准则/阶段指导：约束叙事方式或剧情推进。
6. firstMessage：最后写，确保它和 scenario、关系入口一致。

## 条目创作循环

对每个世界书条目：

1. 读取对应创作规则文档。
2. 编写内容，遵守 rules.md。
3. 禁词和空泛扫描：绝对零度、八股化、具体性。
4. 设置 type、keys、position、priority。
5. 放入 save_character_draft 的 worldbookEntries。

## DoubleCheck

保存前必须检查：

- name、description、personality、scenario、firstMessage 必填。
- firstMessage 不替用户行动。
- trigger 条目有 keys，且没有单汉字关键词。
- always 条目用于前置规则，trigger 条目用于召回事实。
- 角色和世界观不互相矛盾。
- 没有某城市、某组织、待定、TODO 等占位符。
- 输出面向用户可读，不展示原始 JSON。
