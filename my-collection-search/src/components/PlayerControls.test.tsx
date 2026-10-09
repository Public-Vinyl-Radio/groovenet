// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { sampleTrack } from "@/stories/fixtures/track";

const handleDismissPlayer = vi.fn();
const controller = {
  isPlaying: false,
  currentTrack: sampleTrack,
  isQueueFinished: false,
  volume: 1,
  setVolume: vi.fn(),
  isAirPlayAvailable: false,
  isAirPlayActive: false,
  playNext: vi.fn(),
  playPrev: vi.fn(),
  safeLen: 1,
  canPrev: false,
  canNext: false,
  VolumeIcon: () => null,
  handlePlay: vi.fn(),
  handlePause: vi.fn(),
  handleSeek: vi.fn(),
  handleAirPlayClick: vi.fn(),
  handleClosePlayer: vi.fn(),
  handleDismissPlayer,
};

vi.mock("@/components/player/usePlayerControlsController", () => ({
  usePlayerControlsController: () => controller,
}));

import PlayerControls from "./PlayerControls";

describe("PlayerControls", () => {
  it("wires the controller's handleDismissPlayer into the compact close button", async () => {
    const { user } = renderWithProviders(<PlayerControls compact />);

    await user.click(screen.getByRole("button", { name: "Close player" }));

    expect(handleDismissPlayer).toHaveBeenCalledTimes(1);
  });

  it("passes isQueueFinished through to the finished-state label", () => {
    controller.isQueueFinished = true;
    renderWithProviders(<PlayerControls compact />);

    expect(screen.getByText("Queue finished")).toBeTruthy();
    controller.isQueueFinished = false;
  });
});
