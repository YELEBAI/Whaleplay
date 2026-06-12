import { type ReactElement } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router";

/**
 * Renders a component wrapped in MemoryRouter (required by react-router).
 * Pass `initialEntries` to set the initial URL.
 */
export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ["/"], ...options }: RenderOptions & { initialEntries?: string[] } = {},
): RenderResult {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>, options);
}

/**
 * Re-export everything from @testing-library/react for convenience.
 */
export * from "@testing-library/react";
export { renderWithRouter as render };
