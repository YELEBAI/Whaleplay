import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@/test/utils";
import { PresetPage } from "@/pages/PresetPage";
import { usePresetStore } from "@/features/preset/preset.store";
import { AGENTIC_PLAY_PRESET_ID, AGENTIC_PLAY_PRESET_NAME } from "@/features/agentic-play/agentic-preset";

describe("PresetPage", () => {
  afterEach(() => cleanup());

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
    const previousPresetState = usePresetStore.getState();
    try {
      usePresetStore.setState({
        presets: [
          {
            id: AGENTIC_PLAY_PRESET_ID,
            name: AGENTIC_PLAY_PRESET_NAME,
            description: "",
            items: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        activePreset: null,
        activePresetId: null,
        loading: false,
        error: null,
      });

      render(<PresetPage />);
      expect(screen.getAllByText(AGENTIC_PLAY_PRESET_NAME).length).toBeGreaterThanOrEqual(1);
    } finally {
      usePresetStore.setState(previousPresetState, true);
    }
  });
});
