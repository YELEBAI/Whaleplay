import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { CharFormDialog } from "./FormDialog";
import type { CreateCharacterInput } from "@neo-tavern/shared";

const t = vi.fn((key: string) => key);
const tc = vi.fn((key: string) => key);

const emptyForm: CreateCharacterInput = {
  name: "",
  description: "",
  personality: "",
  scenario: "",
  firstMessage: "",
  exampleDialogues: "",
};

describe("CharFormDialog", () => {
  it("does not render when open=false", () => {
    render(
      <CharFormDialog
        open={false}
        form={emptyForm}
        editingId={null}
        loading={false}
        onUpdateField={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        t={t}
        tc={tc}
      />,
    );
    expect(screen.queryByText("form.name")).not.toBeInTheDocument();
  });

  it("renders form fields when open=true", () => {
    render(
      <CharFormDialog
        open
        form={emptyForm}
        editingId={null}
        loading={false}
        onUpdateField={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        t={t}
        tc={tc}
      />,
    );
    expect(screen.getByText("form.name")).toBeInTheDocument();
    expect(screen.getByText("form.description")).toBeInTheDocument();
    expect(screen.getByText("form.personality")).toBeInTheDocument();
    expect(screen.getByText("form.scenario")).toBeInTheDocument();
    expect(screen.getByText("form.firstMessage")).toBeInTheDocument();
    expect(screen.getByText("form.exampleDialogues")).toBeInTheDocument();
  });

  it("renders edit title when editingId has value", () => {
    render(
      <CharFormDialog
        open
        form={emptyForm}
        editingId="c1"
        loading={false}
        onUpdateField={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        t={t}
        tc={tc}
      />,
    );
    expect(screen.getByText("dialog.editCharacter")).toBeInTheDocument();
  });

  it("renders new title when editingId is null", () => {
    render(
      <CharFormDialog
        open
        form={emptyForm}
        editingId={null}
        loading={false}
        onUpdateField={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        t={t}
        tc={tc}
      />,
    );
    expect(screen.getByText("dialog.newCharacter")).toBeInTheDocument();
  });

  it("calls onUpdateField when name is typed", () => {
    const onUpdateField = vi.fn();
    render(
      <CharFormDialog
        open
        form={emptyForm}
        editingId={null}
        loading={false}
        onUpdateField={onUpdateField}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        t={t}
        tc={tc}
      />,
    );
    const input = screen.getByLabelText("form.name");
    fireEvent.change(input, { target: { value: "Alice" } });
    expect(onUpdateField).toHaveBeenCalledWith("name", "Alice");
  });

  it("submit button is disabled when name is empty", () => {
    render(
      <CharFormDialog
        open
        form={emptyForm}
        editingId={null}
        loading={false}
        onUpdateField={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        t={t}
        tc={tc}
      />,
    );
    expect(screen.getByText("actions.create")).toBeDisabled();
  });

  it("submit button is enabled when name is non-empty", () => {
    const form = { ...emptyForm, name: "Alice" };
    render(
      <CharFormDialog
        open
        form={form}
        editingId={null}
        loading={false}
        onUpdateField={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        t={t}
        tc={tc}
      />,
    );
    expect(screen.getByText("actions.create")).not.toBeDisabled();
  });

  it("submit button is disabled when loading is true", () => {
    const form = { ...emptyForm, name: "Alice" };
    render(
      <CharFormDialog
        open
        form={form}
        editingId={null}
        loading
        onUpdateField={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        t={t}
        tc={tc}
      />,
    );
    expect(screen.getByText("actions.create")).toBeDisabled();
  });

  it("calls onCancel when cancel clicked", () => {
    const onCancel = vi.fn();
    render(
      <CharFormDialog
        open
        form={emptyForm}
        editingId={null}
        loading={false}
        onUpdateField={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={onCancel}
        t={t}
        tc={tc}
      />,
    );
    fireEvent.click(screen.getByText("actions.cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onSubmit when submit clicked", () => {
    const onSubmit = vi.fn();
    const form = { ...emptyForm, name: "Alice" };
    render(
      <CharFormDialog
        open
        form={form}
        editingId={null}
        loading={false}
        onUpdateField={vi.fn()}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        t={t}
        tc={tc}
      />,
    );
    fireEvent.click(screen.getByText("actions.create"));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
