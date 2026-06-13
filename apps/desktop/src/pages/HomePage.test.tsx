import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { HomePage } from "@/pages/HomePage";

describe("HomePage", () => {
  it("renders the title", () => {
    render(<HomePage />);
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    render(<HomePage />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows characters and recent chats headings", () => {
    render(<HomePage />);
    expect(screen.getAllByText("characters").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("recentChats").length).toBeGreaterThanOrEqual(1);
  });
});
