import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { PersonaPage } from "@/pages/PersonaPage";

describe("PersonaPage", () => {
  it("renders the sidebar", () => {
    render(<PersonaPage />);
    expect(screen.getAllByText("actions.back").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("sidebar.title").length).toBeGreaterThanOrEqual(1);
  });

  it("renders form elements", () => {
    render(<PersonaPage />);
    expect(screen.getAllByPlaceholderText("form.displayNamePlaceholder").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByPlaceholderText("form.descriptionPlaceholder").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("form.displayName").length).toBeGreaterThanOrEqual(1);
  });

  it("has a save button", () => {
    render(<PersonaPage />);
    expect(screen.getAllByRole("button", { name: /actions.save/i }).length).toBeGreaterThanOrEqual(1);
  });
});
