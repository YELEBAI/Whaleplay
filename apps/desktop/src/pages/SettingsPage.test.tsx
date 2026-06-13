import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { SettingsPage } from "@/pages/settings";

describe("SettingsPage", () => {
  it("renders settings sections in sidebar", () => {
    render(<SettingsPage />);
    expect(screen.getAllByText("sections.api").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("sections.appearance").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the back button", () => {
    render(<SettingsPage />);
    expect(screen.getAllByText("back").length).toBeGreaterThanOrEqual(1);
  });
});
