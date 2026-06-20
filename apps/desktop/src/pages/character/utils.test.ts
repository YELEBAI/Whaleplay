import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  arrayBufferToBase64,
  getErrorMessage,
  buildImportedRegexPreset,
  buildImportedWorldbook,
  originalPngAvatarDataUrl,
  readCachedSidebarCharId,
  writeCachedSidebarCharId,
  clearCachedSidebarCharId,
} from "./utils";
import type { ParsedCharacterCard } from "@/utils/parse-character-card";

// ── Hoisted mocks (must use vi.hoisted due to vi.mock hoisting) ─
const { nextIds, sessionGet, sessionSetJson, sessionRemove } = vi.hoisted(() => ({
  nextIds: [] as string[],
  sessionGet: vi.fn<() => string | null>(),
  sessionSetJson: vi.fn(),
  sessionRemove: vi.fn(),
}));

/** Replace the contents of nextIds (mutates the array since const binding can't be reassigned). */
function setNextIds(ids: string[]) {
  nextIds.length = 0;
  nextIds.push(...ids);
}

// ── Mock generateId ────────────────────────────────────
vi.mock("@neo-tavern/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@neo-tavern/shared")>();
  return {
    ...actual,
    generateId: vi.fn(() => {
      const id = nextIds.shift();
      if (id) return id;
      return `mock-id-${nextIds.length}`;
    }),
  };
});

// ── Mock sessionSync ───────────────────────────────────
vi.mock("@/db/kv", () => ({
  sessionSync: {
    get: sessionGet,
    setJson: sessionSetJson,
    remove: sessionRemove,
  },
}));

// ── Helpers ────────────────────────────────────────────
function buf(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer;
}

function makeCard(overrides: Partial<ParsedCharacterCard> = {}): ParsedCharacterCard {
  return {
    name: "TestChar",
    description: "",
    personality: "",
    scenario: "",
    firstMessage: "",
    exampleDialogues: "",
    creatorNotes: "",
    tags: [],
    regexScripts: [],
    worldbookName: "",
    worldbookEntries: [],
    ...overrides,
  };
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("arrayBufferToBase64", () => {
  it("returns empty string for empty buffer", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });

  it("encodes a single byte correctly", () => {
    // 0x41 = 'A' → base64 "QQ=="
    const buffer = new Uint8Array([0x41]).buffer;
    expect(arrayBufferToBase64(buffer)).toBe("QQ==");
  });

  it('encodes "hello" text correctly', () => {
    expect(arrayBufferToBase64(buf("hello"))).toBe("aGVsbG8=");
  });

  it("encodes binary data correctly", () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x7f, 0x80, 0xaa, 0x55]);
    expect(arrayBufferToBase64(bytes.buffer)).toBe("AP9/gKpV");
  });

  it("handles large buffer spanning multiple chunks", () => {
    // chunk size is 0x8000 = 32768, create 40000 bytes
    const bytes = new Uint8Array(40000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const result = arrayBufferToBase64(bytes.buffer);
    // verify round-trip
    const decoded = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
    expect(decoded.length).toBe(40000);
    expect(decoded[0]).toBe(0);
    expect(decoded[39999]).toBe(39999 & 0xff);
  });
});

describe("getErrorMessage", () => {
  it("returns message from Error instance", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns the string itself for string input", () => {
    expect(getErrorMessage("test")).toBe("test");
  });

  it('returns "null" for null', () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  it('returns "undefined" for undefined', () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("returns stringified number for 42", () => {
    expect(getErrorMessage(42)).toBe("42");
  });

  it("returns [object Object] for a plain object", () => {
    expect(getErrorMessage({ code: 500 })).toBe("[object Object]");
  });

  it("returns empty string for Error with empty message", () => {
    expect(getErrorMessage(new Error())).toBe("");
  });
});

describe("buildImportedRegexPreset", () => {
  beforeEach(() => {
    nextIds.length = 0;
  });

  it("returns null for empty regexScripts", () => {
    const card = makeCard({ regexScripts: [] });
    expect(buildImportedRegexPreset(card, "Char", NOW)).toBeNull();
  });

  it("skips disabled scripts", () => {
    const card = makeCard({
      regexScripts: [
        {
          scriptName: "Test",
          findRegex: "/pattern/g",
          replaceString: "replaced",
          disabled: true,
          markdownOnly: true,
          promptOnly: false,
        },
      ],
    });
    expect(buildImportedRegexPreset(card, "Char", NOW)).toBeNull();
  });

  it("skips scripts with empty findRegex", () => {
    const card = makeCard({
      regexScripts: [
        {
          scriptName: "Test",
          findRegex: "",
          replaceString: "replaced",
          disabled: false,
          markdownOnly: true,
          promptOnly: false,
        },
      ],
    });
    expect(buildImportedRegexPreset(card, "Char", NOW)).toBeNull();
  });

  it("skips scripts with invalid findRegex format", () => {
    const card = makeCard({
      regexScripts: [
        {
          scriptName: "Test",
          findRegex: "not-a-regex",
          replaceString: "replaced",
          disabled: false,
          markdownOnly: true,
          promptOnly: false,
        },
      ],
    });
    expect(buildImportedRegexPreset(card, "Char", NOW)).toBeNull();
  });

  it("skips promptOnly (non-display) rules", () => {
    // promptOnly=true means NOT a display rule → should be skipped
    const card = makeCard({
      regexScripts: [
        {
          scriptName: "Prompt",
          findRegex: "/pattern/g",
          replaceString: "replaced",
          disabled: false,
          markdownOnly: false,
          promptOnly: true,
        },
      ],
    });
    expect(buildImportedRegexPreset(card, "Char", NOW)).toBeNull();
  });

  it("includes markdownOnly rule (display rule)", () => {
    setNextIds(["rule-1", "preset-1"]);
    const card = makeCard({
      regexScripts: [
        {
          scriptName: "MD Rule",
          findRegex: "/pattern/g",
          replaceString: "replaced",
          disabled: false,
          markdownOnly: true,
          promptOnly: false,
        },
      ],
    });
    const result = buildImportedRegexPreset(card, "Char", NOW);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Char Regex");
    expect(result!.rules).toHaveLength(1);
    expect(result!.rules[0].name).toBe("MD Rule");
    expect(result!.rules[0].pattern).toBe("pattern");
    expect(result!.rules[0].displayTemplate).toBe("replaced");
    expect(result!.rules[0].stripFromPrompt).toBe(true);
    expect(result!.rules[0].enabled).toBe(true);
    expect(result!.rules[0].presetId).toBe("preset-1");
  });

  it("extracts regex flags from findRegex", () => {
    setNextIds(["rule-1", "preset-1"]);
    const card = makeCard({
      regexScripts: [
        {
          scriptName: "Flags Rule",
          findRegex: "/hello/gi",
          replaceString: "bye",
          disabled: false,
          markdownOnly: true,
          promptOnly: false,
        },
      ],
    });
    const result = buildImportedRegexPreset(card, "Char", NOW);
    expect(result!.rules[0].pattern).toBe("hello");
  });

  it('uses "Imported Rule" as default name when scriptName is empty', () => {
    setNextIds(["rule-1", "preset-1"]);
    const card = makeCard({
      regexScripts: [
        {
          scriptName: "",
          findRegex: "/pattern/g",
          replaceString: "replaced",
          disabled: false,
          markdownOnly: true,
          promptOnly: false,
        },
      ],
    });
    const result = buildImportedRegexPreset(card, "Char", NOW);
    expect(result!.rules[0].name).toBe("Imported Rule");
  });

  it("generates correct preset structure with multiple rules", () => {
    setNextIds(["r1", "r2", "preset"]);
    const card = makeCard({
      regexScripts: [
        {
          scriptName: "A",
          findRegex: "/a/g",
          replaceString: "A!",
          disabled: false,
          markdownOnly: true,
          promptOnly: false,
        },
        {
          scriptName: "B",
          findRegex: "/b/g",
          replaceString: "B!",
          disabled: false,
          markdownOnly: true,
          promptOnly: false,
        },
      ],
    });
    const result = buildImportedRegexPreset(card, "MyChar", NOW);
    expect(result).toMatchObject({
      id: "preset",
      name: "MyChar Regex",
      description: "Auto-imported with MyChar",
      isGlobal: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result!.rules).toHaveLength(2);
    expect(result!.rules[0].id).toBe("r1");
    expect(result!.rules[1].id).toBe("r2");
    // both rules should share the same presetId
    expect(result!.rules[0].presetId).toBe("preset");
    expect(result!.rules[1].presetId).toBe("preset");
  });
});

describe("buildImportedWorldbook", () => {
  beforeEach(() => {
    nextIds.length = 0;
  });

  it("returns null for empty entries", () => {
    const card = makeCard({ worldbookEntries: [] });
    expect(buildImportedWorldbook(card, "Char", NOW)).toBeNull();
  });

  it("generates worldbook with default name", () => {
    setNextIds(["wb-1", "entry-1"]);
    const card = makeCard({
      worldbookEntries: [
        {
          title: "Entry Title",
          keys: "key1, key2",
          content: "Some content",
          always: false,
          triggerMode: "or",
          priority: 10,
          enabled: true,
        },
      ],
    });
    const result = buildImportedWorldbook(card, "MyChar", NOW);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("MyChar Lorebook");
    expect(result!.description).toBe("Imported with MyChar");
    expect(result!.entries).toHaveLength(1);
    expect(result!.createdAt).toBe(NOW);
    expect(result!.updatedAt).toBe(NOW);
  });

  it("uses worldbookName from card when provided", () => {
    setNextIds(["wb-1", "entry-1"]);
    const card = makeCard({
      worldbookName: "Custom WB Name",
      worldbookEntries: [
        {
          title: "E",
          keys: "k",
          content: "c",
          always: false,
          triggerMode: "and",
          priority: 1,
          enabled: true,
        },
      ],
    });
    const result = buildImportedWorldbook(card, "Char", NOW);
    expect(result!.name).toBe("Custom WB Name");
  });

  it('sets type to "always" when entry.always is true', () => {
    setNextIds(["wb-1", "entry-1"]);
    const card = makeCard({
      worldbookEntries: [
        {
          title: "Always Entry",
          keys: "key",
          content: "content",
          always: true,
          triggerMode: "or",
          priority: 5,
          enabled: false,
        },
      ],
    });
    const result = buildImportedWorldbook(card, "Char", NOW);
    expect(result!.entries[0].type).toBe("always");
  });

  it('sets type to "trigger" when entry.always is false', () => {
    setNextIds(["wb-1", "entry-1"]);
    const card = makeCard({
      worldbookEntries: [
        {
          title: "Trigger Entry",
          keys: "key",
          content: "content",
          always: false,
          triggerMode: "or",
          priority: 5,
          enabled: true,
        },
      ],
    });
    const result = buildImportedWorldbook(card, "Char", NOW);
    expect(result!.entries[0].type).toBe("trigger");
  });

  it("maps all entry fields correctly", () => {
    setNextIds(["wb-1", "entry-1"]);
    const card = makeCard({
      worldbookEntries: [
        {
          title: "My Title",
          keys: "alpha, beta",
          content: "The content body",
          always: false,
          triggerMode: "and",
          priority: 42,
          enabled: false,
        },
      ],
    });
    const result = buildImportedWorldbook(card, "Char", NOW);
    const entry = result!.entries[0];
    expect(entry.id).toBe("entry-1");
    expect(entry.worldbookId).toBe("wb-1");
    expect(entry.title).toBe("My Title");
    expect(entry.keys).toBe("alpha, beta");
    expect(entry.content).toBe("The content body");
    expect(entry.priority).toBe(42);
    expect(entry.type).toBe("trigger");
    expect(entry.triggerMode).toBe("and");
    expect(entry.enabled).toBe(false);
    expect(entry.createdAt).toBe(NOW);
    expect(entry.updatedAt).toBe(NOW);
  });

  it("handles multiple entries", () => {
    setNextIds(["wb-1", "e1", "e2", "e3"]);
    const card = makeCard({
      worldbookEntries: [
        { title: "A", keys: "a", content: "ca", always: true, triggerMode: "or", priority: 1, enabled: true },
        { title: "B", keys: "b", content: "cb", always: false, triggerMode: "and", priority: 2, enabled: false },
        { title: "C", keys: "c", content: "cc", always: false, triggerMode: "or", priority: 3, enabled: true },
      ],
    });
    const result = buildImportedWorldbook(card, "Char", NOW);
    expect(result!.entries).toHaveLength(3);
    expect(result!.entries[0].title).toBe("A");
    expect(result!.entries[1].title).toBe("B");
    expect(result!.entries[2].title).toBe("C");
    // all entries share the same worldbookId
    for (const e of result!.entries) {
      expect(e.worldbookId).toBe("wb-1");
    }
  });
});

describe("originalPngAvatarDataUrl", () => {
  it("returns correct data URL format", () => {
    const buffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer; // PNG magic
    const url = originalPngAvatarDataUrl(buffer);
    expect(url).toMatch(/^data:image\/png;base64,.+/);
  });

  it("encodes small buffer correctly", () => {
    const buffer = buf("tiny");
    const url = originalPngAvatarDataUrl(buffer);
    expect(url).toBe("data:image/png;base64," + arrayBufferToBase64(buf("tiny")));
  });

  it("handles empty buffer", () => {
    const url = originalPngAvatarDataUrl(new ArrayBuffer(0));
    expect(url).toBe("data:image/png;base64,");
  });
});

describe("sidebar char cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("readCachedSidebarCharId", () => {
    it("returns null when no cache entry exists", () => {
      sessionGet.mockReturnValue(null);
      expect(readCachedSidebarCharId()).toBeNull();
    });

    it("returns charId within TTL", () => {
      sessionGet.mockReturnValue(JSON.stringify({ charId: "abc123", ts: Date.now() - 1000 }));
      expect(readCachedSidebarCharId()).toBe("abc123");
      expect(sessionRemove).not.toHaveBeenCalled();
    });

    it("returns null outside TTL and removes stale entry", () => {
      sessionGet.mockReturnValue(JSON.stringify({ charId: "stale", ts: Date.now() - 120_000 }));
      expect(readCachedSidebarCharId()).toBeNull();
      expect(sessionRemove).toHaveBeenCalledWith("character-sidebar-char");
    });

    it("returns null for corrupt JSON", () => {
      sessionGet.mockReturnValue("{invalid json!!!}");
      expect(readCachedSidebarCharId()).toBeNull();
    });

    it("returns null when sessionGet returns null string", () => {
      sessionGet.mockReturnValue(null);
      expect(readCachedSidebarCharId()).toBeNull();
    });

    it("returns null when sessionGet returns empty string", () => {
      sessionGet.mockReturnValue("");
      expect(readCachedSidebarCharId()).toBeNull();
    });
  });

  describe("writeCachedSidebarCharId", () => {
    it("calls sessionSync.setJson with charId and timestamp", () => {
      const before = Date.now();
      writeCachedSidebarCharId("my-char");
      const after = Date.now();
      expect(sessionSetJson).toHaveBeenCalledTimes(1);
      expect(sessionSetJson).toHaveBeenCalledWith(
        "character-sidebar-char",
        expect.objectContaining({ charId: "my-char" }),
      );
      const call = sessionSetJson.mock.calls[0] as [string, { charId: string; ts: number }];
      expect(call[1].ts).toBeGreaterThanOrEqual(before);
      expect(call[1].ts).toBeLessThanOrEqual(after);
    });
  });

  describe("clearCachedSidebarCharId", () => {
    it("calls sessionSync.remove", () => {
      clearCachedSidebarCharId();
      expect(sessionRemove).toHaveBeenCalledWith("character-sidebar-char");
    });
  });
});
