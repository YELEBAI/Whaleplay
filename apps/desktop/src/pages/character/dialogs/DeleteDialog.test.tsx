import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { DeleteDialog } from "./DeleteDialog";
import type { Character } from "@neo-tavern/shared";

const mockChar = { id: "c1", name: "Test" } as Character;

describe("DeleteDialog", () => {
  it("closes dialog when target is null", () => {
    render(<DeleteDialog target={null} onClose={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText("delete.title")).not.toBeInTheDocument();
  });

  it("renders title when target has value", () => {
    render(<DeleteDialog target={mockChar} onClose={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("delete.title")).toBeInTheDocument();
  });

  it("renders description with character name", () => {
    render(<DeleteDialog target={mockChar} onClose={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("delete.description")).toBeInTheDocument();
  });

  it("renders cancel button", () => {
    render(<DeleteDialog target={mockChar} onClose={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("actions.cancel")).toBeInTheDocument();
  });

  it("renders delete button", () => {
    render(<DeleteDialog target={mockChar} onClose={vi.fn()} onDelete={vi.fn()} />);
    const deleteBtn = screen.getByText("actions.delete");
    expect(deleteBtn).toBeInTheDocument();
  });

  it("calls onClose when cancel clicked", () => {
    const onClose = vi.fn();
    render(<DeleteDialog target={mockChar} onClose={onClose} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByText("actions.cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onDelete when delete clicked", () => {
    const onDelete = vi.fn();
    render(<DeleteDialog target={mockChar} onClose={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByText("actions.delete"));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
