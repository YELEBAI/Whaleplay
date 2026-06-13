import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { CharacterPage } from "@/pages/CharacterPage";

describe("CharacterPage", () => {
  it("renders the title", () => {
    render(<CharacterPage />);
    expect(screen.getAllByText("title").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Whale Builder button", () => {
    render(<CharacterPage />);
    expect(screen.getAllByText("Whale Builder").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the new character button", () => {
    render(<CharacterPage />);
    expect(screen.getAllByText("newCharacter").length).toBeGreaterThanOrEqual(1);
  });
});
