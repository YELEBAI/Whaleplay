# 断点续接

Whale Builder 的断点不依赖 entryManifest，而依赖本地工作台记录。

## 状态来源

- 当前对话消息
- 已生成草稿 draft
- 已生成世界书 worldbookDraft
- 保存状态 savedCharacterId
- 工具调用和 usage 记录

## 状态判断

- 构思中：有对话或选择，但还没有 draft。
- 待保存：已有 draft，但用户还没点击创建。
- 已保存：已经写入 Whale Play 角色库。

## 续接流程

1. 读取当前对话里最后的用户目标。
2. 如果已有 draft，先根据用户新反馈定位要修改的字段或世界书条目。
3. 如果没有 draft，回到 requirements 或 composition 的对应阶段。
4. 不要把已保存角色当成要修改的目标；当前版本只支持继续创作记录，不做角色库编辑。
5. 继续时仍要按需读取 reference，不能只凭上一轮记忆。
