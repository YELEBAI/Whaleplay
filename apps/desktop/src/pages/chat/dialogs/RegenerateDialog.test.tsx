import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RegenerateDialog } from "./RegenerateDialog";

describe("RegenerateDialog", () => {
  it("only offers replace regeneration", () => {
    const onConfirm = vi.fn();
    render(<RegenerateDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByText("regenerateDialog.description")).toBeInTheDocument();
    expect(screen.queryByText("regenerateDialog.fork.label")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);

    fireEvent.click(screen.getByText("regenerateDialog.replaceRegenerate"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
