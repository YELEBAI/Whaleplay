import { getBackend } from "@/platform";
import type { RagChunkRecord, RagChunkScope } from "@/features/rag/rag-settings";

function asRagChunkRecord(value: unknown): RagChunkRecord {
  if (!value || typeof value !== "object") throw new Error("Stored RAG chunk is not an object");
  const chunk = value as Partial<RagChunkRecord>;
  if (!chunk.id || !chunk.scope || !chunk.ownerId || !chunk.sourceId || !chunk.embeddingModel) {
    throw new Error("Stored RAG chunk is missing required identity fields");
  }
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
    return getBackend().rag.upsertChunks(chunks);
  },

  async listByOwners(ownerIds: string[], embeddingModel?: string | null): Promise<RagChunkRecord[]> {
    const uniqueOwnerIds = Array.from(new Set(ownerIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueOwnerIds.length === 0) return [];
    const rows = await getBackend().rag.listChunksByOwners(uniqueOwnerIds, embeddingModel || null);
    return rows.map(asRagChunkRecord);
  },

  async deleteBySourceIds(sourceIds: string[]) {
    const uniqueSourceIds = Array.from(new Set(sourceIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueSourceIds.length === 0) return 0;
    return getBackend().rag.deleteChunksBySourceIds(uniqueSourceIds);
  },

  async deleteByOwner(scope: RagChunkScope, ownerId: string) {
    return getBackend().rag.deleteChunksByOwner(scope, ownerId);
  },

  async countByOwner(scope: RagChunkScope, ownerId: string) {
    return getBackend().rag.countChunksByOwner(scope, ownerId);
  },
};
