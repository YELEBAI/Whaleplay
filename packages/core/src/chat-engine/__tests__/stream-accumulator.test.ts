import { describe, expect, it } from "vitest";
import { createGenerationStreamAccumulator } from "../stream-accumulator";

describe("generation stream accumulator", () => {
  it("keeps reasoning deltas separate by default", async () => {
    const stream = createGenerationStreamAccumulator();

    await stream.acceptChunk({ contentDelta: "visible", reasoningContentDelta: "hidden" });

    expect(stream.content).toBe("visible");
    expect(stream.reasoningContent).toBe("hidden");
  });

  it("can route reasoning deltas into visible content", async () => {
    const deltas: string[] = [];
    const stream = createGenerationStreamAccumulator({
      reasoningDeltaMode: "content",
      onContentDelta: (delta) => {
        deltas.push(delta);
      },
    });

    await stream.acceptChunk({ reasoningContentDelta: "visible fallback" });

    expect(stream.content).toBe("visible fallback");
    expect(stream.reasoningContent).toBe("");
    expect(deltas).toEqual(["visible fallback"]);
  });

  it("can ignore reasoning deltas", async () => {
    const stream = createGenerationStreamAccumulator({ reasoningDeltaMode: "ignore" });

    await stream.acceptChunk({ reasoningContentDelta: "scratchpad" });

    expect(stream.content).toBe("");
    expect(stream.reasoningContent).toBe("");
  });
});
