# Whale Play 运行时配置

Whale Builder 的配置是世界书条目字段，不需要外部 configure。

## position

- beforeHistory：插入在历史之前，适合常驻身份、世界底层规则、写作约束。
- afterHistory：插入在历史之后，适合关键词召回的信息。
- atDepth：特殊深度插入，除非用户明确需要，默认不使用。

## type

- always：常驻条目。keys 可空，通常 beforeHistory。
- trigger：召回条目。keys 必填，通常 afterHistory。

## priority

建议：

- 100：核心身份、世界底层规则、强约束。
- 80-95：核心角色、当前场景、主要组织。
- 50-75：地点、NPC、时间线、道具。
- 30-50：补充背景。

## triggerMode

- or：任一关键词命中即可召回，默认使用。
- and：需要多个条件同时命中，只有用户明确要求精准触发时使用。

## scanDepth

默认不写。需要让召回只看最近若干轮时再设置。
