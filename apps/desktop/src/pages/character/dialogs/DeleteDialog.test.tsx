import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { DeleteDialog } from "./DeleteDialog";
import type { Character } from "@neo-tavern/shared";

const t = vi.fn((key: string) => key);
const tc = vi.fn((key: string) => key);

const mockChar = { id: "c1", name: "Test" } as Character;

describe("DeleteDialog", () => {
  it("closes dialog when target is null", () => {
    render(<DeleteDialog target={null} onClose={vi.fn()} onDelete={vi.fn()} t={t} tc={tc} />);
    expect(screen.queryByText("delete.title")).not.toBeInTheDocument();
  });

  it("renders title when target has value", () => {
    render(<DeleteDialog target={mockChar} onClose={vi.fn()} onDelete={vi.fn()} t={t} tc={tc} />);
    expect(screen.getByText("delete.title")).toBeInTheDocument();
  });

  it("renders description with character name", () => {
    render(<DeleteDialog target={mockChar} onClose={vi.fn()} onDelete={vi.fn()} t={t} tc={tc} />);
    expect(screen.getByText("delete.description")).toBeInTheDocument();
    expect(t).toHaveBeenCalledWith("delete.description", { name: "Test" });
  });

  it("renders cancel button", () => {
    render(<DeleteDialog target={mockChar} onClose={vi.fn()} onDelete={vi.fn()} t={t} tc={tc} />);
    expect(screen.getByText("actions.cancel")).toBeInTheDocument();
  });

  it("renders delete button", () => {
    render(<DeleteDialog target={mockChar} onClose={vi.fn()} onDelete={vi.fn()} t={t} tc={tc} />);
    const deleteBtn = screen.getByText("actions.delete");
    expect(deleteBtn).toBeInTheDocument();
  });

  it("calls onClose when cancel clicked", () => {
    const onClose = vi.fn();
    render(<DeleteDialog target={mockChar} onClose={onClose} onDelete={vi.fn()} t={t} tc={tc} />);
    fireEvent.click(screen.getByText("actions.cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onDelete when delete clicked", () => {
    const onDelete = vi.fn();
    render(<DeleteDialog target={mockChar} onClose={vi.fn()} onDelete={onDelete} t={t} tc={tc} />);
    fireEvent.click(screen.getByText("actions.delete"));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
