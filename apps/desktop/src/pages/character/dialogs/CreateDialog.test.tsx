import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { CreateDialog } from "./CreateDialog";

const t = vi.fn((key: string) => key);
const tc = vi.fn((key: string) => key);

describe("CreateDialog", () => {
  it("does not render content when open=false", () => {
    render(
      <CreateDialog open={false} onOpenChange={vi.fn()} onTraditional={vi.fn()} onBuilder={vi.fn()} t={t} tc={tc} />,
    );
    expect(screen.queryByText("create.title")).not.toBeInTheDocument();
  });

  it("renders title when open=true", () => {
    render(<CreateDialog open onOpenChange={vi.fn()} onTraditional={vi.fn()} onBuilder={vi.fn()} t={t} tc={tc} />);
    expect(screen.getByText("create.title")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<CreateDialog open onOpenChange={vi.fn()} onTraditional={vi.fn()} onBuilder={vi.fn()} t={t} tc={tc} />);
    expect(screen.getByText("create.description")).toBeInTheDocument();
  });

  it("renders traditional button", () => {
    render(<CreateDialog open onOpenChange={vi.fn()} onTraditional={vi.fn()} onBuilder={vi.fn()} t={t} tc={tc} />);
    expect(screen.getByText("create.traditional")).toBeInTheDocument();
  });

  it("renders whale builder button", () => {
    render(<CreateDialog open onOpenChange={vi.fn()} onTraditional={vi.fn()} onBuilder={vi.fn()} t={t} tc={tc} />);
    expect(screen.getByText("create.builder")).toBeInTheDocument();
  });

  it("calls onTraditional when traditional button clicked", () => {
    const onTraditional = vi.fn();
    render(
      <CreateDialog open onOpenChange={vi.fn()} onTraditional={onTraditional} onBuilder={vi.fn()} t={t} tc={tc} />,
    );
    fireEvent.click(screen.getByText("create.traditional"));
    expect(onTraditional).toHaveBeenCalledOnce();
  });

  it("calls onBuilder when builder button clicked", () => {
    const onBuilder = vi.fn();
    render(<CreateDialog open onOpenChange={vi.fn()} onTraditional={vi.fn()} onBuilder={onBuilder} t={t} tc={tc} />);
    fireEvent.click(screen.getByText("create.builder"));
    expect(onBuilder).toHaveBeenCalledOnce();
  });

  it("calls onOpenChange(false) when cancel clicked", () => {
    const onOpenChange = vi.fn();
    render(<CreateDialog open onOpenChange={onOpenChange} onTraditional={vi.fn()} onBuilder={vi.fn()} t={t} tc={tc} />);
    fireEvent.click(screen.getByText("actions.cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders cancel button", () => {
    render(<CreateDialog open onOpenChange={vi.fn()} onTraditional={vi.fn()} onBuilder={vi.fn()} t={t} tc={tc} />);
    expect(screen.getByText("actions.cancel")).toBeInTheDocument();
  });
});
