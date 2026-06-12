import type { RegexRule } from "@neo-tavern/shared";

export interface SideBlock {
  name: string;
  content: string;
  actions?: string[];
}

export interface DisplayBlock {
  type: "narration" | "dialogue" | "template" | "image";
  content: string;
  speaker?: string;
  name?: string;
}

export interface SplitResult {
  mainContent: string;
  promptContent: string;
  displayContent: string;
  displayBlocks: DisplayBlock[];
  sideBlocks: SideBlock[];
}

function buildDisplayBlocks(content: string, regex: RegExp): DisplayBlock[] {
  const blocks: DisplayBlock[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const r = new RegExp(regex.source, regex.flags);
  while ((match = r.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const narration = content.slice(lastIndex, match.index).trim();
      if (narration) blocks.push({ type: "narration", content: narration });
    }
    blocks.push({ type: "dialogue", speaker: match[1], content: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    const narration = content.slice(lastIndex).trim();
    if (narration) blocks.push({ type: "narration", content: narration });
  }
  return blocks;
}

interface InlineTemplateBlock {
  name: string;
  content: string;
}

const INLINE_TEMPLATE_MARKER = "\uE000NEO_INLINE_TEMPLATE_";
const INLINE_TEMPLATE_MARKER_END = "\uE001";
const INLINE_TEMPLATE_REGEX = /\uE000NEO_INLINE_TEMPLATE_(\d+)\uE001/g;
const IMAGE_MARKER = "\uE000NEO_IMAGE_";
const IMAGE_MARKER_END = "\uE001";
const IMAGE_MARKER_REGEX = /\uE000NEO_IMAGE_(\d+)\uE001/g;
const IMAGE_TAG_REGEX = /\[image\]([\s\S]*?)(?:\[\/image\]|\[image\])/gi;
const STRUCTURED_DIALOGUE_MARKER = "\uE000NEO_DIALOGUE_";
const STRUCTURED_DIALOGUE_MARKER_END = "\uE001";
const STRUCTURED_DIALOGUE_MARKER_REGEX = /\uE000NEO_DIALOGUE_(\d+)\uE001/g;
const DIALOGUE_TAG_REGEX = /<dialogue>\s*([\s\S]*?)\s*<\/dialogue>/gi;
const JSON_FENCE_REGEX = /```json\s*([\s\S]*?)\s*```/gi;

function isInlineTemplateRule(rule: RegexRule) {
  const normalizedName = rule.name.toLowerCase();
  return (
    rule.displayTemplate.includes("neo-thoughts") ||
    rule.name.includes("内心") ||
    normalizedName.includes("inner") ||
    normalizedName.includes("thought")
  );
}

function applyTemplate(template: string, match: RegExpMatchArray | RegExpExecArray) {
  let display = template;
  for (let i = 1; i < match.length; i++) {
    display = display.split(`$${i}`).join(match[i] || "");
  }
  return display;
}

function markInlineTemplateBlocks(content: string, rules: RegexRule[]) {
  const inlineBlocks: InlineTemplateBlock[] = [];
  let markedContent = content;

  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern, "gs");
      markedContent = markedContent.replace(regex, (...args) => {
        const match = args.slice(0, -2) as RegExpMatchArray;
        const index = inlineBlocks.length;
        inlineBlocks.push({
          name: rule.name,
          content: applyTemplate(rule.displayTemplate, match),
        });
        return `${INLINE_TEMPLATE_MARKER}${index}${INLINE_TEMPLATE_MARKER_END}`;
      });
    } catch {
      continue;
    }
  }

  return { markedContent, inlineBlocks };
}

function markImageBlocks(content: string) {
  const imagePrompts: string[] = [];
  const markedContent = content.replace(IMAGE_TAG_REGEX, (_match, prompt: string) => {
    const index = imagePrompts.length;
    imagePrompts.push(prompt.trim());
    return `${IMAGE_MARKER}${index}${IMAGE_MARKER_END}`;
  });
  return { markedContent, imagePrompts };
}

function stripImageTags(content: string) {
  return content.replace(IMAGE_TAG_REGEX, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toDialogueBlock(value: unknown): DisplayBlock | null {
  if (!isRecord(value)) return null;
  const type = trimString(value.type || value.kind).toLowerCase();
  if (type && !["dialogue", "speech", "line"].includes(type)) return null;
  const speaker = trimString(value.speaker || value.name || value.character || value.role);
  const content = trimString(value.text || value.content || value.line || value.dialogue);
  if (!speaker || !content) return null;
  return { type: "dialogue", speaker, content };
}

function parseDialogueJson(raw: string): DisplayBlock[] {
  try {
    const parsed = JSON.parse(raw.trim());
    const values = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.dialogues)
        ? parsed.dialogues
        : [parsed];
    return values.map(toDialogueBlock).filter((block): block is DisplayBlock => !!block);
  } catch {
    return [];
  }
}

function markStructuredDialogueBlocks(content: string) {
  const dialogueBlocks: DisplayBlock[] = [];
  const insertBlocks = (blocks: DisplayBlock[]) =>
    blocks
      .map((block) => {
        const index = dialogueBlocks.length;
        dialogueBlocks.push(block);
        return `${STRUCTURED_DIALOGUE_MARKER}${index}${STRUCTURED_DIALOGUE_MARKER_END}`;
      })
      .join("\n");

  let markedContent = content.replace(DIALOGUE_TAG_REGEX, (match, raw: string) => {
    const blocks = parseDialogueJson(raw);
    return blocks.length ? insertBlocks(blocks) : match;
  });

  markedContent = markedContent.replace(JSON_FENCE_REGEX, (match, raw: string) => {
    const blocks = parseDialogueJson(raw);
    return blocks.length ? insertBlocks(blocks) : match;
  });

  markedContent = markedContent
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || !/^(?:\{[\s\S]*\}|\[[\s\S]*\])$/.test(trimmed)) return line;
      const blocks = parseDialogueJson(trimmed);
      return blocks.length ? insertBlocks(blocks) : line;
    })
    .join("\n");

  return { markedContent, dialogueBlocks };
}

function expandMarkerBlocks(
  blocks: DisplayBlock[],
  markerRegex: RegExp,
  createBlock: (index: number) => DisplayBlock | null,
) {
  const expanded: DisplayBlock[] = [];

  for (const block of blocks) {
    if (block.type === "template" || block.type === "image") {
      expanded.push(block);
      continue;
    }

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const regex = new RegExp(markerRegex.source, "g");

    while ((match = regex.exec(block.content)) !== null) {
      const before = block.content.slice(lastIndex, match.index).trim();
      if (before) expanded.push({ ...block, content: before });

      const nextBlock = createBlock(Number(match[1]));
      if (nextBlock) expanded.push(nextBlock);

      lastIndex = match.index + match[0].length;
    }

    const after = block.content.slice(lastIndex).trim();
    if (after) expanded.push({ ...block, content: after });
  }

  return expanded;
}

function expandInlineTemplateBlocks(blocks: DisplayBlock[], inlineBlocks: InlineTemplateBlock[]) {
  if (inlineBlocks.length === 0) return blocks;

  return expandMarkerBlocks(blocks, INLINE_TEMPLATE_REGEX, (index) => {
    const inline = inlineBlocks[index];
    if (!inline) return null;
    return {
      type: "template",
      name: inline.name,
      content: inline.content,
    };
  });
}

function expandImageBlocks(blocks: DisplayBlock[], imagePrompts: string[]) {
  if (imagePrompts.length === 0) return blocks;

  return expandMarkerBlocks(blocks, IMAGE_MARKER_REGEX, (index) => {
    const prompt = imagePrompts[index];
    if (!prompt) return null;
    return {
      type: "image",
      name: "Image",
      content: prompt,
    };
  });
}

function expandStructuredDialogueBlocks(blocks: DisplayBlock[], dialogueBlocks: DisplayBlock[]) {
  if (dialogueBlocks.length === 0) return blocks;

  return expandMarkerBlocks(blocks, STRUCTURED_DIALOGUE_MARKER_REGEX, (index) => dialogueBlocks[index] ?? null);
}

function formatDisplayBlock(block: DisplayBlock) {
  if (block.type === "dialogue") return `**${block.speaker}：**${block.content}`;
  if (block.type === "image") return `[image]${block.content}[/image]`;
  return block.content;
}

export function applyRegexRules(content: string, rules: RegexRule[]): SplitResult {
  const enabled = rules.filter((r) => r.enabled);
  const sideBlocks: SideBlock[] = [];
  let pendingActions: SideBlock | null = null;

  const promptStripRules: RegexRule[] = [];
  const unwrapRules: RegexRule[] = [];
  const actionRules: RegexRule[] = [];
  const dialogueRules: RegexRule[] = [];
  const templateRules: RegexRule[] = [];

  for (const rule of enabled) {
    if (rule.name.startsWith("💬")) {
      dialogueRules.push(rule);
    } else if (rule.stripFromPrompt) {
      promptStripRules.push(rule);
    } else if (rule.displayTemplate === "$1") {
      unwrapRules.push(rule);
    } else if (rule.displayTemplate === "$actions") {
      actionRules.push(rule);
    } else if (!rule.displayTemplate) {
      promptStripRules.push(rule);
    } else {
      templateRules.push(rule);
    }
  }

  let displayContent = content;
  for (const rule of promptStripRules) {
    try {
      displayContent = displayContent.replace(new RegExp(rule.pattern, "gs"), "");
    } catch {
      continue;
    }
  }

  for (const rule of unwrapRules) {
    try {
      displayContent = displayContent.replace(new RegExp(rule.pattern, "gs"), "$1");
    } catch {
      continue;
    }
  }

  for (const rule of actionRules) {
    try {
      const regex = new RegExp(rule.pattern, "gs");
      const matches = [...content.matchAll(regex)];
      if (matches.length === 0) continue;
      const actions: string[] = [];
      for (const match of matches) {
        for (let i = 1; i < match.length; i++) {
          const block = match[i];
          if (!block) continue;
          const lines = block.split("\n").filter(Boolean);
          for (const line of lines) {
            const cleaned = line.replace(/^\s*\d+\.\s*/, "").trim();
            if (cleaned) actions.push(cleaned);
          }
        }
      }
      if (actions.length > 0) {
        pendingActions = { name: rule.name, content: "", actions };
      }
      displayContent = displayContent.replace(regex, "");
    } catch {
      continue;
    }
  }

  const promptContent = stripImageTags(displayContent);
  const inlineTemplateRules = templateRules.filter(isInlineTemplateRule);
  const sideTemplateRules = templateRules.filter((rule) => !isInlineTemplateRule(rule));
  const inlineTemplates = markInlineTemplateBlocks(displayContent, inlineTemplateRules);
  displayContent = inlineTemplates.markedContent;
  const imageMarkers = markImageBlocks(displayContent);
  displayContent = imageMarkers.markedContent;
  const structuredDialogues = markStructuredDialogueBlocks(displayContent);
  displayContent = structuredDialogues.markedContent;

  let displayBlocks: DisplayBlock[] = [];
  for (const rule of dialogueRules) {
    try {
      const regex = new RegExp(rule.pattern, "gs");
      displayBlocks = buildDisplayBlocks(displayContent, regex);
      if (rule.stripFromPrompt) {
        displayContent = displayContent.replace(regex, "");
      }
    } catch {
      continue;
    }
  }

  displayContent = displayContent.trim();
  if (displayBlocks.length > 0) {
    displayBlocks = expandStructuredDialogueBlocks(displayBlocks, structuredDialogues.dialogueBlocks);
    displayBlocks = expandInlineTemplateBlocks(displayBlocks, inlineTemplates.inlineBlocks);
    displayBlocks = expandImageBlocks(displayBlocks, imageMarkers.imagePrompts);
  } else if (
    structuredDialogues.dialogueBlocks.length > 0 ||
    inlineTemplates.inlineBlocks.length > 0 ||
    imageMarkers.imagePrompts.length > 0
  ) {
    displayBlocks = expandStructuredDialogueBlocks(
      [{ type: "narration", content: displayContent }],
      structuredDialogues.dialogueBlocks,
    );
    displayBlocks = expandInlineTemplateBlocks(displayBlocks, inlineTemplates.inlineBlocks);
    displayBlocks = expandImageBlocks(displayBlocks, imageMarkers.imagePrompts);
  }

  let finalDisplayContent =
    displayBlocks.length > 0 ? displayBlocks.map(formatDisplayBlock).join("\n\n") : displayContent;

  for (const rule of sideTemplateRules) {
    try {
      const regex = new RegExp(rule.pattern, "gs");
      const matches = [...content.matchAll(regex)];
      if (matches.length === 0) continue;

      for (const match of matches) {
        const display = applyTemplate(rule.displayTemplate, match);
        sideBlocks.push({ name: rule.name, content: display });
      }

      finalDisplayContent = finalDisplayContent.replace(regex, "");
      for (const block of displayBlocks) {
        block.content = block.content.replace(regex, "");
      }
      displayBlocks = displayBlocks.filter((block) => block.type === "template" || block.content.trim());
    } catch {
      continue;
    }
  }

  if (pendingActions) {
    sideBlocks.push(pendingActions);
  }

  return {
    mainContent: content,
    promptContent,
    displayContent: finalDisplayContent,
    displayBlocks,
    sideBlocks,
  };
}

export function stripPromptContent(content: string, rules: RegexRule[]): string {
  let result = content;
  for (const rule of rules) {
    if (!rule.enabled || !rule.stripFromPrompt) continue;
    try {
      result = result.replace(new RegExp(rule.pattern, "gs"), "");
    } catch {
      continue;
    }
  }
  return stripImageTags(result);
}
