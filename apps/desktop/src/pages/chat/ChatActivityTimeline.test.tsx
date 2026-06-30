import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Message } from "@neo-tavern/shared";
import { ChatActivityTimeline } from "./ChatActivityTimeline";
import { getGenerationStatus } from "./utils";

const now = "2026-06-28T12:00:00.000Z";

function createAssistant(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    chatId: "chat-1",
    parentId: null,
    role: "assistant",
    content: "Reply",
    createdAt: now,
    ...overrides,
  };
}

describe("ChatActivityTimeline", () => {
  it("does not render completed thinking chrome when there is no reasoning content", () => {
    render(
      <ChatActivityTimeline message={createAssistant()} active={false} generationStatus={getGenerationStatus(null)} />,
    );

    expect(screen.queryByLabelText("activity.thinkingComplete")).not.toBeInTheDocument();
  });

  it("renders active generation status even before reasoning content arrives", () => {
    render(
      <ChatActivityTimeline message={createAssistant()} active generationStatus={getGenerationStatus("writing")} />,
    );

    expect(screen.getByLabelText("activity.thinking")).toBeInTheDocument();
    expect(screen.getByText(/generationStatus\.writingDetail/)).toBeInTheDocument();
  });

  it("toggles completed reasoning content when present", () => {
    render(
      <ChatActivityTimeline
        message={createAssistant({ reasoningContent: "first\nfinal thought" })}
        active={false}
        generationStatus={getGenerationStatus(null)}
      />,
    );

    expect(screen.getByLabelText("activity.thinkingComplete")).toBeInTheDocument();
    expect(screen.getByText(/final thought/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("activity.thinkingComplete"));

    expect(screen.getByText((_, element) => element?.textContent === "first\nfinal thought")).toBeInTheDocument();
  });
});
