import { getBackend } from "@/platform";
import type { RagChunkRecord, RagChunkScope } from "@/features/rag/rag-settings";

function asRagChunkRecord(value: unknown): RagChunkRecord | null {
  if (!value || typeof value !== "object") return null;
  const chunk = value as Partial<RagChunkRecord>;
  if (!chunk.id || !chunk.scope || !chunk.ownerId || !chunk.sourceId || !chunk.embeddingModel) return null;
  return {
    id: String(chunk.id),
    scope: chunk.scope as RagChunkScope,
    ownerId: String(chunk.ownerId),
    sourceId: String(chunk.sourceId),
    sourceHash: String(chunk.sourceHash ?? ""),
    chunkIndex: Number(chunk.chunkIndex ?? 0),
    title: String(chunk.title ?? ""),
    content: String(chunk.content ?? ""),
    embeddingModel: String(chunk.embeddingModel),
    embedding: Array.isArray(chunk.embedding) ? chunk.embedding.map(Number).filter(Number.isFinite) : [],
    status: chunk.status ?? "indexed",
    metadata: chunk.metadata && typeof chunk.metadata === "object" ? (chunk.metadata as Record<string, unknown>) : {},
    createdAt: String(chunk.createdAt ?? new Date().toISOString()),
    updatedAt: String(chunk.updatedAt ?? new Date().toISOString()),
  };
}

export const ragRepository = {
  async upsertChunks(chunks: RagChunkRecord[]) {
    try {
      return await getBackend().rag.upsertChunks(chunks);
    } catch (error) {
      console.warn("[rag] upsert failed", error);
      return 0;
    }
  },

  async listByOwners(ownerIds: string[], embeddingModel?: string | null): Promise<RagChunkRecord[]> {
    const uniqueOwnerIds = Array.from(new Set(ownerIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueOwnerIds.length === 0) return [];
    try {
      const rows = await getBackend().rag.listChunksByOwners(uniqueOwnerIds, embeddingModel || null);
      return rows.map(asRagChunkRecord).filter((chunk): chunk is RagChunkRecord => !!chunk);
    } catch (error) {
      console.warn("[rag] list failed", error);
      return [];
    }
  },

  async deleteBySourceIds(sourceIds: string[]) {
    const uniqueSourceIds = Array.from(new Set(sourceIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueSourceIds.length === 0) return 0;
    try {
      return await getBackend().rag.deleteChunksBySourceIds(uniqueSourceIds);
    } catch (error) {
      console.warn("[rag] delete by source failed", error);
      return 0;
    }
  },

  async deleteByOwner(scope: RagChunkScope, ownerId: string) {
    try {
      return await getBackend().rag.deleteChunksByOwner(scope, ownerId);
    } catch (error) {
      console.warn("[rag] delete by owner failed", error);
      return 0;
    }
  },

  async countByOwner(scope: RagChunkScope, ownerId: string) {
    try {
      return await getBackend().rag.countChunksByOwner(scope, ownerId);
    } catch {
      return 0;
    }
  },
};
