# Whale Play 世界书条目创作

## always 条目

- type：always。
- position：beforeHistory。
- keys：可为空。
- 用于角色底层规则、世界核心规则、扮演准则。
- 内容必须短，避免和角色字段重复。

## trigger 条目

- type：trigger。
- position：afterHistory。
- keys：必填。
- 用于 NPC、地点、组织、事件、道具、阶段规则。
- keys 不得使用单汉字，不得过泛。

## 内容写法

- 只写模型需要记住并执行的信息。
- 不写"这个条目的作用是"。
- 每条建议 80-240 字。
- 长设定拆成多个条目。
- 重要条目 priority 更高。

## 检查

- trigger 有 keys。
- keys 能自然被用户或模型说到。
- content 无占位符。
- 与角色字段不矛盾。
