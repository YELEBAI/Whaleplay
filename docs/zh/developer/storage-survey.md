# 存储全景调查与演进方案

> 最近核对：2026-06-20。本文记录当前存储事实、已确认的风险、目标架构和生产迁移方案。若与源码冲突，以源码为准并同步更新本文。

## 1. 结论

当前方案的方向是正确的：保留 repository 作为领域边界，在下方增加一个很薄的存储层，并按数据语义分流。现有 `db/kv.ts` 的前缀工厂可以继续使用，但不能把“键前缀”和“物理后端”混为一谈。

需要修正的核心结论是：

- 不是整个应用只能使用一个后端，而是**同一数据作用域中的同一份逻辑数据，在任一时刻只能有一个权威后端**。
- Tauri、REST 和 localStorage 可以是不同运行环境的 driver，但不能在每次读取同一个 key 时逐层查找，因为无法区分“权威层中不存在”和“权威层不可用”。
- localStorage 可以继续承载设备级数据；目标是消除未经约束的直接访问，不是强行让所有数据远程共享。
- plugin-store 适合偏好、系统状态和迁移元数据；持续增长、高频更新、需要查询或包含大文本/消息的数据应进入 SQLite；图片等二进制数据应进入文件系统。
- Zustand 是 UI 内存状态，不再作为角色、预设、世界书或设置的第二持久化来源。
- 生产迁移必须在业务读取、Zustand hydrate、seed 和 LAN 写入之前完成，并具备版本、备份、锁、校验和幂等重试。

## 2. 当前存储全景

### 2.1 物理存储

| 存储                | 当前用途                                   | 当前实现与限制                                                     |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| `store.json`        | 小型设置、实体 aggregate、系统与迁移状态   | `tauri-plugin-store`；Tauri 与 LAN REST 共享同一 `Store<Wry>` 实例 |
| REST `/api/store`   | LAN 浏览器访问宿主共享存储                 | 使用独立、严格的 REST driver；缺 key 不再回退 localStorage         |
| localStorage        | `device:` 设备草稿、最近聊天、聊天输入草稿 | 只通过 device adapter 访问，不承载共享数据的运行时副本             |
| sessionStorage      | JWT、设置页 tab                            | 适合当前浏览器会话的瞬态数据                                       |
| `neotavern.sqlite3` | messages、agentic play states              | 已启用 WAL；schema migration 仍是零散的列检测和数据量判断          |
| app data 文件       | Builder 工作目录等                         | 尚未形成统一 blob/asset repository                                 |

Rust 与 JavaScript 已完整接入 `tauri-plugin-store`。`store.json` 是插件的内部持久化文件，不作为人工维护的配置文件；其属性顺序不属于存储协议。

### 2.2 当前 KV 键

schema v4 起，业务代码使用以下 canonical namespace：

| 类别       | 键                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 偏好       | `prefs:theme`、`prefs:locale`、`prefs:chat:*`、`prefs:web-search:*`、`prefs:memory:*`、`prefs:billing:*`                                      |
| 用户数据   | `data:characters`、`data:chats`、`data:presets`、`data:worldbooks`、`data:model-configs`、`data:regex-presets`、`data:persona`、`data:chat-*` |
| 系统状态   | `sys:active:*`、`sys:lan:enabled`、`sys:lan:address`、`sys:lan:port`                                                                          |
| 设备数据   | `device:last-chat-id`、`device:builder-*`、`device:chat-draft:{chatId}`                                                                       |
| 会话数据   | `session:auth-token`、`session:settings-tab`、`session:secret-unlocked`                                                                       |
| 用量       | `usage:daily-cost-spend:{date}`、`usage:daily-cost-warning-notified:{date}`、`usage:secondary-api`                                            |
| 敏感数据   | `secret:web-search:tavily:api-key`、`secret:lan:password`；LAN entries 不枚举这些键                                                           |
| 迁移元数据 | `meta:schema-version`、`meta:migration:*`、`meta:migration-lock`                                                                              |

所有 `neotavern_*`、`neotavern-*`、`neo:*:v1` 键目前都是只读 legacy 来源。v4 迁移只复制、不删除；`neotavern_app_store_migrated_v1` 仍只是一条历史线索，不代表 schema 版本。

### 2.3 Zustand persist 与直接浏览器存储

四个 canonical Zustand persist（settings/characters/presets/worldbooks）均已移除。Zustand 只保存当前进程 UI 投影，repository 是持久化唯一入口。

业务代码不再直接访问 localStorage/sessionStorage。需要同步初始化的 Builder、设置 tab 和认证 token 通过 `deviceSync` / `sessionSync` 薄 adapter 访问；旧浏览器键由独立 browser-scope migration 一次性复制。

### 2.4 SQLite

| 表                    | 内容              | 当前迁移方式                                                                 |
| --------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `messages`            | 消息及树关系      | 首次访问时从 `neotavern_messages` 导入；`parent_id` 通过列存在性和后处理迁移 |
| `agentic_play_states` | Agentic Play 状态 | 首次访问时从 legacy JSON 导入                                                |

当前初始化通过“目标表是否已有任意数据”判断是否需要导入。这个判断不是 schema version：如果目标表已经有部分数据，而 legacy 中还有其他数据，无法证明迁移已经完整完成。

## 3. 已确认的问题

### 3.1 逐 key 回退会造成陈旧数据复活（已解决）

旧 `storage.ts` 把以下两种状态都转换成 `null`：

1. Tauri 后端可用，但 key 不存在；
2. Tauri 后端调用失败或超时。

随后代码继续尝试 REST 和 localStorage。删除逻辑又在第一个后端成功后立即返回，不会清理低优先级层。因此可能出现：

```text
Tauri 中删除 data:characters
→ localStorage 仍保留旧值
→ 下次读取从 localStorage 找回旧值
→ 已删除数据“复活”
```

正确做法是先按运行环境和数据作用域选择权威 driver：

- driver 正常返回 `value: null`：表示权威层确实没有值，立即结束读取；
- driver 不可用：返回独立错误，由启动流程决定是否切换整个作用域的 driver；
- 不允许业务读取根据单个 key 是否存在临时切换来源。

建议底层结果显式区分：

```ts
type ReadResult = { status: "found"; value: string } | { status: "missing" } | { status: "error"; reason: string };
```

当前业务 repository 已绑定严格 driver：Tauri、REST、本地浏览器开发在 runtime 初始化时一次选择；`missing` 不再触发跨后端查找。旧三层 facade 已删除，阶段 F 仅延迟删除 legacy 数据键。

### 3.2 首次导入与正常缺失不能依靠运行时回退区分（已解决）

权威层缺少某个 key 时，仅凭 `null` 无法知道它是：

- 尚未从 legacy localStorage 导入；
- 用户已经明确删除；
- 从未设置，应使用默认值。

这个歧义必须由迁移状态解决：

| 状态                   | 权威层缺 key 时的行为                                 |
| ---------------------- | ----------------------------------------------------- |
| legacy import 尚未完成 | 迁移器可以按规则从 legacy 补齐                        |
| legacy import 已完成   | 视为缺失、已删除或默认值，不再读取 legacy             |
| 权威 driver 不可用     | 报错或进入明确设计的离线模式                          |
| 本地层是可写副本       | 使用 revision、冲突处理和删除 tombstone，同步后再读取 |

因此，localStorage 兼容是一次显式、可重试的导入流程，不是永久运行时回退。

当前由共享 schema v1–v4 和独立 device/session marker 处理该歧义；v4 完成后 canonical 缺失即为真实缺失。

### 3.3 `store.json` 并发覆盖（已解决）与整文件放大（阶段 E 继续处理）

旧 Tauri command 对每次写入执行“读文件 → 修改 Map → 写整个文件”，没有共享内存锁或批量提交，多个异步设置写入可能互相覆盖。

LAN 服务还在启动时建立独立 `Arc<Mutex<AppStore>>` 快照。桌面端之后通过 Tauri command 写入磁盘时，LAN 内存不会同步；下一次 LAN 写入可能把旧快照重新写回磁盘。

当前 Tauri command、Rust 初始化和 LAN REST 已通过同一个 `OnceLock<Arc<Store<Wry>>>` 访问，迁移 batch 在后端一次 save。剩余整文件放大来自 plugin-store 与 aggregate value 的物理特性，应通过阶段 E 将增长型数据迁往 SQLite/file 解决，而不是恢复自建 JSON store。

### 3.4 repository 与 Zustand 双写（已解决）

历史上 Settings、Character、Preset、Worldbook 同时存在 repository 和 Zustand persist。四个 persist 现已删除，repository 是唯一持久化入口。

目标规则：

- repository 是持久化数据的唯一领域入口；
- Zustand 只保存当前进程的 UI 投影；
- 页面启动时显式调用 repository load；
- 不再创建 `__z:settings` 等新的 canonical persist key；
- 若某个 Zustand persist 仅用于可丢弃的 UI cache，必须命名为 `cache:`，带独立版本，并且永远不能反向覆盖 repository。

### 3.5 数据作用域分类（已落地）

前缀描述的是语义和作用域，不能单独决定后端。尤其 `session:` 不应通过共享持久 KV 实现。

建议作用域：

| 作用域     | 持久性/共享性          | 默认后端                         | 示例                                        |
| ---------- | ---------------------- | -------------------------------- | ------------------------------------------- |
| `prefs:`   | 持久、用户级、可 reset | plugin-store                     | theme、locale、context tokens               |
| `data:`    | 持久、用户级、不可丢   | repository → plugin-store/SQLite | characters、presets、worldbooks             |
| `sys:`     | 持久、宿主级           | plugin-store                     | LAN 地址、端口、active IDs                  |
| `meta:`    | 持久、存储系统内部     | plugin-store/SQLite              | schema version、migration journal、store id |
| `device:`  | 持久、当前设备/浏览器  | 封装后的 localStorage            | last chat、侧栏状态、默认 Builder 草稿      |
| `session:` | 仅当前浏览器会话       | sessionStorage/内存              | JWT、设置 tab、secret unlocked              |
| `usage:`   | 聚合可小、明细增长     | 小型聚合用 KV，明细用 SQLite     | daily total、secondary API records          |
| `secret:`  | 持久、敏感、禁止枚举   | 系统安全存储                     | API key、LAN password                       |
| `blob:`    | 持久、大对象           | app data 文件                    | avatar、生成图片、附件                      |

Builder workspace 当前按设备级可恢复草稿处理；只有未来明确要求跨设备恢复时，才进入用户数据后端和同步策略。

### 3.6 当前量级不适合把所有数据放进整文件 KV

以下数据会持续放大：

- Character avatar 可能是 data URL；
- Preset 和 Worldbook 包含大量长文本；
- ChatSavepoint 嵌入完整 Message 数组；
- Builder history 最多保存 80 个完整 workspace snapshot；
- Secondary API usage 是无上限 append-only 数组。

当前 repository 又以“读取整个数组 → 修改一个实体 → 写回整个数组”工作，外层 `store.json` 还会再次完整重写。这对少量设置足够，但不适合作为所有用户数据的长期后端。

项目级软约束：

- 单 KV value 超过 256 KiB 时记录警告并评估拆分；
- KV 总体超过 5 MiB 时记录诊断信息；
- 无上限增长、append-only、需要分页/查询或频繁更新的数据直接使用 SQLite；
- 二进制和可独立加载的图片写文件，只在数据库中保存稳定引用；
- 暂时保留 JSON 数组的 repository 也必须隐藏物理格式，避免上层依赖整数组实现。

### 3.7 损坏数据被静默当成空数组（repository 路径已解决）

旧 repository 在 `JSON.parse` 失败时返回 `[]`，下一次保存可能覆盖仍可恢复的原数据。当前 aggregate repository 统一使用 `getArray`/`loadArray`：missing 返回空数组，corrupt/error 抛错并阻止写回。

存储层应至少区分：

```text
missing     → 使用默认值
valid       → 返回解析后的值
corrupt     → 阻止写回，提示恢复/导出诊断
unsupported → 需要迁移或升级应用
```

迁移器绝不能捕获解析异常后继续写 schema version。

## 4. 目标存储层：保持薄，但表达关键语义

### 4.1 目录建议

```text
apps/desktop/src/db/
  storage/
    driver.ts       # 唯一的底层结构类型和结果类型
    runtime.ts      # 按运行环境、作用域选择 driver
    namespaces.ts   # prefs/data/sys/meta/device/session 等薄封装
    codecs.ts       # JSON 解析、校验、默认值
    keys.ts         # canonical 相对 key 与 settings 路由
    repository-helpers.ts # aggregate 安全读取
    diagnostics.ts  # 只输出 key/体积统计，不返回存储值
  migrations/
  repositories/
    *.repository.ts # 保留领域 API，决定 KV / SQLite / file
```

不需要为每种后端和每个实体建立 Java 式类层次。底层只需要一个结构类型：

```ts
export type StorageOperation = { type: "set"; key: string; value: string } | { type: "remove"; key: string };

export type StorageDriver = Readonly<{
  get(key: string): Promise<ReadResult>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  entries(prefix: string): Promise<Record<string, string>>;
  batch(operations: StorageOperation[]): Promise<void>;
}>;
```

`batch` 对 localStorage 可以同步执行；对 Tauri/plugin-store 和 REST 必须在后端锁内一次提交。迁移 runner 只依赖该类型，因此未来更换 plugin-store、SQLite KV 表或独立 server 时不需要改迁移定义。

### 4.2 namespace 工厂

`createPrefixedKV` 可以保留，但需要调整：

- namespace 绑定已经选定的 driver，而不是内部逐层回退；
- `getJson` 区分 missing 和 corrupt，不能都返回 `null`；
- codec 负责类型校验，不允许只有 `as T`；
- `clear` 通过 `batch` 执行；
- `session` 和 `device` 使用自己的 driver，不能只是给共享 KV 加前缀。

### 4.3 repository 边界

不新增全局 `userdata.list<T>(type)`。这种 API 看似通用，实际会：

- 用字符串 `type` 绕过真实类型约束；
- 固化“每种实体都是一个 JSON 数组”；
- 让 transaction、分页和按 ID 存储难以演进。

继续保留 `characterRepository`、`presetRepository`、`worldbookRepository` 等领域 API。repository 内部可以从单 JSON 数组迁到 per-entity KV 或 SQLite，而调用方无需变化。

### 4.4 `store.json` 的可读性边界

canonical store 保持扁平、可按前缀查询的层级 key，例如 `prefs:web-search:provider`、`data:characters`、`secret:lan:password`。不把整个应用合成一个 `neo.settings...` 深层对象，因为深层字段更新会退化为整棵树 read-modify-write，并破坏 key 级缺失、冲突和迁移语义。

JSON object 属性顺序不属于协议，也不要求 `store.json` 按字母或长度排序。嵌套 JSON 只用于一个具有共同生命周期的 value（例如单个角色实体）。若需要人工诊断，后续提供排序、展开 value 且默认脱敏的只读导出，而不改变 canonical 物理格式。

## 5. 数据落点建议

| 数据                          | 近期方案                             | 中长期方案                                   |
| ----------------------------- | ------------------------------------ | -------------------------------------------- |
| prefs、active IDs、迁移元数据 | plugin-store KV                      | 保持 KV                                      |
| model config、regex、persona  | plugin-store KV                      | 数据量增长后可按实体拆 key                   |
| character metadata            | 暂时保留 repository JSON             | SQLite JSON row / typed columns              |
| avatar、生成图片              | 从 data URL 迁到 app data 文件       | blob repository + 稳定引用                   |
| preset、worldbook             | 短期可保留 JSON aggregate            | 每个 aggregate 一行/一 key，避免全库数组重写 |
| chats                         | SQLite                               | SQLite                                       |
| messages                      | 继续 SQLite                          | 增量分页、索引和内容安全迁移                 |
| chat savepoints               | 从 KV 数组迁出                       | SQLite，消息快照按 savepoint 关联            |
| Builder 当前草稿              | `device:` localStorage adapter       | 若需跨设备，迁到 SQLite 并定义冲突策略       |
| Builder 历史记录              | 不迁入共享整文件 KV                  | SQLite，限制条数和总体积                     |
| usage detail                  | 从 append-only KV 数组迁出           | SQLite；日汇总可留 KV                        |
| secret                        | 暂时保持兼容但禁止 REST entries 暴露 | OS keychain / Stronghold 类方案              |

plugin-store 解决的是可靠的小型 KV 和 Rust/JS 共享实例，不替代 SQLite 的分页、查询、事务和高频写入能力。

## 6. 生产迁移系统

### 6.1 目录与职责

```text
apps/desktop/src/db/migrations/
  types.ts
  registry.ts
  runner.ts
  001-bootstrap.ts
  002-extract-settings-persist.ts
  003-repair-settings-persist.ts
  004-route-storage-scopes.ts
  browser-scopes.ts
  __tests__/

apps/desktop/src-tauri/src/
  db_migrations.rs   # SQLite schema/data migrations
```

职责划分：

- TypeScript migration：读取 WebView localStorage、转换旧 JSON 形状、规划 key 操作、调用权威 driver 的原子 `batch`；
- Rust KV 后端：提供锁、备份、compare-and-set schema version、原子 batch，并让 Tauri 与 LAN REST 使用同一实例；
- Rust SQLite migration：在 transaction 中运行，使用 `PRAGMA user_version` 标记数据库版本；
- repository 和 Zustand 不参与 migration，避免迁移期间触发业务默认值或双写。

### 6.2 标记设计

权威存储中的保留键：

```text
meta:store-id
meta:schema-version
meta:migration-lock
meta:migration:001-bootstrap
meta:migration:002-extract-settings-persist
meta:migration:003-repair-settings-persist
meta:migration:004-route-storage-scopes
```

迁移记录示例：

```json
{
  "state": "completed",
  "from": 1,
  "to": 2,
  "appVersion": "0.1.3",
  "startedAt": "2026-06-19T10:00:00.000Z",
  "completedAt": "2026-06-19T10:00:01.000Z",
  "backup": "backups/store.pre-v2.20260619.json",
  "checksum": "..."
}
```

本地浏览器来源还需要独立标记：

```text
__neo:legacy-source-id
__neo:imported-to:{storeId}
```

这是因为每个浏览器 origin 的 localStorage 都是不同来源。共享后端的一个全局“已导入”标记，不能证明其他浏览器的设备数据也处理过。

应用版本只用于审计和诊断，不能用于判断存储格式；同一应用版本可能面对新安装、跨多个版本升级或部分迁移的数据。

### 6.3 旧版本识别

当 `meta:schema-version` 不存在时，按数据签名识别：

| 签名                                      | 判断                                      |
| ----------------------------------------- | ----------------------------------------- |
| 没有任何已知业务 key                      | 新安装，初始化为当前 schema               |
| `neotavern_*`                             | legacy repository/KV 数据                 |
| `neotavern-*` 且值为 `{ state, version }` | legacy Zustand persist envelope           |
| `neotavern_app_store_migrated_v1`         | 曾执行 localStorage 复制，仅作为线索      |
| `neo:character-builder:*:v1`              | Builder v1 设备草稿                       |
| SQLite 表存在但无 `PRAGMA user_version`   | legacy SQLite，结合表和列检查确定起始版本 |
| 已知 key 数据形状不合法                   | corrupt，不自动标记完成                   |

不能仅用 key 是否存在判断全部版本，也不能仅用 SQLite `COUNT(*) > 0` 判断导入已经完成。

### 6.4 单个迁移定义

```ts
export type StorageMigration = Readonly<{
  id: string;
  from: number;
  to: number;
  plan(context: MigrationContext): Promise<StorageOperation[]>;
  verify(context: MigrationContext): Promise<void>;
}>;
```

`plan` 必须是幂等的；`verify` 至少检查 JSON shape、实体数量、稳定 ID 集合和引用关系。runner 按 `from → to` 连续执行，禁止跳版本。

### 6.5 冲突规则

首次导入按 key 或实体执行明确策略：

| 权威值 | legacy 值 | 行为                                                       |
| ------ | --------- | ---------------------------------------------------------- |
| 不存在 | 有效      | 复制 legacy                                                |
| 有效   | 不存在    | 保留权威值                                                 |
| 有效   | 相同      | 保留并记录已处理                                           |
| 有效   | 不同      | 使用该数据类型的合并规则；无法安全合并则保留两份并报告冲突 |
| 损坏   | 有效      | 停止自动覆盖，保留备份并要求恢复决策                       |
| 不存在 | 损坏      | 标记 migration failed，不提升 schema version               |

具体 legacy 规则：

- underscore repository key 优先于同名 hyphen Zustand cache；
- repository key 缺失时，可以从 Zustand envelope 中提取 characters/presets/worldbooks；
- settings 以独立 `neotavern_setting_*` 和 persona 为准，persist envelope 只补缺失项；
- Builder workspace 默认只迁移到 `device:`，不自动合并到 LAN 共享用户数据；
- active ID 必须在实体迁移完成后验证引用是否仍存在。

### 6.6 原子性、备份和清理

每个迁移遵循：

```text
获取 migration lock / 校验 expected schema version
→ 创建 store.json / SQLite 备份
→ 生成幂等操作
→ 在一个后端 batch/transaction 中写入新数据
→ 重新读取并 verify
→ 最后写 migration completed 和 schema version
→ 释放锁
```

关键约束：

- schema version 永远最后写；
- migration lock 记录 PID/获取时间；进程异常退出留下的锁在 5 分钟后可回收；
- 第一次迁移只复制，不立即删除 legacy key；
- legacy 清理放到至少下一个稳定版本，确保可以回滚旧应用；
- 中断后因 schema version 未提升，下一次启动可安全重试；
- 备份路径写入 migration journal，仅保留最近 5 份；备份失败时不执行迁移；
- 降级应用发现更高 schema version 时必须拒绝写入，不能按默认空值启动。

当前 KV 迁移量级远低于 5 分钟；阶段 E 若引入长时间 SQLite/blob 搬运，必须增加 lock heartbeat，而不是继续依赖固定过期时间。

### 6.7 删除语义与真正的离线副本

完成 legacy import 后，权威层缺少 key 就表示“没有该值”，不能再去 legacy 层查找。这样即使旧 localStorage 尚未物理删除，用户删除的数据也不会复活。

如果未来要求网络不可用时继续在浏览器修改共享用户数据，这已经是离线同步功能，而不是 fallback。至少需要：

```ts
type ReplicatedValue<T> = {
  value: T | null;
  revision: number;
  updatedAt: string;
  deletedAt?: string; // tombstone，防止其他副本复活删除数据
};
```

在没有 revision、tombstone 和冲突解决策略前，不把 localStorage 视为共享数据的可写副本。

## 7. 启动接入

目标启动顺序：

```text
初始化 runtime，只做环境探测和 driver 选择
→ 收集当前客户端可识别的 legacy localStorage
→ 权威后端获取迁移锁、备份、导入和升级
→ Rust SQLite transaction migrations
→ 确认 schema version 为当前版本
→ 启动/开放 LAN REST 写入
→ hydrate locale、theme 和各 repository-backed store
→ seed
→ render 业务 UI
```

当前共享 migration 已在 `main.tsx` 动态导入 App、locale/theme hydrate、seed 和首次 render 之前完成。Tauri 原生窗口运行共享 registry；远程 LAN 浏览器不升级宿主共享 schema，只运行自身的 device/session migration。

LAN server 可以先建立监听，但 `/api/store` 在 `meta:schema-version` 未达到当前 v4 时统一返回 503，因此迁移完成前不会暴露半迁移数据或接受共享写入。

当前接入状态：

- canonical Zustand persist 已删除；
- Tauri 原生窗口在加载 `App` 前完成共享存储迁移；
- LAN 服务在共享 schema 未达到当前版本时对 store API 返回 503；
- LAN 浏览器只运行自身 `device:` / `session:` 迁移，共享数据迁移由宿主完成；
- 纯浏览器开发模式以 localStorage 为共享权威 driver，运行同一个 migration registry。

## 8. 推荐迁移顺序

### 阶段 A：修正事实和底层语义，不改 key ✅ 已完成（2026-06-20）

- ✅ 补齐四个 Zustand persist 和所有直接存储清单
- ✅ driver 返回区分 missing 与 unavailable（`ReadResult`）
- ✅ 按作用域一次选择权威 driver（`runtime.ts`）
- ✅ 为 corrupt 数据增加显式错误（`codecs.ts` / `decodeArray`）
- ✅ 4 个 canonical Zustand persist 已移除：settings/characters/presets/worldbooks 统一从 repository 加载
- ✅ builder workspace 写路径接入 `device` namespace
- ✅ `neo:last-chat-id` 接入 `device` namespace
- ✅ storage codec、namespace、runtime 和迁移 fixture 已覆盖 missing/corrupt/error、批量回滚和作用域隔离
- ✅ 脱敏 diagnostics 可统计总 key、各 scope 体积和最大项，不返回 API key 等存储值

### 阶段 B：统一小型 KV 后端 ✅ 已完成（2026-06-20）

- ✅ Rust 侧完整接入 `tauri-plugin-store`（新增 `store.rs` 包装模块）
- ✅ Tauri 命令和 LAN REST 共用同一个 `Store<Wry>` 实例（`OnceLock` 缓存）
- ✅ 实现 `get/set/remove/entries` 兼容旧 API
- ✅ Rust batch 已同时暴露为 Tauri command 和 REST endpoint，一组迁移操作只 save 一次
- ✅ 删除了旧的自建 BTreeMap `store.json` 整文件读写
- ✅ LAN `entries` 默认过滤 `secret:*`、旧 API key/password 和 migration lock

### 阶段 C：先上线迁移框架，再改 schema ✅ 共享 KV 已完成（2026-06-20）

- ✅ `db/migrations/` 目录就位（types / runner / registry / index）
- ✅ `runMigrations()` 在 `main.tsx` 中先于 locale/theme/seed 执行
- ✅ runner: 读版本 → 排序 → plan → batch → verify → 记录 → 写版本（版本最后写）
- ✅ 迁移失败不提升版本，下次启动自动重试
- ✅ registry 已发布 001–004；设置 envelope 提取、v2 修复和 namespace 路由均已在生产数据形态上验证
- ✅ 已发布迁移保持 append-only，防止旧 schema 用户失去连续升级路径
- ✅ Tauri 迁移先获取带时间戳且可恢复的锁；备份失败则拒绝迁移，记录备份路径并只保留最近 5 份
- ✅ 失败路径释放锁，损坏 JSON 不提升 schema，旧应用面对更高 schema 拒绝写入
- ✅ SQLite schema 已统一到 `db_migrations.rs` transaction runner：v1 为 messages/agentic 基线，v2 增加 `messages.round_index`、`rag_chunks` 及索引；版本只在 transaction 成功时提升
- ✅ legacy message 导入按 ID 幂等补齐并验证，不再用 `COUNT(*) > 0` 代表迁移完成，也不会在导入后立即删除 KV 源

### 阶段 D：消除双写并按作用域路由 ✅ 已完成（2026-06-20）

- ✅ settings/characters/presets/worldbooks 的 canonical Zustand persist 已移除
- ✅ repository 分别绑定 `prefs:`、`data:`、`sys:`、`usage:`、`secret:` 权威 namespace
- ✅ v4 幂等复制所有已知 legacy shared key 和动态日费用键；canonical 已有值永不被覆盖
- ✅ Tauri 使用 plugin-store driver、远程浏览器使用 REST driver、本地浏览器开发使用 localStorage driver；均不逐 key fallback
- ✅ schema v4 后 LAN REST 拒绝写入 `neotavern_*` / `neotavern-*` / `neo:*` legacy key，避免缓存旧客户端产生幽灵写入
- ✅ `device:` / `session:` 使用各自 browser adapter 和独立 migration marker
- ✅ locale、theme、LAN、聊天草稿、Builder、settings tab、auth token 均已移除业务层直接浏览器存储访问
- ✅ 未创建 `__z:` key；legacy 数据留到阶段 F 再删除

### 阶段 E：迁出增长型数据

- ✅ RAG chunk 和 embedding 已直接进入 SQLite；消息修改、删除及 RAG chunk 失效在同一 transaction 中完成；
- Savepoint、Builder history、usage detail 进入 SQLite；
- avatar 和生成图片进入文件系统；
- 根据实际查询需求逐步把 character/preset/worldbook 从全数组改为 aggregate/per-entity 存储。

### 阶段 F：延迟清理 legacy

- 至少经过一个稳定发布周期后再删除旧 key；
- 清理迁移本身也有版本、备份和验证；
- 保留导出诊断和恢复入口。

## 9. 测试与验收标准

迁移测试至少覆盖：

- 全新安装；
- 只有 repository legacy key；
- 只有 Zustand persist；
- 两者同时存在且相同；
- 两者冲突；
- 部分 key 已迁移后进程中断；
- JSON 损坏；
- SQLite 已有部分数据；
- migration 重复运行；
- 删除后低层旧值不会复活；
- Tauri 与 LAN 并发写入不会互相覆盖；
- 旧应用打开更高 schema 时拒绝写入；
- 备份恢复后可以重新迁移。

完成标准：

- 任一逻辑数据只有一个 canonical 写入路径；
- 业务代码不直接访问 localStorage/sessionStorage；
- key 缺失不会触发跨后端查找；
- 所有生产迁移可重入、可诊断、有备份，并在校验成功后才提升版本；
- 小型 KV、增长型关系数据和 blob 各自进入适合的物理存储；
- 中英文正式存储文档与最终实现保持同步。
