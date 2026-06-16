export interface ParsedCharacterCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  exampleDialogues: string;
  creatorNotes: string;
  tags: string[];
  regexScripts: Array<{
    scriptName: string;
    findRegex: string;
    replaceString: string;
    disabled: boolean;
    markdownOnly: boolean;
    promptOnly: boolean;
  }>;
  worldbookName: string;
  worldbookEntries: Array<{
    title: string;
    keys: string;
    content: string;
    always: boolean;
    triggerMode: "and" | "or";
    priority: number;
    enabled: boolean;
  }>;
}

function readPngTextChunks(buf: ArrayBuffer): { keyword: string; value: string }[] {
  const view = new DataView(buf);
  const chunks: { keyword: string; value: string }[] = [];
  let offset = 8;
  while (offset < buf.byteLength - 8) {
    const len = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );
    if (type === "tEXt") {
      const data = new Uint8Array(buf.slice(offset + 8, offset + 8 + len));
      const nullIdx = data.indexOf(0);
      if (nullIdx < 0) {
        offset += 12 + len;
        continue;
      }
      const keyword = new TextDecoder().decode(data.slice(0, nullIdx));
      const value = new TextDecoder().decode(data.slice(nullIdx + 1));
      chunks.push({ keyword, value });
    }
    offset += 12 + len;
  }
  return chunks;
}

function base64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeCharacterJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(base64ToUtf8(text));
  }
}

export function parseJsonCharacterCard(text: string): ParsedCharacterCard | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  return extractCardData(json as Record<string, unknown>);
}

export function parsePngCharacterCard(buf: ArrayBuffer): ParsedCharacterCard | null {
  const chunks = readPngTextChunks(buf);
  const charaChunk = chunks.find((c) => c.keyword === "ccv3") ?? chunks.find((c) => c.keyword === "chara");
  if (!charaChunk) return null;

  let json: unknown;
  try {
    json = decodeCharacterJson(charaChunk.value);
  } catch {
    return null;
  }
  return extractCardData(json as Record<string, unknown>);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function extractCardData(json: Record<string, unknown>): ParsedCharacterCard {
  const data = json.data && typeof json.data === "object" && !Array.isArray(json.data) ? asRecord(json.data) : json;
  const extensions = asRecord(data.extensions);
  const book = asRecord(data.character_book);

  const charName = asString(data.name || json.name, "Untitled");
  const personality = asString(data.personality || json.personality);

  const wbEntries = (Array.isArray(book.entries) ? (book.entries as Record<string, unknown>[]) : []).map((e) => {
    const keys = asStringArray(e.keys).length > 0 ? asStringArray(e.keys) : asStringArray(e.key);
    return {
      title: asString(e.comment || keys[0], "Entry"),
      keys: keys.join(","),
      content: asString(e.content),
      always: e.constant === true,
      triggerMode: (e.selectiveLogic === 0 ? "or" : "and") as "and" | "or",
      priority: 100 - (Number(e.insertion_order) || 0),
      enabled: e.enabled !== false,
    };
  });

  return {
    name: charName,
    description: asString(data.description || json.description),
    personality,
    scenario: asString(data.scenario || json.scenario),
    firstMessage: asString(data.first_mes || json.first_mes || data.firstMessage, "Hello"),
    exampleDialogues: asString(data.mes_example || json.mes_example || data.exampleDialogues),
    creatorNotes: asString(data.creator_notes || json.creator_notes),
    tags: asStringArray(data.tags || json.tags),
    regexScripts: (Array.isArray(extensions.regex_scripts)
      ? extensions.regex_scripts
      : data.regex_scripts || []) as ParsedCharacterCard["regexScripts"],
    worldbookName: asString(extensions.world || book.name),
    worldbookEntries: wbEntries,
  };
}
