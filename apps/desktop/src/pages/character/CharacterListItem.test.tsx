import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@/test/utils";
import { CharacterListItem } from "./CharacterListItem";
import type { Character } from "@neo-tavern/shared";

function mockChar(overrides: Partial<Character> = {}): Character {
  return {
    id: "1",
    name: "Test Character",
    description: "A test description",
    personality: "",
    scenario: "",
    firstMessage: "",
    exampleDialogues: "",
    avatar: undefined,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function defaultProps() {
  return {
    character: mockChar(),
    selected: false,
    onClick: vi.fn(),
    onDoubleClick: vi.fn(),
    onContextMenu: vi.fn(),
  };
}

describe("CharacterListItem", () => {
  it("renders the character name", () => {
    render(<CharacterListItem {...defaultProps()} />);
    expect(screen.getAllByText("Test Character").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the character description", () => {
    render(<CharacterListItem {...defaultProps()} />);
    expect(screen.getAllByText("A test description").length).toBeGreaterThanOrEqual(1);
  });

  it("shows placeholder text when the character has no description", () => {
    const char = mockChar({ description: "" });
    const { container } = render(<CharacterListItem {...defaultProps()} character={char} />);
    expect(within(container).getByText("noDescription")).toBeInTheDocument();
  });

  it("applies the border-primary class when selected is true", () => {
    const { container } = render(<CharacterListItem {...defaultProps()} selected={true} />);

    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-primary/70");
  });

  it("does not apply the border-primary class when selected is false", () => {
    const { container } = render(<CharacterListItem {...defaultProps()} selected={false} />);

    const card = container.firstChild as HTMLElement;
    // border-primary/70 is only added for selected; hover:border-primary/45 has "border-primary" too
    expect(card.className).not.toContain("border-primary/70");
  });

  it("renders an img element when the character has an avatar", () => {
    const char = mockChar({ avatar: "https://example.com/avatar.png" });
    const { container } = render(<CharacterListItem {...defaultProps()} character={char} />);

    const img = within(container).getByRole("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
  });

  it("renders the first letter placeholder when the character has no avatar", () => {
    const char = mockChar({ avatar: undefined, name: "Zelda" });
    const { container } = render(<CharacterListItem {...defaultProps()} character={char} />);

    expect(within(container).getByText("Z")).toBeInTheDocument();
    expect(within(container).queryByRole("img")).toBeNull();
  });

  it("calls onClick when the item is clicked", () => {
    const props = defaultProps();
    const { container } = render(<CharacterListItem {...props} />);

    fireEvent.click(within(container).getByRole("button"));
    expect(props.onClick).toHaveBeenCalledTimes(1);
  });

  it("calls onDoubleClick when the item is double-clicked", () => {
    const props = defaultProps();
    const { container } = render(<CharacterListItem {...props} />);

    fireEvent.doubleClick(within(container).getByRole("button"));
    expect(props.onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it("calls onContextMenu with the event and character on right-click", () => {
    const props = defaultProps();
    const { container } = render(<CharacterListItem {...props} />);

    fireEvent.contextMenu(within(container).getByRole("button"));
    expect(props.onContextMenu).toHaveBeenCalledTimes(1);
    expect(props.onContextMenu).toHaveBeenCalledWith(expect.any(Object), props.character);
  });
});
