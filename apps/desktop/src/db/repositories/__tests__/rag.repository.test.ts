import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBackend } from "@/platform";
import { ragRepository } from "../rag.repository";

describe("ragRepository storage semantics", () => {
  const backend = getBackend();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not disguise a backend failure as an empty index", async () => {
    vi.mocked(backend.rag.listChunksByOwners).mockRejectedValueOnce(new Error("sqlite unavailable"));

    await expect(ragRepository.listByOwners(["character-1"])).rejects.toThrow("sqlite unavailable");
  });

  it("rejects corrupt stored chunks instead of silently dropping them", async () => {
    vi.mocked(backend.rag.listChunksByOwners).mockResolvedValueOnce([{ id: "broken" }]);

    await expect(ragRepository.listByOwners(["character-1"])).rejects.toThrow(
      "Stored RAG chunk is missing required identity fields",
    );
  });

  it("propagates write failures to the RAG feature boundary", async () => {
    vi.mocked(backend.rag.upsertChunks).mockRejectedValueOnce(new Error("write failed"));

    await expect(ragRepository.upsertChunks([])).rejects.toThrow("write failed");
  });
});
