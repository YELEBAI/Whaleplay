import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";
import { HomePage } from "@/pages/HomePage";
import { useCharacterStore } from "@/features/character/character.store";

describe("HomePage", () => {
  afterEach(() => cleanup());

  it("renders the title", () => {
    render(<HomePage />);
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    render(<HomePage />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows characters and recent chats headings", () => {
    render(<HomePage />);
    expect(screen.getAllByText("characters").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("recentChats").length).toBeGreaterThanOrEqual(1);
  });

  it("does not show character loading text while cached characters are visible", () => {
    const previousCharacterState = useCharacterStore.getState();
    try {
      useCharacterStore.setState({
        loading: true,
        characters: [
          {
            id: "char-1",
            name: "Cached Character",
            description: "",
            personality: "",
            scenario: "",
            firstMessage: "",
            exampleDialogues: "",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      });

      render(<HomePage />);
      const characterScroller = screen.getByText("characters").parentElement?.nextElementSibling as HTMLElement;

      expect(within(characterScroller).getByText("Cached Character")).toBeInTheDocument();
      expect(within(characterScroller).queryByText("loading")).not.toBeInTheDocument();
    } finally {
      useCharacterStore.setState(previousCharacterState, true);
    }
  });
});
