import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { PresetPage } from "@/pages/PresetPage";

describe("PresetPage", () => {
  it("renders the sidebar with back button", () => {
    render(<PresetPage />);
    expect(screen.getAllByText("back").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("title").length).toBeGreaterThanOrEqual(1);
  });

  it("renders new preset button", () => {
    render(<PresetPage />);
    expect(screen.getAllByText("newPreset").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the pre-seeded Agentic Play preset", () => {
    render(<PresetPage />);
    expect(screen.getAllByText("Agentic Play").length).toBeGreaterThanOrEqual(1);
  });
});
