import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@/test/utils";
import { Title } from "./CharacterTitle";

function defaultProps() {
  return {
    onBack: vi.fn(),
    onNewCharacter: vi.fn(),
    onImport: vi.fn(),
    onFileChange: vi.fn(),
    importing: false,
    fileInputRef: { current: null },
    t: vi.fn((k: string) => k),
    tc: vi.fn((k: string) => k),
  };
}

describe("CharacterToolbar", () => {
  it("renders the title text", () => {
    // Follow existing pattern: DOM is not cleaned up between tests
    render(<Title {...defaultProps()} />);
    expect(screen.getAllByText("title").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the back button", () => {
    const { container } = render(<Title {...defaultProps()} />);
    expect(within(container).getByRole("button", { name: /actions\.back/i })).toBeInTheDocument();
  });

  it("renders the new character button", () => {
    const { container } = render(<Title {...defaultProps()} />);
    expect(within(container).getByRole("button", { name: /newCharacter/i })).toBeInTheDocument();
  });

  it("renders the import button", () => {
    const { container } = render(<Title {...defaultProps()} />);
    expect(within(container).getByRole("button", { name: /importCard/i })).toBeInTheDocument();
  });

  it("disables the import button when importing is true", () => {
    const props = { ...defaultProps(), importing: true };
    const { container } = render(<Title {...props} />);
    expect(within(container).getByRole("button", { name: /importCard/i })).toBeDisabled();
  });

  it("calls onNewCharacter when the new character button is clicked", () => {
    const props = defaultProps();
    const { container } = render(<Title {...props} />);

    fireEvent.click(within(container).getByRole("button", { name: /newCharacter/i }));
    expect(props.onNewCharacter).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when the back button is clicked", () => {
    const props = defaultProps();
    const { container } = render(<Title {...props} />);

    fireEvent.click(within(container).getByRole("button", { name: /actions\.back/i }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("contains a hidden file input", () => {
    const { container } = render(<Title {...defaultProps()} />);

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveClass("hidden");
  });
});
