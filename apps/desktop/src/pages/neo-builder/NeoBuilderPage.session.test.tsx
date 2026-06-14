import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { NeoBuilderPage } from "@/pages/neo-builder";

vi.mock("@/components", () => ({
  useVirtualList: vi.fn(() => ({
    virtualizer: { getVirtualItems: () => [], getTotalSize: () => 0 },
    containerRef: { current: null },
    isNearBottomRef: { current: true },
    handleScroll: vi.fn(),
    scrollToIndex: vi.fn(),
    remeasure: vi.fn(),
  })),
  VirtualList: ({ renderItem }: { renderItem: (index: number) => React.ReactNode }) => (
    <div data-testid="virtual-list">{renderItem(0)}</div>
  ),
}));

vi.mock("@/features/character/character.store", () => ({
  useCharacterStore: vi.fn(() => ({
    loadCharacters: vi.fn().mockResolvedValue(undefined),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
  })),
}));

vi.mock("@/features/billing/usage-cost", () => ({
  recordUsageCostAndWarn: vi.fn(),
}));

describe("NeoBuilderPage with real builder session store", () => {
  it("renders without triggering the builder session snapshot render loop", () => {
    localStorage.clear();

    render(<NeoBuilderPage />);

    expect(screen.getByText("title")).toBeInTheDocument();
  });
});
