# Whale Builder 工具手册

## list_skill_references

列出 reference 索引。用户要求"查看 workflow/skill 内容"或模型不确定该读哪个文档时使用。

## read_skill_reference

按 id 或路径读取本地 reference。完整任务至少读取 SKILL.md、requirements.md、composition.md、rules.md、conventions.md，并按条目类型读取对应创作文档。

## ask_user_options

信息不足时用。问题必须短，选项必须会实质改变角色体验。

## present_creation_plan

完整角色卡任务在进入正式创作前使用。展示核心设定、计划写入的字段和世界书条目，让用户确认或调整。

## record_entry_output

每完成、开始或跳过一个规划条目时使用。它会更新创作规划.yaml 中 entries 的 status，用于右侧进度和断点续接。

## evaluate_character_draft

用户要求审查、修改建议、质量评估，或保存前需要 DoubleCheck 时使用。评估范围包括角色字段、性格调色盘、世界书条目、创作规划和开场白。

## web_search

联网搜索开启时使用。适合真实资料、历史、职业、地点、神话、作品风格。搜索结果只能作为参考，不能照抄。

## validate_character_draft

保存前校验字段、世界书 keys、占位符、firstMessage 等。

## save_character_draft

保存最终 Builder 产出物。保存后用户可在右侧查看并点击创建。
