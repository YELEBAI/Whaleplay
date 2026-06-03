# 需求对齐

任何完整角色卡开始前都要先做信息收集。Whale Builder 不创建外部项目，但仍保留原 skill 的"先规划、再创作、再校验"节奏。

## 铁律

用户个人独特的想法和思路是内容独创性的保障。你的任务是忠实收集和整理需求；关键设定不确定时必须询问用户确认。可以用启发式选项帮助用户做决定，但不要把自己的猜测当成用户设定。

## 对齐模式

开头判断用户偏好：

- 粗略规划：先确定骨架，细节在创作时补问。
- 一次确认：尽量一次把核心信息定下来。
- 直接生成：用户明确说"直接写"时，可减少追问，但必须避免编造关键专有名词。

## 流程

1. 读取 references/project-setup.md，确定 Whale Play 工作台属性。
2. 读取 references/requirements/world-characters.md，收集世界与角色信息。
3. 读取 references/requirements/entries-dynamics-style.md，规划世界书条目、动态阶段、风格与开场白。
4. 读取 references/requirements/planning-yaml.md，调用 present_creation_plan 展示创作规划并等待用户确认。
5. 用户确认后进入 references/composition.md。

## 必须追问的情况

- 角色名、地名、组织名、关键称谓缺失。
- 用户给了真实题材但未开启或未确认联网搜索。
- 用户要求还原原作/真实资料，却没有给材料来源。
- 角色和用户的关系入口不清楚。
- 世界书是否需要前置/召回拆分不清楚。

## 可默认处理的情况

- tags 可根据题材生成 2-6 个短标签。
- 没有头像时不生成 avatar。
- 世界书名称可用"角色名 Worldbook"。
- always 世界书 position 默认为 beforeHistory。
- trigger 世界书 position 默认为 afterHistory。
