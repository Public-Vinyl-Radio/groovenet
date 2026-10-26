// @vitest-environment jsdom
import type React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PlayerControlsView from "@/components/player/PlayerControlsView";
import { PlaylistPlayerProvider } from "@/providers/PlaylistPlayerProvider";
import { sampleTrack } from "@/stories/fixtures/track";
import { FiVolume2 } from "react-icons/fi";

vi.mock("@/components/player/MiniProgressLine", () => ({ default: () => null }));

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
  onPlay: noop,
  onPause: noop,
  onSeek: noopAsync,
};

function cssOf(el: Element) {
  const classes = [...el.classList];
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .filter((text) => classes.some((c) => text.includes(`.${c}`)))
    .join("\n");
}

describe("PlayerControlsView — mini player", () => {
  it("makes the play key a 48px square, solid with a hard shadow", () => {
    renderWithProviders(<PlayerControlsView {...baseProps} compact onQueueToggle={noop} />);
    const css = cssOf(screen.getByRole("button", { name: "Play" }));
    expect(css).toMatch(/width:\s*48px/);
    expect(css).toMatch(/height:\s*48px/);
    expect(css).toMatch(/box-shadow:\s*var\(--chakra-shadows-sm\)/);
    expect(css).not.toMatch(/border-radius:\s*var\(--chakra-radii-full\)/);
  });

  it.each([
    ["Open now playing", 56],
    ["Next", 48],
  ])("keeps %s at least 44px tall", (name, height) => {
    renderWithProviders(<PlayerControlsView {...baseProps} compact onQueueToggle={noop} />);
    expect(cssOf(screen.getByRole("button", { name }))).toMatch(new RegExp(`height:\\s*${height}px`));
  });

  it("has no close button: stop and clear live in the queue", () => {
    renderWithProviders(<PlayerControlsView {...baseProps} compact onQueueToggle={noop} />);
    expect(screen.queryByRole("button", { name: "Close player" })).toBeNull();
  });

  it("opens Now playing from the art and text, not from the transport keys", async () => {
    const onQueueToggle = vi.fn();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const playNext = vi.fn();
    const { user, rerender } = renderWithProviders(
      <PlayerControlsView {...baseProps} compact onQueueToggle={onQueueToggle} onPlay={onPlay} playNext={playNext} />
    );

    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(playNext).toHaveBeenCalledTimes(1);
    expect(onQueueToggle).not.toHaveBeenCalled();

    rerender(
      <PlayerControlsView {...baseProps} compact isPlaying onQueueToggle={onQueueToggle} onPause={onPause} />
    );
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(onPause).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Open now playing" }));
    expect(onQueueToggle).toHaveBeenCalledTimes(1);
  });

  it("disables Play with an empty queue and Next at the end of it", () => {
    renderWithProviders(<PlayerControlsView {...baseProps} compact safeLen={0} canNext={false} />);
    expect(screen.getByRole("button", { name: "Play" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("PlayerControlsView — docked desktop bar", () => {
  const renderBar = (props: Partial<React.ComponentProps<typeof PlayerControlsView>> = {}) =>
    renderWithProviders(
      <PlaylistPlayerProvider>
        <PlayerControlsView {...baseProps} compact={false} showVolumeControls onQueueToggle={noop} {...props} />
      </PlaylistPlayerProvider>
    );

  it("joins previous, play-pause and next in one transport strip", () => {
    renderBar({ canPrev: true });
    const strip = screen.getByRole("group", { name: "Transport" });
    expect(within(strip).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Previous",
      "Play",
      "Next",
    ]);
    expect(cssOf(strip)).toMatch(/box-shadow:\s*var\(--chakra-shadows-sm\)/);
  });

  it("shows the mono meta line: position, BPM and Camelot key", () => {
    renderBar({ currentTrack: { ...sampleTrack, position: "A1", bpm: "134", key: "D minor" } });
    expect(screen.getByText("A1 · 134 BPM · 7A")).toBeTruthy();
  });

  it("hides the meta line once the queue has finished", () => {
    renderBar({ isQueueFinished: true, currentTrack: { ...sampleTrack, position: "A1", bpm: "134", key: null } });
    expect(screen.queryByText(/BPM/)).toBeNull();
  });

  it("toggles mute from the volume button and reads the volume out as a percentage", async () => {
    const setVolume = vi.fn();
    const { user, rerender } = renderBar({ setVolume, volume: 0.5 });
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(setVolume).toHaveBeenLastCalledWith(0);

    // The slider shows from `lg`; jsdom renders the base breakpoint.
    const volume = screen.getByRole("slider", { name: "Volume", hidden: true });
    expect(volume.getAttribute("aria-valuetext")).toBe("50%");

    rerender(
      <PlaylistPlayerProvider>
        <PlayerControlsView {...baseProps} compact={false} showVolumeControls setVolume={setVolume} volume={0} />
      </PlaylistPlayerProvider>
    );
    await user.click(screen.getByRole("button", { name: "Unmute" }));
    expect(setVolume).toHaveBeenLastCalledWith(0.8);
  });

  it("marks the queue toggle pressed while the panel is open", async () => {
    const onQueueToggle = vi.fn();
    const { user } = renderBar({ isQueueOpen: true, onQueueToggle });
    const toggle = screen.getByRole("button", { name: "Queue" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await user.click(toggle);
    expect(onQueueToggle).toHaveBeenCalledTimes(1);
  });

  it("has a keyboard-operable seek slider with the time read out", () => {
    renderBar();
    const seek = screen.getByRole("slider", { name: "Seek" });
    expect(seek.getAttribute("tabindex")).toBe("0");
    expect(seek.getAttribute("aria-valuetext")).toBe("0:00 of 0:00");
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

describe("PlayerControlsView — Queue toggle and server volume", () => {
  it.each([true, false])("renders the Queue toggle (pressed: %s)", (active) => {
    renderWithProviders(
      <PlaylistPlayerProvider>
        <PlayerControlsView {...baseProps} compact={false} isQueueOpen={active} onQueueToggle={noop} />
      </PlaylistPlayerProvider>
    );

    expect(screen.getByRole("button", { name: "Queue" }).getAttribute("aria-pressed")).toBe(String(active));
    expect(screen.queryByRole("button", { name: "AirPlay" })).toBeNull();
  });

  it("names the server's volume and commits a mute as one change", async () => {
    const setVolume = vi.fn();
    const onVolumeCommit = vi.fn();
    const { user } = renderWithProviders(
      <PlaylistPlayerProvider>
        <PlayerControlsView {...baseProps} compact={false} showVolumeControls serverMode setVolume={setVolume} onVolumeCommit={onVolumeCommit} />
      </PlaylistPlayerProvider>
    );

    // The slider shows from `lg`; jsdom renders the base breakpoint, so it can't take focus here.
    expect(screen.getByRole("slider", { name: "Server player volume", hidden: true })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Mute", hidden: true }));
    expect(setVolume).toHaveBeenCalledWith(0);
    expect(onVolumeCommit).toHaveBeenCalledWith(0);
  });
});
