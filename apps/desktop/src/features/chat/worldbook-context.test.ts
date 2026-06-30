import { describe, expect, it } from "vitest";
import type { Character, Message, Worldbook, WorldbookEntry } from "@neo-tavern/shared";
import {
  getChatWorldbookContextBlocks,
  getImagePlannerWorldbookReferences,
  resolveChatWorldbook,
} from "./worldbook-context";

const now = "2026-01-01T00:00:00.000Z";

function createCharacter(patch: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Mira",
    description: "",
    personality: "",
    scenario: "",
    firstMessage: "",
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function createMessage(patch: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    chatId: "chat-1",
    parentId: null,
    role: "user",
    content: "Hello",
    createdAt: now,
    ...patch,
  };
}

function createEntry(worldbookId: string, patch: Partial<WorldbookEntry> = {}): WorldbookEntry {
  return {
    id: `${worldbookId}-entry`,
    worldbookId,
    title: `${worldbookId} entry`,
    keys: "archive",
    content: `${worldbookId} content`,
    priority: 10,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function createWorldbook(id: string, entries: WorldbookEntry[]): Worldbook {
  return {
    id,
    name: id,
    description: "",
    entries,
    createdAt: now,
    updatedAt: now,
  };
}

describe("worldbook-context", () => {
  it("prefers the character worldbook over the active worldbook", () => {
    const active = createWorldbook("active-worldbook", [createEntry("active-worldbook")]);
    const bound = createWorldbook("bound-worldbook", [createEntry("bound-worldbook")]);

    const result = resolveChatWorldbook({
      activeWorldbookId: active.id,
      character: createCharacter({ worldbookId: bound.id }),
      worldbooks: [active, bound],
    });

    expect(result?.id).toBe(bound.id);
  });

  it("builds prompt context blocks from the resolved worldbook", async () => {
    const worldbook = createWorldbook("worldbook-1", [
      createEntry("worldbook-1", {
        content: "The archive has a locked basement.",
      }),
    ]);

    const blocks = await getChatWorldbookContextBlocks({
      activeWorldbookId: worldbook.id,
      character: createCharacter(),
      recentMessages: [],
      userInput: "Look around the archive.",
      worldbooks: [worldbook],
    });

    expect(blocks).toEqual([
      expect.objectContaining({
        source: "worldbook",
        title: "worldbook-1 entry",
        content: "The archive has a locked basement.",
      }),
    ]);
  });

  it("builds clipped image planner references from matched entries", () => {
    const worldbook = createWorldbook("worldbook-1", [
      createEntry("worldbook-1", {
        content: "A".repeat(20),
      }),
    ]);

    const references = getImagePlannerWorldbookReferences({
      activeWorldbookId: worldbook.id,
      character: createCharacter(),
      content: "The archive door opens.",
      maxContentChars: 8,
      recentMessages: [createMessage({ content: "The archive is quiet." })],
      worldbooks: [worldbook],
    });

    expect(references).toEqual([
      {
        title: "worldbook-1 entry",
        content: "AAAAAAA…",
      },
    ]);
  });
});
