import { describe, expect, it } from "vitest";
import { buildMessagePath } from "../src/db/repositories";
import { buildBranchSummaries } from "../src/pages/chat/hooks/useBranchNavigation";
import { buildLongConversationFixtureMessages } from "./long-conversation.fixture";

describe("long conversation dev fixture", () => {
  it("produces the expected branch summaries for the built-in seeded tree", () => {
    const fixture = buildLongConversationFixtureMessages();

    const summaries = buildBranchSummaries(fixture.messages, fixture.branchLeafIds.personalQuestions);

    expect(fixture.messages).toHaveLength(42);
    expect(summaries).toHaveLength(4);
    expect(summaries.map((summary) => summary.leafId)).toEqual([
      fixture.trunkLeafId,
      fixture.branchLeafIds.waterMagic,
      fixture.branchLeafIds.librarySecrets,
      fixture.branchLeafIds.personalQuestions,
    ]);

    expect(summaries.find((summary) => summary.leafId === fixture.trunkLeafId)).toMatchObject({
      messageCount: 24,
      forkMessageIndex: fixture.forkMessageNumbers.waterMagic,
    });
    expect(summaries.find((summary) => summary.leafId === fixture.branchLeafIds.waterMagic)).toMatchObject({
      messageCount: 23,
      forkMessageIndex: fixture.forkMessageNumbers.waterMagic,
    });
    expect(summaries.find((summary) => summary.leafId === fixture.branchLeafIds.librarySecrets)).toMatchObject({
      messageCount: 19,
      forkMessageIndex: fixture.forkMessageNumbers.librarySecrets,
    });
    expect(summaries.find((summary) => summary.leafId === fixture.branchLeafIds.personalQuestions)).toMatchObject({
      isActive: true,
      messageCount: 14,
      forkMessageIndex: fixture.forkMessageNumbers.personalQuestions,
    });

    expect(buildMessagePath(fixture.messages, fixture.branchLeafIds.waterMagic).map((message) => message.id)).toContain(
      "fixture-trunk-19",
    );
  });
});
