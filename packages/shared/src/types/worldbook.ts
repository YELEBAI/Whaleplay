export type WorldbookEntryType = "always" | "trigger";
export type TriggerMode = "and" | "or";
export type WorldbookInsertPosition = "beforeHistory" | "afterHistory" | "atDepth";

export interface WorldbookEntry {
  id: string;
  worldbookId: string;
  title: string;
  keys: string;
  secondaryKeys?: string;
  content: string;
  priority: number;
  /** 常驻 (always) = 始终注入；触发 (trigger) = 关键词命中才注入 */
  type: WorldbookEntryType;
  /** 蓝灯(and) = 全部关键词命中才触发；绿灯(or) = 任意关键词命中即触发 */
  triggerMode: TriggerMode;
  /** Secondary keys mirror SillyTavern selective matching. Empty means no extra condition. */
  selectiveLogic?: TriggerMode;
  /** How many recent messages to scan for triggers. 0 means scan all available prompt history. */
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  useProbability?: boolean;
  probability?: number;
  position?: WorldbookInsertPosition;
  depth?: number;
  role?: "system" | "user" | "assistant";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Worldbook {
  id: string;
  name: string;
  hidden?: boolean;
  description: string;
  entries: WorldbookEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorldbookInput {
  id?: string;
  name: string;
  hidden?: boolean;
  description: string;
}

export interface UpdateWorldbookInput {
  name?: string;
  hidden?: boolean;
  description?: string;
}

export interface CreateWorldbookEntryInput {
  title: string;
  keys: string;
  secondaryKeys?: string;
  content: string;
  priority: number;
  type: WorldbookEntryType;
  triggerMode: TriggerMode;
  /** 条目在文件系统中的相对路径, e.g. "世界书/角色/苏云/基础信息.txt" */
  entryPath?: string;
  /** 条目分类名称, e.g. "角色", "世界观", "NPC" */
  entryTypeName?: string;
  selectiveLogic?: TriggerMode;
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  useProbability?: boolean;
  probability?: number;
  position?: WorldbookInsertPosition;
  depth?: number;
  role?: "system" | "user" | "assistant";
  enabled: boolean;
}

export interface UpdateWorldbookEntryInput {
  title?: string;
  keys?: string;
  secondaryKeys?: string;
  content?: string;
  priority?: number;
  type?: WorldbookEntryType;
  triggerMode?: TriggerMode;
  entryPath?: string;
  entryTypeName?: string;
  selectiveLogic?: TriggerMode;
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  useProbability?: boolean;
  probability?: number;
  position?: WorldbookInsertPosition;
  depth?: number;
  role?: "system" | "user" | "assistant";
  enabled?: boolean;
}
