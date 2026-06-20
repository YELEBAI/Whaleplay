import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { CharacterPage } from "@/pages/character";

describe("CharacterPage", () => {
  it("renders the title", () => {
    render(<CharacterPage />);
    expect(screen.getAllByText("title").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the import button", () => {
    render(<CharacterPage />);
    expect(screen.getAllByText("importCard").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the new character button", () => {
    render(<CharacterPage />);
    expect(screen.getAllByText("newCharacter").length).toBeGreaterThanOrEqual(1);
  });
});
