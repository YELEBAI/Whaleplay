export interface Chat {
  id: string;
  characterId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChatInput {
  characterId: string;
  title: string;
}

export interface UpdateChatInput {
  title?: string;
}
