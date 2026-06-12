import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { AboutPage } from "@/pages/AboutPage";

describe("AboutPage", () => {
  it("renders the app name", () => {
    render(<AboutPage />);
    expect(screen.getByText("Whale Play")).toBeInTheDocument();
  });

  it("renders the logo image", () => {
    render(<AboutPage />);
    const imgs = screen.getAllByAltText("Whale Play");
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    expect(imgs[0]).toHaveAttribute("src", "/icons/128x128.png");
  });

  it("renders navigation links", () => {
    render(<AboutPage />);
    // i18n mock returns keys as text; link text appears in both <a> and SVG path
    expect(screen.getAllByText("repository").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("feedback").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("license").length).toBeGreaterThanOrEqual(1);
  });

  it("has GitHub link with correct href", () => {
    render(<AboutPage />);
    const links = screen.getAllByRole("link", { name: /repository/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "https://github.com/YELEBAI/Whaleplay");
  });
});
