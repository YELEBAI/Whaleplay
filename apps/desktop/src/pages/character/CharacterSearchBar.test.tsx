import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@/test/utils";
import { SearchBar } from "./CharacterSearchBar";

function defaultProps() {
  return {
    searchExpanded: false,
    searchQuery: "",
    viewMode: "grid" as const,
    onSearchToggle: vi.fn(),
    onSearchChange: vi.fn(),
    onViewModeChange: vi.fn(),
    t: vi.fn((k: string) => k),
  };
}

describe("CharacterSearchBar", () => {
  it("renders the search icon toggle button when not expanded", () => {
    const { container } = render(<SearchBar {...defaultProps()} />);

    const btns = within(container).getAllByRole("button");
    const toggleBtn = btns.find((b) => b.getAttribute("title") === "search.open");
    expect(toggleBtn).toBeDefined();
    expect(within(container).queryByPlaceholderText("search.placeholder")).toBeNull();
  });

  it("renders the search input when expanded", () => {
    const props = { ...defaultProps(), searchExpanded: true };
    const { container } = render(<SearchBar {...props} />);

    expect(within(container).getByPlaceholderText("search.placeholder")).toBeInTheDocument();
    expect(within(container).getByRole("button", { name: "search.close" })).toBeInTheDocument();
  });

  it('highlights the grid button when viewMode is "grid"', () => {
    const { container } = render(<SearchBar {...defaultProps()} />);

    const gridBtn = within(container).getByRole("button", { name: "view.grid" });
    expect(gridBtn.classList.contains("bg-accent")).toBe(true);

    const listBtn = within(container).getByRole("button", { name: "view.list" });
    expect(listBtn.classList.contains("bg-accent")).toBe(false);
  });

  it('highlights the list button when viewMode is "list"', () => {
    const props = { ...defaultProps(), viewMode: "list" as const };
    const { container } = render(<SearchBar {...props} />);

    const listBtn = within(container).getByRole("button", { name: "view.list" });
    expect(listBtn.classList.contains("bg-accent")).toBe(true);

    const gridBtn = within(container).getByRole("button", { name: "view.grid" });
    expect(gridBtn.classList.contains("bg-accent")).toBe(false);
  });

  it("calls onSearchToggle when the search icon button is clicked", () => {
    const props = defaultProps();
    const { container } = render(<SearchBar {...props} />);

    fireEvent.click(within(container).getByRole("button", { name: "search.open" }));
    expect(props.onSearchToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onViewModeChange with "grid" when the grid button is clicked', () => {
    const props = defaultProps();
    const { container } = render(<SearchBar {...props} />);

    fireEvent.click(within(container).getByRole("button", { name: "view.grid" }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("grid");
  });

  it('calls onViewModeChange with "list" when the list button is clicked', () => {
    const props = defaultProps();
    const { container } = render(<SearchBar {...props} />);

    fireEvent.click(within(container).getByRole("button", { name: "view.list" }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("list");
  });

  it("calls onSearchChange when typing in the search input", () => {
    const props = { ...defaultProps(), searchExpanded: true };
    const { container } = render(<SearchBar {...props} />);

    const input = within(container).getByPlaceholderText("search.placeholder");
    fireEvent.change(input, { target: { value: "test query" } });
    expect(props.onSearchChange).toHaveBeenCalledWith("test query");
  });

  it('calls onSearchChange with "" when the clear button is clicked', () => {
    const props = { ...defaultProps(), searchExpanded: true, searchQuery: "something" };
    const { container } = render(<SearchBar {...props} />);

    const allButtons = within(container).getAllByRole("button");
    const clearBtn = allButtons.find((b) => !b.getAttribute("title"));
    expect(clearBtn).toBeDefined();

    fireEvent.click(clearBtn!);
    expect(props.onSearchChange).toHaveBeenCalledWith("");
  });
});
