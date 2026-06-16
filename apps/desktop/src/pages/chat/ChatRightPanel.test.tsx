import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatRightPanel } from "./ChatRightPanel";
import type { BranchSummary } from "./hooks/useBranchNavigation";

const baseProps = {
  messagesCount: 3,
  usageMessagesCount: 0,
  totalPrompt: 0,
  totalCompletion: 0,
  cacheRate: "0",
  contextUsageDisplay: "0 / 0",
  contextUsagePercent: 0,
  contextUsageBarTone: "bg-primary",
  onTokenDialogOpen: vi.fn(),
};

const branchSummaries: BranchSummary[] = [
  {
    leafId: "a1",
    isActive: true,
    messageCount: 2,
    forkMessageIndex: 1,
    lastMessagePreview: "Answer A",
    forkPreview: "Question",
  },
  {
    leafId: "b1",
    isActive: false,
    messageCount: 2,
    forkMessageIndex: 1,
    lastMessagePreview: "Answer B",
    forkPreview: "Question",
  },
];

afterEach(() => {
  cleanup();
});

describe("ChatRightPanel branches", () => {
  it("does not show the branch entry when there are no branches", () => {
    render(<ChatRightPanel {...baseProps} />);

    expect(screen.queryByText("rightPanel.overview.viewBranches")).not.toBeInTheDocument();
  });

  it("opens a compact branch panel from the messages card", () => {
    render(<ChatRightPanel {...baseProps} hasBranches branchSummaries={branchSummaries} />);

    fireEvent.click(screen.getByText("rightPanel.overview.viewBranches"));

    expect(screen.getByText("rightPanel.branches.title")).toBeInTheDocument();
    expect(screen.getByText("Answer A")).toBeInTheDocument();
    expect(screen.getByText("Answer B")).toBeInTheDocument();
    expect(screen.getAllByText("rightPanel.branches.forkAfterMessage")).toHaveLength(2);
    expect(screen.queryByText("rightPanel.overview.title")).not.toBeInTheDocument();
  });

  it("switches branches from a branch card", () => {
    const onSwitchBranch = vi.fn();
    render(
      <ChatRightPanel {...baseProps} hasBranches branchSummaries={branchSummaries} onSwitchBranch={onSwitchBranch} />,
    );

    fireEvent.click(screen.getByText("rightPanel.overview.viewBranches"));
    fireEvent.click(screen.getByText("Answer B"));

    expect(onSwitchBranch).toHaveBeenCalledWith("b1");
  });
});
