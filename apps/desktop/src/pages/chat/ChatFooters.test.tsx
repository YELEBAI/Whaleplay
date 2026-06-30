import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AgenticGeneratingFooter, NormalChatFooter } from "./ChatFooters";
import { getGenerationStatus } from "./utils";

const noop = () => {};

describe("ChatFooters", () => {
  it("keeps agentic generation compact while preserving abort", () => {
    const onAbort = vi.fn();
    render(<AgenticGeneratingFooter generationStatus={getGenerationStatus("writing")} onAbort={onAbort} />);

    expect(screen.getByText("activity.thinking")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "stopTitle" }));
    expect(onAbort).toHaveBeenCalled();
  });

  it("keeps normal footer input available outside agentic generation", () => {
    render(
      <NormalChatFooter
        displayError={null}
        onDismissError={noop}
        pendingSendCount={0}
        hasChat
        pendingSendQueue={[]}
        currentChatId="chat-1"
        onCancelPending={noop}
        fontSize={15}
        onFontSizeChange={noop}
        previewOpen={false}
        onTogglePreview={noop}
        onContinue={noop}
        messagesLength={1}
        input=""
        onInputChange={noop}
        onKeyDown={noop}
        characterName="Luna"
        agenticPlayEnabled={false}
        onSend={noop}
        isSending={false}
        onAbort={noop}
        onSave={noop}
        onLoad={noop}
        isGenerating={false}
        previewText=""
      />,
    );

    expect(screen.getByPlaceholderText("inputPlaceholderWithChar")).toBeInTheDocument();
  });
});
