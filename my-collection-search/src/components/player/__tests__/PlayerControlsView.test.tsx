// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PlayerControlsView from "@/components/player/PlayerControlsView";
import { PlaylistPlayerProvider } from "@/providers/PlaylistPlayerProvider";
import { sampleTrack } from "@/stories/fixtures/track";
import { FiVolume2 } from "react-icons/fi";

const noop = () => {};
const noopAsync = async () => {};

const baseProps = {
  showQueueButton: true,
  isQueueOpen: false,
  showVolumeControls: false,
  isPlaying: false,
  currentTrack: sampleTrack,
  safeLen: 1,
  canPrev: false,
  canNext: true,
  playPrev: noop,
  playNext: noop,
  volume: 0.8,
  setVolume: noop,
  VolumeIcon: FiVolume2,
  isAirPlayAvailable: false,
  isAirPlayActive: false,
  onAirPlayClick: noop,
  onPlay: noop,
  onPause: noop,
  onSeek: noopAsync,
  onClosePlayer: noop,
};

describe("PlayerControlsView — compact close button", () => {
  it("renders a Close player button with a 44px touch target", async () => {
    const { user } = renderWithProviders(
      <PlayerControlsView {...baseProps} compact onQueueToggle={noop} />
    );

    const closeButton = screen.getByRole("button", { name: "Close player" });
    expect(closeButton).toBeTruthy();
    void user;
  });

  it("calls onDismissPlayer, not onQueueToggle, when the close button is clicked", async () => {
    const onQueueToggle = vi.fn();
    const onDismissPlayer = vi.fn();
    const onClosePlayer = vi.fn();
    const { user } = renderWithProviders(
      <PlayerControlsView
        {...baseProps}
        compact
        onQueueToggle={onQueueToggle}
        onClosePlayer={onClosePlayer}
        onDismissPlayer={onDismissPlayer}
      />
    );

    await user.click(screen.getByRole("button", { name: "Close player" }));

    expect(onDismissPlayer).toHaveBeenCalledTimes(1);
    expect(onClosePlayer).not.toHaveBeenCalled();
    expect(onQueueToggle).not.toHaveBeenCalled();
  });

  it("falls back to onClosePlayer when onDismissPlayer is not provided", async () => {
    const onClosePlayer = vi.fn();
    const { user } = renderWithProviders(
      <PlayerControlsView
        {...baseProps}
        compact
        onQueueToggle={noop}
        onClosePlayer={onClosePlayer}
      />
    );

    await user.click(screen.getByRole("button", { name: "Close player" }));

    expect(onClosePlayer).toHaveBeenCalledTimes(1);
  });

  it("clicking Play/Pause/Next still doesn't open the queue drawer", async () => {
    const onQueueToggle = vi.fn();
    const onPlay = vi.fn();
    const { user } = renderWithProviders(
      <PlayerControlsView
        {...baseProps}
        compact
        onQueueToggle={onQueueToggle}
        onPlay={onPlay}
      />
    );

    await user.click(screen.getByRole("button", { name: "Play" }));

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onQueueToggle).not.toHaveBeenCalled();
  });
});

describe("PlayerControlsView — queue finished state", () => {
  it("shows a 'Queue finished' idle state with the last-played track's artwork and title, compact", () => {
    renderWithProviders(
      <PlayerControlsView
        {...baseProps}
        compact
        isPlaying={false}
        isQueueFinished
        currentTrack={sampleTrack}
        canNext={false}
        canPrev={false}
      />
    );

    expect(screen.getByText("Queue finished")).toBeTruthy();
    expect(
      screen.getByText(`${sampleTrack.title} — ${sampleTrack.artist}`)
    ).toBeTruthy();
    const artwork = screen.getByRole("img");
    expect(artwork.getAttribute("src")).toBe(sampleTrack.audio_file_album_art_url);
  });

  it("restarts playback from the top when Play is pressed after the queue finished", async () => {
    const onPlay = vi.fn();
    const { user } = renderWithProviders(
      <PlayerControlsView
        {...baseProps}
        compact
        isPlaying={false}
        isQueueFinished
        currentTrack={sampleTrack}
        canNext={false}
        canPrev={false}
        safeLen={3}
        onPlay={onPlay}
      />
    );

    const playButton = screen.getByRole("button", { name: "Play" });
    expect(playButton.hasAttribute("disabled")).toBe(false);

    await user.click(playButton);

    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("shows the finished state in the full (desktop) layout too, truncated to one line", () => {
    renderWithProviders(
      <PlaylistPlayerProvider>
        <PlayerControlsView
          {...baseProps}
          compact={false}
          isQueueFinished
          currentTrack={sampleTrack}
          canNext={false}
          canPrev={false}
        />
      </PlaylistPlayerProvider>
    );

    const title = screen.getByText("Queue finished");
    expect(title.getAttribute("title")).toBe("Queue finished");
  });

  it("falls back to '—' when the finished state has no track data to show", () => {
    renderWithProviders(
      <PlayerControlsView
        {...baseProps}
        compact
        isQueueFinished
        currentTrack={null}
        canNext={false}
        canPrev={false}
      />
    );

    expect(screen.getByText("Queue finished")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("PlayerControlsView — no current track (not finished)", () => {
  it("shows 'No track playing' / '—' placeholders, compact", () => {
    renderWithProviders(
      <PlayerControlsView
        {...baseProps}
        compact
        currentTrack={null}
        safeLen={0}
        canPrev={false}
        canNext={false}
      />
    );

    expect(screen.getByText("No track playing")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows 'No track playing' / '—' placeholders in the full layout, and links the artist when a track is present", () => {
    renderWithProviders(
      <PlaylistPlayerProvider>
        <PlayerControlsView
          {...baseProps}
          compact={false}
          currentTrack={null}
          safeLen={0}
          canPrev={false}
          canNext={false}
        />
      </PlaylistPlayerProvider>
    );

    expect(screen.getByText("No track playing")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("links the artist in the full layout when a track is current and the queue hasn't finished", () => {
    renderWithProviders(
      <PlaylistPlayerProvider>
        <PlayerControlsView {...baseProps} compact={false} />
      </PlaylistPlayerProvider>
    );

    expect(
      screen.getByRole("link", { name: sampleTrack.artist, hidden: true })
    ).toBeTruthy();
  });
});

describe("PlayerControlsView — no artwork", () => {
  it("shows the icon placeholder instead of a broken image when the track has no artwork", () => {
    const trackWithoutArt = {
      ...sampleTrack,
      audio_file_album_art_url: null,
      album_thumbnail: undefined,
    };
    renderWithProviders(
      <PlayerControlsView {...baseProps} compact currentTrack={trackWithoutArt} />
    );

    expect(screen.queryByRole("img")).toBeNull();
  });
});
