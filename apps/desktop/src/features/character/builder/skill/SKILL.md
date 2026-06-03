---
name: neo-character-builder
description: "创建、补全、评估 Whale Play 原生角色卡和世界书。覆盖角色基础信息、世界观、NPC、场景、事件、文风、开场白、前置世界书和关键词召回世界书。支持从零创作、从现有材料转化、联网资料辅助和断点续接。确保在用户提到角色设定、人设卡、character card、角色卡、世界书、世界观设定、NPC 设定、文风指导、开场白、创作规划等需求时使用。当前 Whale Builder 不生成 MVU、EJS、SillyTavern forge、外部项目目录、脚本文件或打包说明。"
---

# Whale Play 角色卡与世界书编写

帮助用户创建 Whale Play 原生角色卡与可绑定世界书。这个 skill 复刻 tavern-cards 的分层能力：先用 SKILL.md 路由，再按阶段读取 references/ 下的规则；区别是所有产出都落在 Whale Builder 的草稿、世界书条目和本地创作记录里，不写外部工程文件。

## 术语说明

"角色卡"在 Whale Builder 中指 Whale Play 角色库里可保存的一张角色实体，字段包括 name, description, personality, scenario, firstMessage, exampleDialogues, tags。一个 Builder 工作台可以同时产出世界书条目，用户点击创建后绑定到该角色。

"世界书"指长期背景和召回规则。always 条目是前置世界书，默认 position 为 beforeHistory；trigger 条目是关键词召回世界书，默认 position 为 afterHistory。

## 用户占位约定

默认不要替用户决定身份、动作或情绪。若用户明确要求使用 {{user}} 或 <user>，可以在 firstMessage、exampleDialogues 或世界书内容中保留占位。

## 场景路由

判断三个维度，组合决定流程：

1. 任务阶段：创建 / 修改草稿 / 评估
2. 创建来源：从零 / 从材料转化 / 联网资料辅助
3. 任务范围：完整角色卡 / 局部字段 / 世界书条目 / 开场白

| 组合 | 流程 |
|------|------|
| 创建 + 从零 + 完整角色卡 | 需求对齐：项目属性 -> 需求对齐：世界/角色/条目 -> 创作规划确认 -> 条目与字段创作 -> 开场白 -> 校验 -> 保存草稿 |
| 创建 + 从材料 + 完整角色卡 | 材料转化 -> 需求对齐缺口 -> 创作规划确认 -> 条目与字段创作 -> 开场白 -> 校验 -> 保存草稿 |
| 创建 + 联网资料辅助 | 联网搜索 -> 资料提炼 -> 创作规划确认 -> 转化为角色字段和世界书 -> 校验 -> 保存草稿 |
| 创建 + 局部任务 | 直接定位对应规则文档，不强制完整流程 |
| 修改草稿 + 局部任务 | 读取当前对话、草稿和用户反馈 -> 定位字段或条目 -> 加载对应规则 -> 修正并校验 |
| 修改草稿 + 完整项目 | 断点续接 -> 检查进度与产出物 -> 回到对应步骤继续 |
| 评估 | 分析字段完整性、世界书召回、写作质量和一致性，给出修正建议 |

## 完整项目流程

1. 需求对齐：项目属性 -> references/requirements.md
2. 从材料转化时先执行 -> references/conversion.md
3. 需求对齐：世界/角色/条目 -> references/requirements/world-characters.md 与 references/requirements/entries-dynamics-style.md
4. 产出 Whale Play 创作规划并等待用户确认 -> references/requirements/planning-yaml.md
5. 按规划创作角色字段和世界书条目 -> references/composition.md
6. 按条目类型读取对应创作文档：
   - 角色：references/contents-creation/character/
   - 世界观：references/contents-creation/worldbuilding/
   - 开场白：references/contents-creation/first-message.md
   - 扮演准则和阶段指导：references/contents-creation/presentation.md 与 references/contents-creation/stage-guidance.md
7. 运行 Whale Play 校验 -> validate_character_draft
8. 保存 Builder 产出物 -> save_character_draft

## Whale Play 与原 tavern-cards 的映射

- tavern-cards 的项目目录 -> Whale Builder 本地工作台记录
- 创作规划.yaml -> present_creation_plan 工具展示的创作规划
- entryManifest 注册 -> save_character_draft 的 worldbookEntries
- 蓝灯/常驻条目 -> always + beforeHistory
- 绿灯/关键词条目 -> trigger + afterHistory
- pack/configure/forge -> 不生成；由 Whale Play 的创建按钮保存角色和世界书
- MVU/EJS -> 当前不生成；动态阶段用普通世界书条目和场景指导表达

## 工具参考

- list_skill_references：列出内置 reference 索引
- read_skill_reference：读取指定 reference
- ask_user_options：信息不足时给用户选项
- present_creation_plan：展示 Whale Play 创作规划并等待确认
- record_entry_output：登记规划条目的执行状态
- evaluate_character_draft：评估当前草稿并给出修改建议
- web_search：联网搜索真实资料，需联网开关开启
- validate_character_draft：校验角色草稿和世界书条目
- save_character_draft：保存最终 Builder 产出物

## 参考资料

此索引是 Whale Builder 内置 references 的权威来源。标注"按需查阅"的为参考层，其余为主动加载文档。

~~~
references/
├── requirements.md
├── composition.md
├── rules.md
├── conventions.md
├── conversion.md
├── project-setup.md
├── resume.md
├── configuration.md
├── manual.md
├── requirements/
│   ├── world-characters.md
│   ├── entries-dynamics-style.md
│   ├── planning-yaml.md
│   └── entry-types.md
├── contents-creation/
│   ├── worldbook.md
│   ├── first-message.md
│   ├── presentation.md
│   ├── stage-guidance.md
│   ├── character/
│   │   ├── basic-info.md
│   │   ├── personality-palette.md
│   │   ├── multi-stage.md
│   │   ├── tri-faceted.md
│   │   ├── rephrase.md
│   │   ├── npc.md
│   │   └── character-catalog.md
│   └── worldbuilding/
│       ├── worldview.md
│       ├── timeline.md
│       └── geography.md
└── type/
    ├── state.ts
    └── settings.ts
~~~
