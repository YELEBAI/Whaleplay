import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@/test/utils";
import { GridOrList } from "./CharacterGridOrList";
import type { Character } from "@neo-tavern/shared";

function mockChar(id: string, name: string): Character {
  return {
    id,
    name,
    description: `${name} desc`,
    personality: "",
    scenario: "",
    firstMessage: "",
    exampleDialogues: "",
    avatar: undefined,
    createdAt: "",
    updatedAt: "",
  };
}

function defaultProps() {
  return {
    chars: [mockChar("1", "Alice"), mockChar("2", "Bob")],
    viewMode: "grid" as const,
    selectedId: null as string | null,
    onCharacterClick: vi.fn(),
    onCharacterDoubleClick: vi.fn(),
    onContextMenu: vi.fn(),
    onMenuButton: vi.fn(),
    t: vi.fn((k: string) => k),
  };
}

describe("CharacterGridOrList", () => {
  it("renders CharacterAvatarTile components in grid mode", () => {
    render(<GridOrList {...defaultProps()} />);

    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(1);
  });

  it("renders CharacterListItem components in list mode", () => {
    const props = { ...defaultProps(), viewMode: "list" as const };
    render(<GridOrList {...props} />);

    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Alice desc").length).toBeGreaterThanOrEqual(1);
  });

  it("renders an empty container when chars is empty", () => {
    const { container } = render(<GridOrList {...defaultProps()} chars={[]} />);

    expect(within(container).queryByText("Alice")).toBeNull();
    expect(container.firstChild).toBeInTheDocument();
  });

  it("calls onCharacterClick with the correct character when a card is clicked", () => {
    const props = defaultProps();
    const { container } = render(<GridOrList {...props} />);

    // The button's accessible name includes first-letter + name (e.g. "A Alice")
    const aliceBtn = within(container).getByRole("button", { name: /Alice/ });
    fireEvent.click(aliceBtn);
    expect(props.onCharacterClick).toHaveBeenCalledWith(props.chars[0]);
  });

  it("calls onCharacterDoubleClick when a card is double-clicked", () => {
    const props = { ...defaultProps(), viewMode: "list" as const };
    const { container } = render(<GridOrList {...props} />);

    const listItems = within(container).getAllByRole("button");
    fireEvent.doubleClick(listItems[0]);
    expect(props.onCharacterDoubleClick).toHaveBeenCalledWith(props.chars[0]);
  });

  it("calls onMenuButton when the menu button is clicked in grid mode", () => {
    const props = defaultProps();
    const { container } = render(<GridOrList {...props} />);

    const menuButtons = within(container).getAllByRole("button", { name: "characterMenu" });
    fireEvent.click(menuButtons[0]);
    expect(props.onMenuButton).toHaveBeenCalledTimes(1);
  });

  it("renders all characters when multiple are provided", () => {
    const chars = [mockChar("1", "Alice"), mockChar("2", "Bob"), mockChar("3", "Charlie")];
    render(<GridOrList {...defaultProps()} chars={chars} />);

    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Charlie").length).toBeGreaterThanOrEqual(1);
  });
});
