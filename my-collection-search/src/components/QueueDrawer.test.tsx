// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const track = (n: number) =>
  ({
    track_id: `t${n}`,
    friend_id: 1,
    title: `Title ${n}`,
    artist: `Artist ${n}`,
    duration_seconds: 60,
    position: "A1",
    bpm: "120",
    key: "8A",
  }) as unknown as Track;

const player = vi.hoisted(() => ({
  playlist: [] as Track[],
  currentTrack: null as Track | null,
  currentTrackIndex: 0 as number | null,
  moveTrackInQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  playTrack: vi.fn(),
  volume: 0.5,
  setVolume: vi.fn(),
}));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => player,
  usePlaylistPlayerTime: () => ({ currentTime: 45, duration: 242 }),
}));
const controller = vi.hoisted(() => ({
  mode: "local" as "local" | "server",
  volumeLabel: "VOL",
  commitVolume: vi.fn(),
  isPlaying: true,
  canPrev: true,
  canNext: true,
  safeLen: 3,
  playPrev: vi.fn(),
  playNext: vi.fn(),
  handlePlay: vi.fn(),
  handlePause: vi.fn(),
  handleSeek: vi.fn(),
  handleClearQueue: vi.fn(),
  handleAirPlayClick: vi.fn(),
  isAirPlayAvailable: false,
  isAirPlayActive: false,
}));
vi.mock("@/components/player/usePlayerControlsController", () => ({
  usePlayerControlsController: () => ({
    ...controller,
    playlist: player.playlist,
    currentTrack: player.currentTrack,
    currentTrackIndex: player.currentTrackIndex,
    volume: player.volume,
    setVolume: player.setVolume,
    moveTrack: player.moveTrackInQueue,
    removeTrack: player.removeFromQueue,
    playTrack: player.playTrack,
  }),
}));
const openSave = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useQueueSaveDialog", () => ({
  useQueueSaveDialog: () => ({ Dialog: () => null, open: openSave }),
}));
vi.mock("@/components/player/PlaybackOutput", () => ({
  PlayOnRow: () => <button aria-label="Play on: This iPhone">PLAY ON</button>,
}));
vi.mock("@/components/player/ServerSessionStrip", () => ({
  default: () => <section aria-label="Server session">SERVER SESSION</section>,
}));

import QueueDrawer from "./QueueDrawer";

const panelFlag = () => document.documentElement.hasAttribute("data-queue-panel");

beforeEach(() => {
  vi.clearAllMocks();
  player.playlist = [track(0), track(1), track(2)];
  player.currentTrack = player.playlist[0];
  player.currentTrackIndex = 0;
  controller.isAirPlayAvailable = false;
  controller.mode = "local";
  controller.volumeLabel = "VOL";
});
afterEach(() => setViewportWidth(1280));

describe("QueueDrawer — phone", () => {
  beforeEach(() => setViewportWidth(390));

  it("opens on Now playing: solid surface, meta, seek, transport, volume and PLAY ON", async () => {
    renderWithProviders(
      <QueueDrawer isOpen onClose={vi.fn()} onQueueToggle={vi.fn()} isQueueOpen />,
    );
    expect(await screen.findByText("NOW PLAYING")).toBeTruthy();
    expect(screen.getByText("Title 0")).toBeTruthy();
    expect(screen.getByText("A1 · 120 BPM · 8A")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Seek" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Volume" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Transport" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play on: This iPhone" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AirPlay" })).toBeNull();
  });

  it("sets the volume from the keyboard and closes on Escape", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <QueueDrawer isOpen onClose={onClose} onQueueToggle={vi.fn()} isQueueOpen />,
    );
    const volume = await screen.findByRole("slider", { name: "Volume" });
    volume.focus();
    await user.keyboard("{ArrowRight}");
    expect(player.setVolume).toHaveBeenLastCalledWith(0.51);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("minimizes; AirPlay lives in the Play on picker, not beside the row", async () => {
    controller.isAirPlayAvailable = true;
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <QueueDrawer isOpen onClose={onClose} onQueueToggle={vi.fn()} isQueueOpen />,
    );
    expect(screen.queryByRole("button", { name: "AirPlay" })).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Minimize player" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("on a server: SERVER VOL commits once settled, the queue shows its session, and Clear keeps it open", async () => {
    controller.mode = "server";
    controller.volumeLabel = "SERVER VOL";
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <QueueDrawer isOpen onClose={onClose} onQueueToggle={vi.fn()} isQueueOpen />,
    );
    expect(await screen.findByText("SERVER VOL")).toBeTruthy();
    const volume = screen.getByRole("slider", { name: "Server player volume" });
    volume.focus();
    await user.keyboard("{ArrowRight}");
    expect(player.setVolume).toHaveBeenLastCalledWith(0.51);
    expect(controller.commitVolume).toHaveBeenLastCalledWith(0.51);
    await user.click(screen.getByRole("button", { name: "Open queue, 2 up next" }));
    expect(screen.getByRole("region", { name: "Server session" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear queue" }));
    expect(controller.handleClearQueue).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves to the queue and back, with Save, Clear and a compact transport", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <QueueDrawer isOpen onClose={onClose} onQueueToggle={vi.fn()} isQueueOpen />,
    );
    await user.click(await screen.findByRole("button", { name: "Open queue, 2 up next" }));
    expect(screen.getByText("3 tracks · 3:00")).toBeTruthy();
    expect(screen.getByText("0:45 / 4:02")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(openSave).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Clear queue" }));
    expect(controller.handleClearQueue).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Back to now playing" }));
    expect(screen.getByText("NOW PLAYING")).toBeTruthy();
  });

  it("counts every track up next before playback starts, and shows placeholders", async () => {
    player.currentTrackIndex = null;
    player.currentTrack = null;
    renderWithProviders(
      <QueueDrawer isOpen onClose={vi.fn()} onQueueToggle={vi.fn()} isQueueOpen />,
    );
    expect(await screen.findByRole("button", { name: "Open queue, 3 up next" })).toBeTruthy();
    expect(screen.getByText("No track playing")).toBeTruthy();
  });
});

describe("QueueDrawer — desktop panel", () => {
  it("is a 400px side panel while open, and makes the shell room for it", async () => {
    const onClose = vi.fn();
    const { user, rerender } = renderWithProviders(
      <QueueDrawer isOpen onClose={onClose} onQueueToggle={vi.fn()} isQueueOpen />,
    );
    const panel = screen.getByRole("complementary", { name: "Queue" });
    expect(panel).toBeTruthy();
    expect(panelFlag()).toBe(true);
    expect(screen.getByText("3 tracks · 3:00")).toBeTruthy();
    expect(screen.getByTestId("queue-now-playing")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(openSave).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close queue" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(panel, { key: "Enter" });
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <QueueDrawer isOpen={false} onClose={onClose} onQueueToggle={vi.fn()} isQueueOpen={false} />,
    );
    expect(screen.queryByRole("complementary", { name: "Queue" })).toBeNull();
    expect(panelFlag()).toBe(false);
  });

  it("clears in one tap, with no dialog, and closes", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <QueueDrawer isOpen onClose={onClose} onQueueToggle={vi.fn()} isQueueOpen />,
    );
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(controller.handleClearQueue).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("disables Save and Clear with an empty queue", () => {
    player.playlist = [];
    player.currentTrackIndex = null;
    renderWithProviders(
      <QueueDrawer isOpen onClose={vi.fn()} onQueueToggle={vi.fn()} isQueueOpen />,
    );
    expect(screen.getByRole("button", { name: "Clear" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Queue is empty")).toBeTruthy();
  });
});
