import skillMdRaw from "./builder/skill/SKILL.md?raw";
import referencesRequirementsRaw from "./builder/skill/references/requirements.md?raw";
import referencesProjectSetupRaw from "./builder/skill/references/project-setup.md?raw";
import referencesConversionRaw from "./builder/skill/references/conversion.md?raw";
import referencesResumeRaw from "./builder/skill/references/resume.md?raw";
import referencesCompositionRaw from "./builder/skill/references/composition.md?raw";
import referencesRulesRaw from "./builder/skill/references/rules.md?raw";
import referencesConventionsRaw from "./builder/skill/references/conventions.md?raw";
import referencesConfigurationRaw from "./builder/skill/references/configuration.md?raw";
import referencesManualRaw from "./builder/skill/references/manual.md?raw";
import referencesRequirementsWorldCharactersRaw from "./builder/skill/references/requirements/world-characters.md?raw";
import referencesRequirementsEntriesDynamicsStyleRaw from "./builder/skill/references/requirements/entries-dynamics-style.md?raw";
import referencesRequirementsPlanningYamlRaw from "./builder/skill/references/requirements/planning-yaml.md?raw";
import referencesRequirementsEntryTypesRaw from "./builder/skill/references/requirements/entry-types.md?raw";
import referencesContentsCreationWorldbookRaw from "./builder/skill/references/contents-creation/worldbook.md?raw";
import referencesContentsCreationCharacterBasicInfoRaw from "./builder/skill/references/contents-creation/character/basic-info.md?raw";
import referencesContentsCreationCharacterPersonalityPaletteRaw from "./builder/skill/references/contents-creation/character/personality-palette.md?raw";
import referencesContentsCreationCharacterTriFacetedRaw from "./builder/skill/references/contents-creation/character/tri-faceted.md?raw";
import referencesContentsCreationCharacterRephraseRaw from "./builder/skill/references/contents-creation/character/rephrase.md?raw";
import referencesContentsCreationCharacterMultiStageRaw from "./builder/skill/references/contents-creation/character/multi-stage.md?raw";
import referencesContentsCreationCharacterNpcRaw from "./builder/skill/references/contents-creation/character/npc.md?raw";
import referencesContentsCreationCharacterCharacterCatalogRaw from "./builder/skill/references/contents-creation/character/character-catalog.md?raw";
import referencesContentsCreationWorldbuildingWorldviewRaw from "./builder/skill/references/contents-creation/worldbuilding/worldview.md?raw";
import referencesContentsCreationWorldbuildingTimelineRaw from "./builder/skill/references/contents-creation/worldbuilding/timeline.md?raw";
import referencesContentsCreationWorldbuildingGeographyRaw from "./builder/skill/references/contents-creation/worldbuilding/geography.md?raw";
import referencesContentsCreationFirstMessageRaw from "./builder/skill/references/contents-creation/first-message.md?raw";
import referencesContentsCreationPresentationRaw from "./builder/skill/references/contents-creation/presentation.md?raw";
import referencesContentsCreationStageGuidanceRaw from "./builder/skill/references/contents-creation/stage-guidance.md?raw";
import referencesMvuGuideRaw from "./builder/skill/references/mvu/guide.md?raw";
import referencesMvuStatusUiAssetsRaw from "./builder/skill/references/mvu/status-ui-assets.md?raw";
import referencesMvuInitvarRaw from "./builder/skill/references/mvu/initvar.md?raw";
import referencesMvuSchemaRaw from "./builder/skill/references/mvu/schema.md?raw";
import referencesMvuUpdateRulesGuideRaw from "./builder/skill/references/mvu/update-rules-guide.md?raw";
import referencesMvuUpdateRulesRaw from "./builder/skill/references/mvu/update-rules.yaml?raw";
import referencesMvuZodRuleRaw from "./builder/skill/references/mvu/zod-rule.yaml?raw";
import assetsStatusUiLibraryRaw from "./builder/skill/assets/status-ui-library.json?raw";
import referencesEjsGuideRaw from "./builder/skill/references/ejs/guide.md?raw";
import referencesEjsReferenceRaw from "./builder/skill/references/ejs/reference.md?raw";
import referencesEjsFeaturesRaw from "./builder/skill/references/ejs/features.md?raw";
import referencesTypeStateRaw from "./builder/skill/references/type/state.ts?raw";
import referencesTypeSettingsRaw from "./builder/skill/references/type/settings.ts?raw";

type NeoBuilderSkillReference = {
  id: string;
  title: string;
  summary: string;
  aliases?: string[];
  content: string;
};

const referenceDefinitions: NeoBuilderSkillReference[] = [
  {
    id: "SKILL.md",
    title: "Whale Builder Skill Index",
    summary: "Whale Play 原生角色卡与世界书工作流总入口，负责场景路由和参考文档索引。",
    aliases: ["neo-workflow", "workflow"],
    content: skillMdRaw,
  },
  {
    id: "references/requirements.md",
    title: "需求对齐",
    summary: "收集项目属性、对齐创作模式、生成 Whale Play 创作规划并等待用户确认。",
    content: referencesRequirementsRaw,
  },
  {
    id: "references/project-setup.md",
    title: "Whale Play 工作台创建",
    summary: "把原版项目创建映射到 Whale Builder 本地工作台。",
    content: referencesProjectSetupRaw,
  },
  {
    id: "references/conversion.md",
    title: "从材料转化",
    summary: "把小说、设定、真实资料或联网资料转化为 Whale Play 角色卡与世界书规划。",
    content: referencesConversionRaw,
  },
  {
    id: "references/resume.md",
    title: "断点续接",
    summary: "读取 Whale Play 本地创作记录，继续构思中或待保存的 Builder 工作台。",
    content: referencesResumeRaw,
  },
  {
    id: "references/composition.md",
    title: "创作执行",
    summary: "按创作规划写角色字段和世界书条目，执行质量扫描、校验和保存。",
    content: referencesCompositionRaw,
  },
  {
    id: "references/rules.md",
    title: "写作规则",
    summary: "绝对零度、八股化、具体性、简体中文和占位符检查。",
    aliases: ["rules"],
    content: referencesRulesRaw,
  },
  {
    id: "references/conventions.md",
    title: "Whale Play 字段与世界书约定",
    summary: "Neo 角色字段、世界书条目、关键词、优先级和保存约定。",
    content: referencesConventionsRaw,
  },
  {
    id: "references/configuration.md",
    title: "Whale Play 运行时配置",
    summary: "解释 beforeHistory、afterHistory、trigger、priority 等运行时字段。",
    content: referencesConfigurationRaw,
  },
  {
    id: "references/manual.md",
    title: "Whale Builder 工具手册",
    summary: "当前 Builder 可用工具和调用时机。",
    content: referencesManualRaw,
  },
  {
    id: "references/requirements/world-characters.md",
    title: "世界与角色信息收集",
    summary: "收集世界观、核心角色、用户入口、NPC 和关系。",
    content: referencesRequirementsWorldCharactersRaw,
  },
  {
    id: "references/requirements/entries-dynamics-style.md",
    title: "条目、动态阶段与风格规划",
    summary: "规划世界书条目、阶段指导、风格约束和开场白。",
    content: referencesRequirementsEntriesDynamicsStyleRaw,
  },
  {
    id: "references/requirements/planning-yaml.md",
    title: "Whale Play 创作规划结构",
    summary: "present_creation_plan 应展示的规划结构和确认项。",
    content: referencesRequirementsPlanningYamlRaw,
  },
  {
    id: "references/requirements/entry-types.md",
    title: "条目类型说明",
    summary: "Whale Play 世界书常用条目类型和适用场景。",
    content: referencesRequirementsEntryTypesRaw,
  },
  {
    id: "references/contents-creation/worldbook.md",
    title: "Whale Play 世界书条目创作",
    summary: "前置世界书和关键词召回世界书的写法。",
    aliases: ["worldbook"],
    content: referencesContentsCreationWorldbookRaw,
  },
  {
    id: "references/contents-creation/character/basic-info.md",
    title: "角色基础信息",
    summary: "name、description、tags 和可观察设定。",
    aliases: ["basic-info"],
    content: referencesContentsCreationCharacterBasicInfoRaw,
  },
  {
    id: "references/contents-creation/character/personality-palette.md",
    title: "性格调色盘",
    summary: "底色、主色调、点缀和衍生；AI 引导用户创作衍生，不把性格压扁成标签。",
    aliases: ["personality-palette"],
    content: referencesContentsCreationCharacterPersonalityPaletteRaw,
  },
  {
    id: "references/contents-creation/character/tri-faceted.md",
    title: "三面性",
    summary: "同一角色在不同关系或场景下的行为切换。",
    content: referencesContentsCreationCharacterTriFacetedRaw,
  },
  {
    id: "references/contents-creation/character/rephrase.md",
    title: "二次解释",
    summary: "把性格标签转化为可执行行为，避免模型误读。",
    content: referencesContentsCreationCharacterRephraseRaw,
  },
  {
    id: "references/contents-creation/character/multi-stage.md",
    title: "多阶段调色盘",
    summary: "关系或剧情推进时角色行为变化的非代码写法。",
    content: referencesContentsCreationCharacterMultiStageRaw,
  },
  {
    id: "references/contents-creation/character/npc.md",
    title: "NPC 编写",
    summary: "辅助角色、组织成员和关系网的世界书写法。",
    content: referencesContentsCreationCharacterNpcRaw,
  },
  {
    id: "references/contents-creation/character/character-catalog.md",
    title: "角色速览",
    summary: "群像项目中先建立角色索引，防止关系混乱。",
    content: referencesContentsCreationCharacterCharacterCatalogRaw,
  },
  {
    id: "references/contents-creation/worldbuilding/worldview.md",
    title: "世界观条目",
    summary: "世界规则、社会结构、力量体系和差异信息。",
    content: referencesContentsCreationWorldbuildingWorldviewRaw,
  },
  {
    id: "references/contents-creation/worldbuilding/timeline.md",
    title: "时间线条目",
    summary: "历史事件和当前剧情事件的世界书写法。",
    content: referencesContentsCreationWorldbuildingTimelineRaw,
  },
  {
    id: "references/contents-creation/worldbuilding/geography.md",
    title: "地理条目",
    summary: "地点、区域、建筑和行动空间的写法。",
    content: referencesContentsCreationWorldbuildingGeographyRaw,
  },
  {
    id: "references/contents-creation/first-message.md",
    title: "开场白创作",
    summary: "firstMessage 的场景、动作、压力点和用户入口规则。",
    aliases: ["first-message"],
    content: referencesContentsCreationFirstMessageRaw,
  },
  {
    id: "references/contents-creation/presentation.md",
    title: "扮演准则",
    summary: "整体叙述风格、禁忌、节奏和呈现方式。",
    content: referencesContentsCreationPresentationRaw,
  },
  {
    id: "references/contents-creation/stage-guidance.md",
    title: "阶段指导",
    summary: "无 MVU/EJS 时的关系阶段、剧情阶段和场景推进指导。",
    content: referencesContentsCreationStageGuidanceRaw,
  },
  {
    id: "references/mvu/guide.md",
    title: "MVU 变量系统",
    summary: "MVU 编写流程：schema.ts → initvar.yaml → 变量更新规则.yaml。",
    aliases: ["mvu-guide"],
    content: referencesMvuGuideRaw,
  },
  {
    id: "references/mvu/status-ui-assets.md",
    title: "状态 UI 素材库",
    summary: "Whale Play 本地状态 UI 素材 id、MVU 变量映射和更新规则示例。",
    aliases: ["status-ui-assets", "status-assets", "mvu-status-ui"],
    content: referencesMvuStatusUiAssetsRaw,
  },
  {
    id: "assets/status-ui-library.json",
    title: "状态 UI 素材 JSON",
    summary: "Whale Play 本地状态 UI 素材库机器可读清单。",
    aliases: ["status-ui-library"],
    content: assetsStatusUiLibraryRaw,
  },
  {
    id: "references/mvu/initvar.md",
    title: "MVU 初始变量",
    summary: "YAML 格式的初始变量值，需与 schema.ts 的 Schema 对应。",
    content: referencesMvuInitvarRaw,
  },
  {
    id: "references/mvu/schema.md",
    title: "MVU 变量结构脚本",
    summary: "schema.ts 的 Zod 4 编写规范：类型设计、幂等性、枚举克制。",
    content: referencesMvuSchemaRaw,
  },
  {
    id: "references/mvu/update-rules-guide.md",
    title: "MVU 变量更新规则",
    summary: "变量更新规则的字段说明、type/range/check 写法与示例。",
    content: referencesMvuUpdateRulesGuideRaw,
  },
  {
    id: "references/mvu/update-rules.yaml",
    title: "MVU 更新规则参考",
    summary: "变量更新规则的 YAML 参考示例（按需查阅）。",
    content: referencesMvuUpdateRulesRaw,
  },
  {
    id: "references/mvu/zod-rule.yaml",
    title: "Zod 编写规则",
    summary: "Zod 4 的编写约束：禁止项、transform 限制、prefault 规则。",
    content: referencesMvuZodRuleRaw,
  },
  {
    id: "references/ejs/guide.md",
    title: "EJS 方案编写",
    summary: "EJS 复杂度分级、@if 条目显隐、段落控制和动态文本（当前 Whale Builder 暂不支持，保留供参考）。",
    content: referencesEjsGuideRaw,
  },
  {
    id: "references/ejs/reference.md",
    title: "EJS 语法参考",
    summary: "EJS 语法参考手册（当前 Whale Builder 暂不支持，保留供参考）。",
    content: referencesEjsReferenceRaw,
  },
  {
    id: "references/ejs/features.md",
    title: "EJS 可用特性",
    summary: "EJS 可用特性与 API（当前 Whale Builder 暂不支持，保留供参考）。",
    content: referencesEjsFeaturesRaw,
  },
  {
    id: "references/type/state.ts",
    title: "Whale Builder State Shape",
    summary: "Whale Builder 内部状态概念，用于理解断点续接和保存。",
    content: referencesTypeStateRaw,
  },
  {
    id: "references/type/settings.ts",
    title: "Whale Builder Settings Shape",
    summary: "Whale Builder 需要关注的设置项。",
    content: referencesTypeSettingsRaw,
  },
];

const byId = new Map(referenceDefinitions.map((reference) => [reference.id, reference]));
const aliasToId = new Map<string, string>();

for (const reference of referenceDefinitions) {
  aliasToId.set(reference.id.toLowerCase(), reference.id);
  for (const alias of reference.aliases ?? []) {
    aliasToId.set(alias.toLowerCase(), reference.id);
  }
}

export const NEO_BUILDER_REFERENCE_IDS = referenceDefinitions.map((reference) => reference.id);

export const NEO_BUILDER_REFERENCE_LOOKUP_IDS = [
  ...NEO_BUILDER_REFERENCE_IDS,
  ...referenceDefinitions.flatMap((reference) => reference.aliases ?? []),
];

export const NEO_BUILDER_REFERENCE_TEXTS: Record<string, string> = Object.fromEntries([
  ...referenceDefinitions.map((reference) => [reference.id, reference.content] as const),
  ...referenceDefinitions.flatMap((reference) =>
    (reference.aliases ?? []).map((alias) => [alias, reference.content] as const),
  ),
]);

export function listNeoBuilderSkillReferences(query?: string) {
  const needle = query?.trim().toLowerCase();
  return referenceDefinitions
    .filter((reference) => {
      if (!needle) return true;
      return [reference.id, reference.title, reference.summary, ...(reference.aliases ?? [])].some((value) =>
        value.toLowerCase().includes(needle),
      );
    })
    .map((reference) => ({
      id: reference.id,
      title: reference.title,
      summary: reference.summary,
      aliases: reference.aliases ?? [],
    }));
}

export function readNeoBuilderSkillReference(idOrAlias: string) {
  const id = aliasToId.get(idOrAlias.trim().toLowerCase());
  return id ? (byId.get(id) ?? null) : null;
}
