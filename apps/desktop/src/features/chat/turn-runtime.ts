import { generationTaskRunner, type GenerationTaskContext } from "@/app/generation-task-runner";
import { useChatStore } from "./chat.store";

export type ChatTurnContext = GenerationTaskContext;

type ChatTurnRunner<T> = (context: ChatTurnContext) => Promise<T>;

function chatTaskKey(chatId: string) {
  return `chat:${chatId}`;
}

/**
 * Desktop adapter for a long-running chat turn.
 *
 * It owns task exclusivity, abort wiring, and store lifecycle state. Prompt
 * building and generation should keep moving toward core strategies.
 *
 * A separate key per chat keeps one conversation from starting two concurrent
 * assistant runs, while still allowing future background work for other chats.
 */
export function startChatTurn<T>(chatId: string, runner: ChatTurnRunner<T>): Promise<T> {
  return generationTaskRunner.startExclusive(chatTaskKey(chatId), async (context) => {
    const store = useChatStore.getState();
    store.beginSending(chatId);
    store.setGenerationError(chatId, null);
    try {
      return await runner(context);
    } finally {
      if (context.isCurrent()) useChatStore.getState().finishSending(chatId);
    }
  });
}

// Abort is mirrored to the store immediately so the UI footer stops even before
// lower-level stream/provider cleanup finishes.
export function abortChatTurn(chatId: string) {
  generationTaskRunner.abort(chatTaskKey(chatId));
  useChatStore.getState().finishSending(chatId);
}
