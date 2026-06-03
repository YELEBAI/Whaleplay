# Whale Play 字段与世界书约定

## 角色字段

- name：简短明确的角色名。
- description：身份、外观、说话方式、关系入口、可观察信息。
- personality：核心动机、行为倾向、压力反应、亲近后的变化、边界。
- scenario：开局环境、当前冲突、用户如何进入场景。
- firstMessage：角色已经发出的第一条消息，不写说明书。
- exampleDialogues：用短对话展示角色声音。
- tags：2-6 个短标签。

## 世界书条目

- title：短标题，清楚标记内容。
- type：always 或 trigger。
- position：always 默认 beforeHistory；trigger 默认 afterHistory。
- keys：trigger 必填，always 可空。
- content：模型需要记住的事实、规则或约束。
- role：默认 system。
- priority：越重要越高，建议从 100 递减。
- enabled：默认 true。

## keywords 建议

- 角色：角色名、昵称、外号。
- NPC：姓名、职务、组织称呼。
- 地点：全名、简称、所在地名。
- 组织：全名、简称、成员称呼。

约束：

- 严禁单汉字关键词。
- 避免过泛词：老师、学校、城市、协会这类词要加限定。
- 避免成语或常见短语作为关键词。
- 多个 keys 用逗号分隔。

## 条目拆分

- 前置世界书：不依赖关键词、每轮都重要的底层规则。
- 召回世界书：只有提到角色、地点、组织、事件时才需要的信息。
- 世界观过长时拆成概览、地点、组织、时间线、NPC、阶段指导。

## 保存约定

最终只调用 save_character_draft。不要输出外部 patch、pack、configure 命令。
