# Whale Play 工作台创建

Whale Builder 不运行 forge init，不写 .cardrc.json，不创建外部目录。项目创建在这里等价于确定当前 Builder 工作台的属性。

## 要收集的项目属性

- projectName：默认使用角色名或用户给的作品名。
- outputType：完整角色卡 / 局部字段 / 世界书 / 开场白 / 评估。
- sourceType：原创 / 用户材料 / 联网资料 / 混合。
- worldbookRequired：是否需要世界书。
- searchRequired：是否需要真实资料或联网搜索。
- planningMode：粗略规划 / 一次确认 / 直接生成。

## Whale Play 保存语义

- save_character_draft 只保存 Builder 产出物，不写入角色库。
- 用户点击右侧"创建"后，Neo 才创建 Character，并将世界书绑定到角色。
- 本地创作记录自动保存，包括构思中、待保存、已保存三个状态。

## 禁止项

- 不生成 MVU、EJS、forge 命令、patch 命令、项目目录、模板文件。
- 不向用户输出"请复制到某文件"这类外部工程步骤。
- 不把 Whale Builder 的本地存储说成用户需要手动维护的文件。
