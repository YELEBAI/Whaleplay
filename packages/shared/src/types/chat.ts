export interface Chat {
  id: string;
  characterId: string;
  title: string;
  worldbookReferenceEntryIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateChatInput {
  characterId: string;
  title: string;
  worldbookReferenceEntryIds?: string[];
}

export interface UpdateChatInput {
  title?: string;
  worldbookReferenceEntryIds?: string[];
}
