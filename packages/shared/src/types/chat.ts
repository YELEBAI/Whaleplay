export interface Chat {
  id: string;
  characterId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  // ── sync metadata (optional; populated when the entity enters the sync pipeline) ──
  revision?: string;
  deletedAt?: string | null;
}

export interface CreateChatInput {
  characterId: string;
  title: string;
}

export interface UpdateChatInput {
  title?: string;
}
