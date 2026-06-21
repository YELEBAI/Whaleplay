import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { CreateModeDialog } from "./CreateModeDialog";
import type { Character } from "@neo-tavern/shared";

const mockChar = { id: "c1", name: "Test" } as Character;

describe("CreateModeDialog", () => {
  it("closes dialog when target is null", () => {
    render(<CreateModeDialog target={null} creatingMode={null} onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText("modeDialog.title")).not.toBeInTheDocument();
  });

  it("renders title when target has value", () => {
    render(<CreateModeDialog target={mockChar} creatingMode={null} onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("modeDialog.title")).toBeInTheDocument();
  });

  it("renders description with character name", () => {
    render(<CreateModeDialog target={mockChar} creatingMode={null} onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("modeDialog.description")).toBeInTheDocument();
  });

  it("renders normal mode button", () => {
    render(<CreateModeDialog target={mockChar} creatingMode={null} onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("modeDialog.normal.label")).toBeInTheDocument();
  });

  it("renders agentic mode button", () => {
    render(<CreateModeDialog target={mockChar} creatingMode={null} onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("modeDialog.agentic.label")).toBeInTheDocument();
  });

  it("buttons are enabled when creatingMode is null", () => {
    render(<CreateModeDialog target={mockChar} creatingMode={null} onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /modeDialog.normal.label/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /modeDialog.agentic.label/ })).not.toBeDisabled();
  });

  it("buttons are disabled when creatingMode is not null", () => {
    render(<CreateModeDialog target={mockChar} creatingMode="normal" onSelectMode={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /modeDialog.normal.label/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /modeDialog.agentic.label/ })).toBeDisabled();
  });

  it("calls onSelectMode('normal') when normal button clicked", () => {
    const onSelectMode = vi.fn();
    render(<CreateModeDialog target={mockChar} creatingMode={null} onSelectMode={onSelectMode} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /modeDialog.normal.label/ }));
    expect(onSelectMode).toHaveBeenCalledWith("normal");
  });

  it("calls onSelectMode('agentic') when agentic button clicked", () => {
    const onSelectMode = vi.fn();
    render(<CreateModeDialog target={mockChar} creatingMode={null} onSelectMode={onSelectMode} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /modeDialog.agentic.label/ }));
    expect(onSelectMode).toHaveBeenCalledWith("agentic");
  });

  it("calls onCancel when cancel clicked", () => {
    const onCancel = vi.fn();
    render(<CreateModeDialog target={mockChar} creatingMode={null} onSelectMode={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("actions.cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
