import type { StatusMeterTone } from "@neo-tavern/ui";
import type { Character, CharacterStatusBarConfig } from "@neo-tavern/shared";

type JsonRecord = Record<string, unknown>;

export type AgenticStatusAssetId = "health" | "mana" | "stamina" | "affection" | "experience" | "sanity" | "danger";

export interface AgenticStatusAssetDefinition {
  id: AgenticStatusAssetId;
  label: string;
  tone: StatusMeterTone;
  icon: "heart" | "sparkles" | "zap" | "smile" | "star" | "brain" | "alert";
  aliases: string[];
  valueKeys: string[];
  maxKeys: string[];
  description: string;
  mvuPath: string;
  updateHint: string;
}

export interface ResolvedAgenticStatusMeter {
  id: AgenticStatusAssetId;
  label: string;
  value: number;
  max: number;
  min: number;
  tone: StatusMeterTone;
  icon: AgenticStatusAssetDefinition["icon"];
  description?: string;
  valueLabel?: string;
}

export type AgenticStatusBarState = Record<
  string,
  {
    id?: string;
    assetId?: string;
    value: number | null;
    max: number;
    min?: number;
    label: string;
    description?: string;
    valueLabel?: string;
    mvuPath?: string;
  }
>;

export const AGENTIC_STATUS_ASSETS: AgenticStatusAssetDefinition[] = [
  {
    id: "health",
    label: "生命",
    tone: "health",
    icon: "heart",
    aliases: ["health", "hp", "生命", "生命值", "血量", "体力值"],
    valueKeys: ["hp", "health", "生命", "生命值", "血量"],
    maxKeys: ["max_hp", "maxHealth", "health_max", "最大生命", "生命上限", "血量上限"],
    description: "RPG 战斗、生存、受伤、恢复时使用。",
    mvuPath: "主角.状态条.生命",
    updateHint: "受伤、治疗、疲劳、濒死或休息后更新。",
  },
  {
    id: "mana",
    label: "魔法",
    tone: "mana",
    icon: "sparkles",
    aliases: ["mana", "mp", "magic", "spell_slots", "spellSlots", "魔力", "魔法", "灵力", "法力", "法术位", "咒力"],
    valueKeys: ["mp", "mana", "magic", "spell_slots", "spellSlots", "魔力", "魔法", "灵力", "法力", "法术位", "咒力"],
    maxKeys: [
      "max_mp",
      "maxMana",
      "mana_max",
      "max_spell_slots",
      "spellSlotsMax",
      "最大魔力",
      "魔力上限",
      "法力上限",
      "法术位上限",
    ],
    description: "施法、异能、灵力消耗、法术位和恢复时使用。",
    mvuPath: "主角.状态条.魔法",
    updateHint: "释放技能、吸收能量、透支或冥想恢复后更新。",
  },
  {
    id: "stamina",
    label: "耐力",
    tone: "stamina",
    icon: "zap",
    aliases: ["stamina", "energy", "耐力", "精力", "行动力"],
    valueKeys: ["stamina", "energy", "耐力", "精力", "行动力"],
    maxKeys: ["max_stamina", "maxEnergy", "耐力上限", "精力上限", "行动力上限"],
    description: "奔跑、潜行、格斗、持续行动时使用。",
    mvuPath: "主角.状态条.耐力",
    updateHint: "长时间行动、爆发动作、休息和补给后更新。",
  },
  {
    id: "affection",
    label: "好感度",
    tone: "affection",
    icon: "smile",
    aliases: ["affection", "favor", "favorability", "relationship", "好感", "好感度", "亲密度", "羁绊"],
    valueKeys: ["affection", "favor", "favorability", "relationship", "好感", "好感度", "亲密度", "羁绊"],
    maxKeys: ["max_affection", "affection_max", "好感上限", "好感度上限", "亲密度上限"],
    description: "恋爱、搭档、NPC 信任和情感推进时使用。",
    mvuPath: "角色.${角色名}.好感度",
    updateHint: "根据对方对玩家行为的感知调整，普通互动 ±1~3，关键事件 ±5~12。",
  },
  {
    id: "experience",
    label: "经验",
    tone: "experience",
    icon: "star",
    aliases: ["experience", "exp", "xp", "经验", "经验值", "等级进度"],
    valueKeys: ["exp", "xp", "experience", "经验", "经验值", "等级进度"],
    maxKeys: ["max_exp", "next_level_exp", "exp_max", "升级所需经验", "经验上限"],
    description: "升级、成长、熟练度和任务奖励时使用。",
    mvuPath: "主角.成长.经验",
    updateHint: "完成任务、训练、战斗胜利、学习知识后更新。",
  },
  {
    id: "sanity",
    label: "理智",
    tone: "sanity",
    icon: "brain",
    aliases: ["sanity", "mind", "理智", "精神", "稳定度", "污染抗性"],
    valueKeys: ["sanity", "mind", "理智", "精神", "稳定度", "污染抗性"],
    maxKeys: ["max_sanity", "sanity_max", "理智上限", "精神上限", "稳定度上限"],
    description: "恐怖、精神污染、梦境、幻觉或压力场景时使用。",
    mvuPath: "主角.状态条.理智",
    updateHint: "遭遇异常、恐惧、精神冲击、安抚或休息后更新。",
  },
  {
    id: "danger",
    label: "危险",
    tone: "danger",
    icon: "alert",
    aliases: ["danger", "threat", "危机", "危险", "危险度", "警戒度"],
    valueKeys: ["danger", "threat", "危机", "危险", "危险度", "警戒度"],
    maxKeys: ["max_danger", "danger_max", "危险上限", "警戒上限"],
    description: "潜入、追逐、警戒、危机倒计时时使用。",
    mvuPath: "场景.危险度",
    updateHint: "暴露、制造声响、拖延、战斗升级或成功掩护后更新。",
  },
];

export const AGENTIC_STATUS_ASSET_PROMPT = [
  "本地状态 UI 素材库：",
  "- 可用 status_bars id：health(生命/血条)、mana(魔法/灵力/法术位)、stamina(耐力)、affection(好感度)、experience(经验)、sanity(理智)、danger(危险)。",
  "- 若剧情进入 RPG、战斗、恋爱、成长、恐怖或危机场景，可以通过 update_game_state 写入 player.status_bars.<id>。",
  "- 统一写法：player.status_bars.<id> = { value: number, max: number, label?: string, description?: string, valueLabel?: string }。",
  "- 兼容旧写法：player.hp/max_hp、player.mp/max_mp、player.affection、player.exp/max_exp 也会被 UI 识别。",
  "- 不要输出 HTML/CSS 状态栏；只更新结构化变量，Whale Play 会从本地素材库渲染 UI。",
  "- 无关剧情不要强行初始化所有条，只有真正被玩法用到的状态才写入。",
].join("\n");

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace("%", "").trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeKey(value: string) {
  return value.replace(/[\s_-]/g, "").toLowerCase();
}

function readKey(record: JsonRecord | undefined, keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  const normalized = new Map(Object.keys(record).map((key) => [normalizeKey(key), key]));
  for (const key of keys) {
    const match = normalized.get(normalizeKey(key));
    if (match) return record[match];
  }
  return undefined;
}

function hasAssetIdentity(record: JsonRecord, asset: AgenticStatusAssetDefinition, fallbackId?: string) {
  const ids = [
    fallbackId,
    typeof record.id === "string" ? record.id : undefined,
    typeof record.assetId === "string" ? record.assetId : undefined,
    typeof record.asset_id === "string" ? record.asset_id : undefined,
    typeof record.asset === "string" ? record.asset : undefined,
  ]
    .filter((value): value is string => !!value)
    .map(normalizeKey);
  const accepted = [asset.id, ...asset.aliases].map(normalizeKey);
  return ids.some((id) => accepted.includes(id));
}

function findStatusBarRecord(source: JsonRecord, asset: AgenticStatusAssetDefinition) {
  for (const [key, value] of Object.entries(source)) {
    if (!isRecord(value)) continue;
    if (hasAssetIdentity(value, asset, key)) return value;
  }
  return undefined;
}

function nestedRecord(record: JsonRecord | undefined, keys: string[]) {
  const value = readKey(record, keys);
  return isRecord(value) ? value : undefined;
}

function collectStatusSources(gameState: JsonRecord) {
  const player = isRecord(gameState.player) ? gameState.player : undefined;
  const scene = isRecord(gameState.scene) ? gameState.scene : undefined;
  const sources: JsonRecord[] = [];
  const playerContainers = [
    nestedRecord(player, ["status_bars", "statusBars", "状态条"]),
    nestedRecord(player, ["dynamic_status", "dynamicStatus", "动态状态"]),
    nestedRecord(player, ["resources", "资源"]),
    nestedRecord(player, ["status", "状态"]),
    nestedRecord(player, ["stats", "属性"]),
  ];
  const sceneContainers = [
    nestedRecord(scene, ["status_bars", "statusBars", "状态条"]),
    nestedRecord(scene, ["status", "状态"]),
  ];
  for (const item of [...playerContainers, ...sceneContainers, player, scene]) {
    if (item) sources.push(item);
  }
  return sources;
}

function resolveFromObject(
  asset: AgenticStatusAssetDefinition,
  raw: unknown,
  fallbackMax: unknown,
): Pick<ResolvedAgenticStatusMeter, "value" | "max" | "label" | "description" | "valueLabel"> | null {
  if (isRecord(raw)) {
    const value = toNumber(readKey(raw, ["value", "current", "now", "当前", "数值", ...asset.valueKeys]));
    if (value === undefined) return null;
    const max = toNumber(readKey(raw, ["max", "maximum", "上限", ...asset.maxKeys])) ?? 100;
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : asset.label;
    const description =
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : typeof raw.note === "string" && raw.note.trim()
          ? raw.note.trim()
          : undefined;
    const valueLabel =
      typeof raw.valueLabel === "string" && raw.valueLabel.trim()
        ? raw.valueLabel.trim()
        : typeof raw.text === "string" && raw.text.trim()
          ? raw.text.trim()
          : undefined;
    return { value, max, label, description, valueLabel };
  }

  const value = toNumber(raw);
  if (value === undefined) return null;
  return { value, max: toNumber(fallbackMax) ?? 100, label: asset.label };
}

function resolveAsset(gameState: JsonRecord, asset: AgenticStatusAssetDefinition): ResolvedAgenticStatusMeter | null {
  const sources = collectStatusSources(gameState);
  for (const source of sources) {
    const raw = readKey(source, [asset.id, ...asset.aliases]) ?? findStatusBarRecord(source, asset);
    if (raw === undefined) continue;
    const resolved = resolveFromObject(asset, raw, readKey(source, asset.maxKeys));
    if (!resolved) continue;
    return {
      ...resolved,
      id: asset.id,
      min: 0,
      tone: asset.tone,
      icon: asset.icon,
      description: resolved.description ?? asset.description,
    };
  }

  if (asset.id === "affection") {
    const npcs = Array.isArray(gameState.npcs) ? gameState.npcs : [];
    for (const npc of npcs) {
      if (!isRecord(npc)) continue;
      const raw = readKey(npc, asset.valueKeys);
      if (raw === undefined) continue;
      const resolved = resolveFromObject(asset, raw, readKey(npc, asset.maxKeys));
      if (!resolved) continue;
      const npcName = typeof npc.name === "string" && npc.name.trim() ? npc.name.trim() : undefined;
      return {
        ...resolved,
        id: asset.id,
        min: 0,
        tone: asset.tone,
        icon: asset.icon,
        description: resolved.description ?? (npcName ? `${npcName} 对玩家的情感/信任变化。` : asset.description),
        label: npcName ? `${npcName}好感` : resolved.label,
      };
    }
  }

  return null;
}

export function resolveAgenticStatusMeters(gameState: unknown): ResolvedAgenticStatusMeter[] {
  if (!isRecord(gameState)) return [];
  return AGENTIC_STATUS_ASSETS.map((asset) => resolveAsset(gameState, asset)).filter(
    (meter): meter is ResolvedAgenticStatusMeter => !!meter,
  );
}

export function createAgenticStatusBarsFromConfig(config: CharacterStatusBarConfig | undefined): AgenticStatusBarState {
  const bars: AgenticStatusBarState = {};
  for (const bar of config?.bars ?? []) {
    if (bar.visible === false) continue;
    const id = bar.id || bar.assetId;
    if (!id) continue;
    bars[id] = {
      id: bar.id,
      assetId: bar.assetId,
      value: bar.value,
      max: bar.max,
      min: bar.min,
      label: bar.label,
      description: bar.description,
      valueLabel: bar.valueLabel,
      mvuPath: bar.mvuPath,
    };
  }
  return bars;
}

export function createAgenticStatusBarsFromCharacter(character: Character): AgenticStatusBarState {
  return createAgenticStatusBarsFromConfig(character.statusBars);
}
