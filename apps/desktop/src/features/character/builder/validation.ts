import type {
  CreateCharacterInput,
  CharacterStatusBar,
  CharacterStatusBarConfig,
  CreateWorldbookEntryInput,
  WorldbookInsertPosition,
} from "@neo-tavern/shared";
import type {
  DraftPayload,
  NeoCreationPlan,
  NeoCreationPlanEntry,
  NeoPersonalityPalette,
  NeoBuilderEvaluationReport,
  NeoMvuConfig,
  ValidationResult,
} from "./types";
import { trimString, optionalString, normalizeStringList, splitEntryKeys, isSingleHanKey } from "./utils";
import { buildCreationPlanYaml } from "./prompt";

const PLACEHOLDER_PATTERN = /(某城市|某学校|某组织|某地点|某角色|某人|待定|占位|TODO|TBD|未命名)/i;
const USER_ACTION_PATTERN = /你(已经|正在|正要|走进|坐下|伸手|回答|点头|摇头|感到|意识到|决定|忍不住)/;
const STATUS_BAR_ASSET_IDS = new Set(["health", "mana", "stamina", "affection", "experience", "sanity", "danger"]);

function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER_PATTERN.test(text);
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace("%", "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// ── Tags ──

export function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((tag) => trimString(tag))
    .filter(Boolean)
    .slice(0, 8);
  return tags.length > 0 ? tags : undefined;
}

// ── Position ──

function normalizePosition(value: unknown, fallback: WorldbookInsertPosition): WorldbookInsertPosition {
  return value === "beforeHistory" || value === "afterHistory" || value === "atDepth" ? value : fallback;
}

// ── Worldbook Entries ──

export function normalizeWorldbookEntries(value: unknown): CreateWorldbookEntryInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index): CreateWorldbookEntryInput | null => {
      if (!entry || typeof entry !== "object") return null;
      const data = entry as Record<string, unknown>;
      const type = data.type === "always" ? "always" : "trigger";
      const fallbackPosition: WorldbookInsertPosition = type === "always" ? "beforeHistory" : "afterHistory";
      const priority = Number(data.priority);

      // keys can be a comma-separated string or a string array — normalize to comma string
      const keysRaw = Array.isArray(data.keys)
        ? data.keys
            .map((k) => trimString(k))
            .filter(Boolean)
            .join(", ")
        : trimString(data.keys);
      const secondaryRaw = Array.isArray(data.secondaryKeys)
        ? data.secondaryKeys
            .map((k) => trimString(k))
            .filter(Boolean)
            .join(", ")
        : optionalString(data.secondaryKeys);

      return {
        title: trimString(data.title) || `Entry ${index + 1}`,
        keys: keysRaw,
        secondaryKeys: secondaryRaw,
        content: trimString(data.content),
        priority: Number.isFinite(priority) ? priority : Math.max(10, 100 - index * 5),
        type,
        entryPath: optionalString(data.entryPath || data.entry_path),
        entryTypeName: optionalString(data.entryTypeName || data.entry_type_name || data.typeName),
        triggerMode: data.triggerMode === "and" ? "and" : "or",
        selectiveLogic: data.selectiveLogic === "and" ? "and" : data.selectiveLogic === "or" ? "or" : undefined,
        scanDepth:
          typeof data.scanDepth === "number" && Number.isFinite(data.scanDepth)
            ? Math.max(0, data.scanDepth)
            : undefined,
        caseSensitive: typeof data.caseSensitive === "boolean" ? data.caseSensitive : undefined,
        matchWholeWords: typeof data.matchWholeWords === "boolean" ? data.matchWholeWords : undefined,
        useProbability: typeof data.useProbability === "boolean" ? data.useProbability : undefined,
        probability:
          typeof data.probability === "number" && Number.isFinite(data.probability) ? data.probability : undefined,
        position: normalizePosition(data.position, fallbackPosition),
        depth: typeof data.depth === "number" && Number.isFinite(data.depth) ? Math.max(0, data.depth) : undefined,
        role: data.role === "user" || data.role === "assistant" || data.role === "system" ? data.role : "system",
        enabled: data.enabled === false ? false : true,
      };
    })
    .filter((entry): entry is CreateWorldbookEntryInput => !!entry && !!entry.content)
    .slice(0, 50);
}

// ── Personality Palette ──

function normalizePaletteDerivatives(value: unknown): NeoPersonalityPalette["derivatives"] {
  if (Array.isArray(value)) {
    return value
      .map((item): NeoPersonalityPalette["derivatives"][number] | null => {
        if (!item || typeof item !== "object") return null;
        const data = item as Record<string, unknown>;
        const color = trimString(data.color || data.name || data.trait);
        const items = normalizeStringList(data.items || data.derivatives || data.examples || data.behaviors);
        if (!color || items.length === 0) return null;
        return { color, items };
      })
      .filter((item): item is NeoPersonalityPalette["derivatives"][number] => !!item);
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([color, items]) => ({ color: color.trim(), items: normalizeStringList(items) }))
      .filter((item) => item.color && item.items.length > 0);
  }

  return [];
}

export function compilePersonalityPalette(palette: NeoPersonalityPalette): string {
  const lines: string[] = [];
  lines.push(
    "性格调色盘：人的性格像调色盘，底色始终存在，主色调决定日常第一印象，点缀只在特定条件下显现；衍生是具体场景中的行为。",
  );
  if (palette.base) lines.push(`底色：${palette.base}`);
  if (palette.main.length) lines.push(`主色调：${palette.main.join("、")}`);
  if (palette.accents.length) lines.push(`性格点缀：${palette.accents.join("、")}`);
  for (const derivative of palette.derivatives) {
    derivative.items.forEach((item, index) => {
      lines.push(`${derivative.color}衍生${index + 1}：${item}`);
    });
  }
  for (const item of palette.futureDerivatives ?? []) {
    lines.push(`未来衍生：${item}`);
  }
  if (palette.notes) lines.push(`调色盘备注：${palette.notes}`);
  return lines.join("\n");
}

export function normalizePersonalityPalette(value: unknown): NeoPersonalityPalette | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const palette: NeoPersonalityPalette = {
    base: trimString(data.base || data.foundation || data.baseColor),
    main: normalizeStringList(data.main || data.mainColors || data.dominant),
    accents: normalizeStringList(data.accents || data.accent || data.decorations),
    derivatives: normalizePaletteDerivatives(data.derivatives || data.derived || data.behaviors),
    futureDerivatives: normalizeStringList(data.futureDerivatives || data.future),
    notes: optionalString(data.notes),
    compiledText: optionalString(data.compiledText),
  };
  if (!palette.base && palette.main.length === 0 && palette.accents.length === 0 && palette.derivatives.length === 0) {
    return undefined;
  }
  palette.compiledText = palette.compiledText || compilePersonalityPalette(palette);
  return palette;
}

// ── Creation Plan ──

export function normalizePlanEntries(value: unknown): NeoCreationPlanEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): NeoCreationPlanEntry | null => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const name = trimString(data.name || data.title) || `条目${index + 1}`;
      const type = trimString(data.type) || "世界书";
      return {
        id: trimString(data.id) || `entry_${index + 1}`,
        name,
        type,
        path: optionalString(data.path),
        part: optionalString(data.part),
        scope: optionalString(data.scope),
        purpose: optionalString(data.purpose),
        keys: normalizeStringList(data.keys || data.keywords),
        sourceChapters: normalizeStringList(data.sourceChapters || data.source_chapters),
        status:
          data.status === "done" || data.status === "in_progress" || data.status === "skipped"
            ? data.status
            : "planned",
        outputRef: optionalString(data.outputRef || data.output_ref),
        skipReason: optionalString(data.skipReason || data.skip_reason),
      };
    })
    .filter((entry): entry is NeoCreationPlanEntry => !!entry)
    .slice(0, 32);
}

export function normalizeCreationPlan(value: unknown, existing?: NeoCreationPlan | null): NeoCreationPlan | undefined {
  if (!value || typeof value !== "object") return existing ?? undefined;
  const data = value as Record<string, unknown>;
  const project = data.project && typeof data.project === "object" ? (data.project as Record<string, unknown>) : {};
  const world = data.world && typeof data.world === "object" ? (data.world as Record<string, unknown>) : {};
  const characters: NeoCreationPlan["characters"] = Array.isArray(data.characters)
    ? data.characters
        .map((char): NeoCreationPlan["characters"][number] | null => {
          if (!char || typeof char !== "object") return null;
          const c = char as Record<string, unknown>;
          return {
            name: trimString(c.name),
            identity: optionalString(c.identity),
            relationship: optionalString(c.relationship),
            palette:
              c.palette && typeof c.palette === "object"
                ? {
                    base: optionalString((c.palette as Record<string, unknown>).base),
                    main: normalizeStringList((c.palette as Record<string, unknown>).main),
                    accents: normalizeStringList((c.palette as Record<string, unknown>).accents),
                  }
                : undefined,
          };
        })
        .filter((char): char is NeoCreationPlan["characters"][number] => !!char)
        .slice(0, 12)
    : [];
  const style =
    data.style && typeof data.style === "object"
      ? {
          perspective: optionalString((data.style as Record<string, unknown>).perspective),
          tone: optionalString((data.style as Record<string, unknown>).tone),
          mood: optionalString((data.style as Record<string, unknown>).mood),
        }
      : undefined;
  const entries = normalizePlanEntries(data.entries || data.entryPlan);
  const firstMessage =
    data.firstMessage && typeof data.firstMessage === "object"
      ? {
          format: optionalString((data.firstMessage as Record<string, unknown>).format),
          scene: optionalString((data.firstMessage as Record<string, unknown>).scene),
          openingSituation: optionalString((data.firstMessage as Record<string, unknown>).openingSituation),
          wordCount: optionalString((data.firstMessage as Record<string, unknown>).wordCount),
        }
      : undefined;
  const openQuestions = Array.isArray(data.openQuestions)
    ? data.openQuestions.map((q) => trimString(q)).filter(Boolean)
    : [];

  const plan: Omit<NeoCreationPlan, "yaml" | "updatedAt"> = {
    project: {
      name: trimString(project.name || data.projectName) || existing?.project?.name || "Whale Builder",
      worldbookName: optionalString(project.worldbookName || data.worldbookName),
      form: project.form === "worldbook" || data.form === "worldbook" ? "worldbook" : "charactercard",
      sourceType: optionalString(project.sourceType || data.sourceType),
      planningMode: optionalString(project.planningMode || data.planningMode),
    },
    world:
      world.overview || data.worldPlan
        ? {
            overview: optionalString(world.overview || data.worldPlan),
            regions: normalizeStringList(world.regions),
            factions: normalizeStringList(world.factions),
          }
        : undefined,
    characters,
    style,
    entries,
    firstMessage,
    openQuestions,
  };

  return {
    ...plan,
    yaml: data.yaml && typeof data.yaml === "string" ? data.yaml : buildCreationPlanYaml(plan),
    updatedAt: new Date().toISOString(),
  };
}

export function updatePlanEntryStatus(
  plan: NeoCreationPlan | null | undefined,
  args: Record<string, unknown>,
): NeoCreationPlan | undefined {
  if (!plan) return undefined;
  const entryId = trimString(args.entryId || args.id);
  const status: NeoCreationPlanEntry["status"] =
    args.status === "done" || args.status === "in_progress" || args.status === "skipped" ? args.status : "done";
  const entries = plan.entries.map((entry) =>
    entry.id === entryId || entry.name === entryId || !entryId
      ? {
          ...entry,
          status,
          outputRef: optionalString(args.outputRef || args.output_ref) || entry.outputRef,
          skipReason: optionalString(args.skipReason || args.skip_reason) || entry.skipReason,
        }
      : entry,
  );
  return { ...plan, entries, updatedAt: new Date().toISOString() };
}

// ── Evaluation Report ──

export function normalizeEvaluationReport(args: Record<string, unknown>, issues: string[]): NeoBuilderEvaluationReport {
  const argIssuesFromModel: NeoBuilderEvaluationReport["issues"] = Array.isArray(args.issues)
    ? (args.issues as unknown[])
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item) => ({
          severity:
            item.severity === "high" || item.severity === "medium" || item.severity === "low"
              ? item.severity
              : ("medium" as const),
          target: trimString(item.target) || "character",
          message: trimString(item.message) || "未说明问题",
        }))
    : [];

  const argIssues: NeoBuilderEvaluationReport["issues"] = argIssuesFromModel.concat(
    issues
      .filter((issue) => !argIssuesFromModel.some((ai) => ai.message === issue))
      .map((issue) => ({ severity: "medium" as const, target: "character", message: issue })),
  );

  const suggestions = Array.isArray(args.suggestions) ? args.suggestions.map((s) => trimString(s)).filter(Boolean) : [];

  return {
    summary: trimString(args.summary) || "角色草稿评估",
    issues: argIssues,
    suggestions,
    score:
      typeof args.score === "number" && Number.isFinite(args.score)
        ? Math.max(0, Math.min(100, args.score))
        : undefined,
  };
}

// ── MVU ──

export function normalizeMvuConfig(value: unknown): NeoMvuConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const schemaTs = trimString(data.schemaTs || data.schema_ts || data.schema);
  if (!schemaTs) return undefined;
  return {
    schemaTs,
    initvarYaml: optionalString(data.initvarYaml || data.initvar_yaml || data.initvar),
    updateRulesYaml: optionalString(data.updateRulesYaml || data.update_rules_yaml || data.updateRules),
  };
}

function validateMvu(mvu: NeoMvuConfig): string[] {
  const issues: string[] = [];
  const schema = mvu.schemaTs;

  // Check for Zod export
  if (!/export\s+const\s+Schema\s*=/.test(schema)) {
    issues.push("MVU schema.ts 需要导出 const Schema = z.object({...})");
  }
  if (!/export\s+type\s+Schema\s*=/.test(schema)) {
    issues.push("MVU schema.ts 需要导出 type Schema = z.output<typeof Schema>");
  }

  // Check for forbidden Zod 4 patterns
  if (/\.strict\(/.test(schema) || /\.passthrough\(/.test(schema)) {
    issues.push("MVU schema.ts 不能使用 .strict() / .passthrough()");
  }
  if (/z\.number\s*\(/.test(schema)) {
    issues.push("MVU schema.ts 应使用 z.coerce.number() 而非 z.number()");
  }
  if (/import\s+.*\b(?:z|zod|lodash|_)\b.*from/.test(schema)) {
    issues.push("MVU schema.ts 不应 import zod/lodash（已全局可用）");
  }

  // Basic initvar YAML check
  if (mvu.initvarYaml) {
    const yaml = mvu.initvarYaml.trim();
    if (yaml.includes("export") || yaml.includes("const")) {
      issues.push("MVU initvar.yaml 不应包含 TypeScript 代码");
    }
  }

  return issues;
}

// ── Status Bars ──

function normalizeStatusBarItem(value: unknown, fallbackId?: string): CharacterStatusBar | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const id = trimString(data.id || fallbackId || data.assetId || data.asset_id);
  const assetId = trimString(data.assetId || data.asset_id || data.asset || id);
  const label = trimString(data.label || data.name || id);
  if (!id || !label) return null;

  const max = Math.max(1, toFiniteNumber(data.max ?? data.maximum ?? data.上限) ?? 100);
  const min = toFiniteNumber(data.min ?? data.minimum ?? data.下限) ?? 0;
  const rawValue = data.value ?? data.current ?? data.now ?? data.当前值;
  const parsedValue = rawValue === null ? null : toFiniteNumber(rawValue);
  const statusValue = parsedValue === undefined || parsedValue === null ? null : clampNumber(parsedValue, min, max);

  return {
    id,
    assetId: STATUS_BAR_ASSET_IDS.has(assetId) ? assetId : id,
    label,
    value: statusValue,
    max,
    min,
    description: optionalString(data.description || data.note || data.说明),
    valueLabel: optionalString(data.valueLabel || data.value_label || data.text),
    visible: data.visible === false ? false : true,
    mvuPath: optionalString(data.mvuPath || data.mvu_path || data.path),
  };
}

export function normalizeStatusBarConfig(value: unknown): CharacterStatusBarConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const rawBars = Array.isArray(data.bars)
    ? data.bars.map((item) => normalizeStatusBarItem(item))
    : Object.entries((data.status_bars || data.statusBars || data) as Record<string, unknown>).map(([id, item]) =>
        normalizeStatusBarItem(item, id),
      );
  const bars = rawBars
    .filter((item): item is CharacterStatusBar => !!item)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 12);
  if (!bars.length) return undefined;
  return {
    version: 1,
    bars,
    source: optionalString(data.source) || "whale-builder",
    updatedAt: optionalString(data.updatedAt || data.updated_at) || new Date().toISOString(),
  };
}

function validateStatusBars(statusBars: CharacterStatusBarConfig): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const bar of statusBars.bars) {
    if (ids.has(bar.id)) issues.push(`状态栏 id 重复：${bar.id}`);
    ids.add(bar.id);
    if (bar.max <= 0) issues.push(`状态栏"${bar.label}"的 max 必须大于 0`);
    if (bar.value !== null && (bar.value < (bar.min ?? 0) || bar.value > bar.max)) {
      issues.push(`状态栏"${bar.label}"的 value 必须在 min~max 范围内`);
    }
  }
  return issues;
}

// ── Normalize Draft (main validation entry) ──

export function normalizeDraft(
  payload: DraftPayload,
  existingCharacter?: CreateCharacterInput | null,
): ValidationResult {
  const source = payload.character ?? {};
  const personalityPalette = normalizePersonalityPalette(payload.personalityPalette);
  const paletteText = personalityPalette?.compiledText;
  const sourcePersonality = trimString(source.personality);
  const statusBars = normalizeStatusBarConfig(
    payload.statusBars ?? source.statusBars ?? (source as Record<string, unknown>).status_bars,
  );
  const character: CreateCharacterInput = {
    name: trimString(source.name) || existingCharacter?.name || "",
    avatar: optionalString(source.avatar) || existingCharacter?.avatar,
    description: trimString(source.description) || existingCharacter?.description || "",
    personality: sourcePersonality
      ? paletteText && !sourcePersonality.includes("性格调色盘")
        ? `${sourcePersonality}\n\n${paletteText}`
        : sourcePersonality
      : paletteText || existingCharacter?.personality || "",
    scenario: trimString(source.scenario) || existingCharacter?.scenario || "",
    firstMessage: trimString(source.firstMessage) || existingCharacter?.firstMessage || "",
    exampleDialogues: trimString(source.exampleDialogues) || existingCharacter?.exampleDialogues || "",
    tags: normalizeTags(source.tags) || existingCharacter?.tags,
    statusBars: statusBars || existingCharacter?.statusBars,
  };

  const worldbookEntries = normalizeWorldbookEntries(payload.worldbookEntries);
  const creationPlan =
    payload.creationPlan && typeof payload.creationPlan === "object"
      ? normalizeCreationPlan(payload.creationPlan as Record<string, unknown>)
      : undefined;
  const mvu = normalizeMvuConfig(payload.mvu);
  const issues: string[] = [];

  if (!character.name) issues.push("name 不能为空");
  if (!character.description) issues.push("description 不能为空");
  if (!character.personality) issues.push("personality 不能为空");
  if (!character.scenario) issues.push("scenario 不能为空");
  if (!character.firstMessage) issues.push("firstMessage 不能为空");

  for (const [field, value] of Object.entries({
    name: character.name,
    description: character.description,
    personality: character.personality,
    scenario: character.scenario,
    firstMessage: character.firstMessage,
    exampleDialogues: character.exampleDialogues,
  })) {
    if (value && hasPlaceholder(value)) issues.push(`${field} 含有占位符或待定信息`);
  }

  if (/这是开场白|以下是开场|作为.*角色/.test(character.firstMessage)) {
    issues.push("firstMessage 不能写成说明文字，必须直接进入角色消息");
  }
  if (USER_ACTION_PATTERN.test(character.firstMessage)) {
    issues.push("firstMessage 疑似替用户行动或感受，请改为给用户入口");
  }

  if (!personalityPalette && !character.personality.includes("性格调色盘")) {
    issues.push("需要提供 personalityPalette，不能只把性格压扁成普通 personality 文本");
  }

  if (personalityPalette) {
    if (!personalityPalette.base) issues.push("性格调色盘需要底色");
    if (personalityPalette.main.length === 0) issues.push("性格调色盘需要至少一个主色调");
    if (personalityPalette.derivatives.length === 0) {
      issues.push(
        '性格调色盘需要衍生（[{color:"性格名", items:["场景描述1", "场景描述2"]}] 或 {"性格名": ["描述1", "描述2"]} 格式，每个性格 ≥2 条）',
      );
    }
    for (const derivative of personalityPalette.derivatives) {
      if (derivative.items.length < 2) {
        issues.push(`性格"${derivative.color}"至少需要 2 条具体衍生，当前 ${derivative.items.length} 条`);
      }
    }
  }

  for (const entry of worldbookEntries) {
    if (entry.type === "trigger" && !entry.keys.trim()) {
      issues.push(`召回世界书条目"${entry.title}"需要 keys`);
    }
    for (const key of splitEntryKeys(entry.keys)) {
      if (isSingleHanKey(key)) issues.push(`世界书条目"${entry.title}"包含单汉字 key："${key}"`);
    }
    if (hasPlaceholder(entry.title) || hasPlaceholder(entry.keys) || hasPlaceholder(entry.content)) {
      issues.push(`世界书条目"${entry.title}"含有占位符或待定信息`);
    }
    if (!entry.content.trim()) {
      issues.push(`世界书条目"${entry.title}"需要 content`);
    }
  }

  if (mvu) {
    issues.push(...validateMvu(mvu));
  }
  if (character.statusBars) {
    issues.push(...validateStatusBars(character.statusBars));
  }

  return {
    draft: {
      character,
      worldbookName: optionalString(payload.worldbookName),
      worldbookDescription: optionalString(payload.worldbookDescription),
      worldbookEntries,
      personalityPalette,
      creationPlan,
      mvu,
      statusBars: character.statusBars,
      notes: optionalString(payload.notes),
    },
    issues,
  };
}
