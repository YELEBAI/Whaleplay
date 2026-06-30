import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Character, Message } from "@neo-tavern/shared";
import { MessageList, type MessageListProps } from "./MessageList";
import { getGenerationStatus } from "./utils";
import type { MessageListActions, RenderedMessage } from "./types";

const now = "2026-06-28T12:00:00.000Z";

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: "msg-1",
    chatId: "chat-1",
    parentId: null,
    role: "assistant",
    content: "Hello",
    createdAt: now,
    ...overrides,
  };
}

function createCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Luna",
    description: "",
    personality: "",
    scenario: "",
    firstMessage: "Hello",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function renderItem(message: Message, overrides: Partial<RenderedMessage> = {}): RenderedMessage {
  const isUser = message.role === "user";
  return {
    msg: message,
    isUser,
    isFinalAi: !isUser,
    split: null,
    displayContent: message.content,
    agenticOptions: [],
    isStreamingAi: false,
    hasDisplayContent: message.content.trim().length > 0,
    ...overrides,
  };
}

function createActions(): MessageListActions {
  return {
    copy: vi.fn(),
    startEdit: vi.fn(),
    cancelEdit: vi.fn(),
    saveEdit: vi.fn().mockResolvedValue(undefined),
    showPromptDialog: vi.fn(),
    viewReasoning: vi.fn(),
    generateImages: vi.fn(),
    regenerate: vi.fn(),
    deleteMessage: vi.fn(),
    setInput: vi.fn(),
    deleteImage: vi.fn(),
    editImagePrompt: vi.fn(),
    regenerateImage: vi.fn(),
  };
}

function renderMessageList(overrides: Partial<MessageListProps> = {}) {
  const actions = createActions();
  const props: MessageListProps = {
    scroll: {
      containerRef: createRef<HTMLDivElement>(),
      bottomSentinelRef: createRef<HTMLDivElement>(),
      onScroll: vi.fn(),
    },
    state: {
      loading: false,
      visibleMessagesLength: 0,
      isGeneratingCurrentChat: false,
      hasStreamingMessage: false,
      copiedId: null,
      editingMsgId: null,
      canRegenerate: true,
    },
    layout: {
      fontSize: 15,
      chatContentWidthClass: "max-w-4xl",
      userBubbleWidthClass: "max-w-[80%]",
      firstMessageWidthClass: "max-w-[75%]",
    },
    image: {
      busyByMessageId: {},
      enabled: false,
      mode: "manual",
    },
    character: null,
    personaName: "User",
    renderedMessages: [],
    generationStatus: getGenerationStatus(null),
    actions,
    ...overrides,
  };

  render(<MessageList {...props} />);
  return { actions, props };
}

describe("MessageList rendering", () => {
  it("renders the selected character first message with user placeholder replacement", () => {
    const character = createCharacter({ firstMessage: "Hello {{user}}" });

    renderMessageList({ character, personaName: "Mira" });

    expect(screen.getByText("Luna")).toBeInTheDocument();
    expect(screen.getByText("Hello Mira")).toBeInTheDocument();
  });

  it("keeps user row actions limited to copy and delete", () => {
    const userMessage = createMessage({ id: "user-1", role: "user", content: "User says hi" });
    const { actions } = renderMessageList({
      state: {
        loading: false,
        visibleMessagesLength: 1,
        isGeneratingCurrentChat: false,
        hasStreamingMessage: false,
        copiedId: null,
        editingMsgId: null,
        canRegenerate: true,
      },
      renderedMessages: [renderItem(userMessage)],
    });

    expect(screen.getByText("User says hi")).toBeInTheDocument();
    expect(screen.queryByTitle("messageActions.edit")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("messageActions.copy"));
    fireEvent.click(screen.getByTitle("messageActions.delete"));

    expect(actions.copy).toHaveBeenCalledWith("User says hi", "user-1");
    expect(actions.deleteMessage).toHaveBeenCalledWith(userMessage);
  });

  it("renders assistant actions for reasoning, image generation, and regeneration", () => {
    const assistantMessage = createMessage({
      id: "ai-1",
      role: "assistant",
      content: "A scene worth painting",
      reasoningContent: "thinking",
    });
    const { actions } = renderMessageList({
      state: {
        loading: false,
        visibleMessagesLength: 1,
        isGeneratingCurrentChat: false,
        hasStreamingMessage: false,
        copiedId: null,
        editingMsgId: null,
        canRegenerate: true,
      },
      image: {
        busyByMessageId: {},
        enabled: true,
        mode: "manual",
      },
      character: createCharacter(),
      renderedMessages: [renderItem(assistantMessage, { isFinalAi: true })],
    });

    expect(screen.getByText("A scene worth painting")).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle("messageActions.viewReasoning")[0]);
    fireEvent.click(screen.getByTitle("messageActions.generateImage"));
    fireEvent.click(screen.getByTitle("messageActions.regenerate"));

    expect(actions.viewReasoning).toHaveBeenCalledWith(assistantMessage);
    expect(actions.generateImages).toHaveBeenCalledWith(assistantMessage);
    expect(actions.regenerate).toHaveBeenCalled();
  });
});
