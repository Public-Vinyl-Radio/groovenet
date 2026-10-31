// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { player } from "@/test/serverPlayerFixtures";
import { FIXTURE_NOW, vinylDetection } from "@/stories/fixtures/home";
import { VINYL_NOW_PLAYING_MAX_AGE_MS } from "./nowPlaying";

const target = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
const local = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const detections = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  useOptionalPlaybackTarget: () => target.value,
  upcomingLocalTracks: (queue: { upcoming?: unknown[] }) => queue.upcoming ?? [],
}));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => local.value,
}));
vi.mock("@/hooks/useVinylPipelineQuery", () => ({
  useRecentDetectionsQuery: vi.fn(() => ({ data: { detections: detections.value } })),
}));
vi.mock("@/services/internalApi/players", () => ({ playerApi: { command: vi.fn() } }));
vi.mock("@/services/internalApi/tracks", () => ({ fetchTracksByIds: vi.fn() }));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: vi.fn() } }));

import HomeNowPlaying from "./HomeNowPlaying";
import { playerApi } from "@/services/internalApi/players";
import { fetchTracksByIds } from "@/services/internalApi/tracks";
import { toaster } from "@/components/ui/toaster";
import { useRecentDetectionsQuery } from "@/hooks/useVinylPipelineQuery";
import { useQueueDrawerStore } from "@/hooks/useQueueDrawer";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";
import { useTrackStore } from "@/stores/trackStore";

type Status = ReturnType<typeof player>["state"]["status"];
const serverPlayer = (id: string, status: Status, revision = 3) => {
  const p = player(id, revision);
  return { ...p, state: { ...p.state, status } };
};

const controller = { id: "lounge", command: vi.fn() };
const select = vi.fn();
function setTarget(players: unknown[], patch: Record<string, unknown> = {}) {
  target.value = {
    target: "",
    authorized: true,
    players,
    controller: null,
    select,
    reportProblem: vi.fn(),
    ...patch,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FIXTURE_NOW));
  vi.clearAllMocks();
  vi.mocked(playerApi.command).mockResolvedValue({} as never);
  vi.mocked(fetchTracksByIds).mockResolvedValue([]);
  useTrackStore.setState({ tracks: new Map() } as never);
  usePlaybackTargetDialog.setState({ open: false });
  useQueueDrawerStore.setState({ isOpen: false });
  // This browser is playing something of its own the whole time: Home must ignore it.
  local.value = {
    isPlaying: true,
    currentTrack: { title: "Browser song", artist: "Local" },
    playlist: [],
  };
  detections.value = [];
  setTarget([]);
});
afterEach(() => vi.useRealTimers());

describe("HomeNowPlaying", () => {
  it("shows the playing server player and ignores the in-browser player", async () => {
    vi.mocked(fetchTracksByIds).mockResolvedValue([
      {
        track_id: "same-track",
        friend_id: 1,
        title: "Track",
        artist: "Artist",
        album: "Alta Suciedad",
        album_thumbnail: "https://example.com/cover.jpg",
      } as never,
    ]);
    setTarget([serverPlayer("lounge", "paused"), serverPlayer("aswitch", "playing")]);
    renderWithProviders(<HomeNowPlaying />);
    expect(screen.getByRole("heading", { name: /NOW PLAYING/ }).textContent).toContain("ASWITCH");
    expect(screen.getByText("Artist")).toBeTruthy();
    expect(screen.queryByText("Browser song")).toBeNull();
    expect(await screen.findByText("Artist · Alta Suciedad")).toBeTruthy();
    expect(screen.getByText("0:12 / 1:40")).toBeTruthy();
    // A server player never polls for vinyl.
    expect(vi.mocked(useRecentDetectionsQuery).mock.calls.at(-1)?.[1]).toMatchObject({
      enabled: false,
    });
  });

  it("renders nothing when only the in-browser player is playing", () => {
    const { container } = renderWithProviders(<HomeNowPlaying />);
    expect(container.querySelector("section")).toBeNull();
  });

  it("renders nothing without a playback target provider", () => {
    target.value = null;
    detections.value = [vinylDetection()];
    const { container } = renderWithProviders(<HomeNowPlaying />);
    expect(container.querySelector("section")).toBeNull();
  });

  it("sends previous, pause and next to the player it shows", async () => {
    setTarget([serverPlayer("aswitch", "playing")]);
    const { user } = renderWithProviders(<HomeNowPlaying />);
    // The fixture's current entry is the first of two: no previous.
    expect(
      (screen.getByRole("button", { name: "Previous", hidden: true }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Next", hidden: true }));
    expect(vi.mocked(playerApi.command).mock.calls).toEqual([
      ["aswitch", { type: "pause" }],
      ["aswitch", { type: "next" }],
    ]);
  });

  it("sends previous once the current entry has one before it", async () => {
    const p = serverPlayer("aswitch", "playing");
    p.state.current_entry_id = p.state.queue[1]!.id;
    setTarget([p]);
    const { user } = renderWithProviders(<HomeNowPlaying />);
    await user.click(screen.getByRole("button", { name: "Previous", hidden: true }));
    expect(playerApi.command).toHaveBeenCalledWith("aswitch", { type: "previous" });
    expect(
      (screen.getByRole("button", { name: "Next", hidden: true }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("goes through the session controller when the player is the selected target", async () => {
    setTarget([serverPlayer("lounge", "playing")], { target: "lounge", controller });
    const { user } = renderWithProviders(<HomeNowPlaying />);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(controller.command).toHaveBeenCalledWith({ type: "pause" });
    expect(playerApi.command).not.toHaveBeenCalled();
  });

  it("keeps a paused player on screen and resumes it", async () => {
    setTarget([serverPlayer("aswitch", "playing", 3)]);
    const { user, rerender } = renderWithProviders(<HomeNowPlaying />);
    setTarget([serverPlayer("aswitch", "paused", 4)]);
    rerender(<HomeNowPlaying />);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(playerApi.command).toHaveBeenCalledWith("aswitch", { type: "resume" });
  });

  it("plays a loading player's play key as play", async () => {
    setTarget([serverPlayer("aswitch", "loading")]);
    renderWithProviders(<HomeNowPlaying />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("prefers the player that changed most recently", () => {
    setTarget([serverPlayer("lounge", "playing", 3), serverPlayer("aswitch", "playing", 3)]);
    const { rerender } = renderWithProviders(<HomeNowPlaying />);
    expect(screen.getByRole("heading", { name: /NOW PLAYING/ }).textContent).toContain("LOUNGE");
    setTarget([serverPlayer("lounge", "playing", 3), serverPlayer("aswitch", "playing", 4)]);
    rerender(<HomeNowPlaying />);
    expect(screen.getByRole("heading", { name: /NOW PLAYING/ }).textContent).toContain("ASWITCH");
  });

  it("asks to unlock instead of sending while locked", async () => {
    setTarget([serverPlayer("aswitch", "playing")], { authorized: false });
    const { user } = renderWithProviders(<HomeNowPlaying />);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(playerApi.command).not.toHaveBeenCalled();
    expect(toaster.create).toHaveBeenCalledWith(expect.objectContaining({ type: "warning" }));
  });

  it("says so when a command fails", async () => {
    vi.mocked(playerApi.command).mockRejectedValue(new Error("Engine offline"));
    setTarget([serverPlayer("aswitch", "playing")]);
    const { user } = renderWithProviders(<HomeNowPlaying />);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith({
        title: "Couldn't reach Aswitch",
        description: "Engine offline",
        type: "error",
      }),
    );
  });

  it("reports a non-Error failure without a description", async () => {
    vi.mocked(playerApi.command).mockRejectedValue("nope");
    setTarget([serverPlayer("aswitch", "playing")]);
    const { user } = renderWithProviders(<HomeNowPlaying />);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: undefined, type: "error" }),
      ),
    );
  });

  describe("opening Now playing", () => {
    it("selects the player and opens Now playing when nothing local would move", async () => {
      setTarget([serverPlayer("aswitch", "playing")]);
      const { user } = renderWithProviders(<HomeNowPlaying />);
      await user.click(screen.getByRole("button", { name: "Open Now playing: Track" }));
      expect(select).toHaveBeenCalledWith("aswitch");
      expect(useQueueDrawerOpen()).toBe(true);
    });

    it("opens straight away when the player is already the target", async () => {
      setTarget([serverPlayer("lounge", "playing")], { target: "lounge", controller });
      const { user } = renderWithProviders(<HomeNowPlaying />);
      await user.click(screen.getByRole("button", { name: "Open Now playing: Track" }));
      expect(select).not.toHaveBeenCalled();
      expect(useQueueDrawerOpen()).toBe(true);
    });

    it("leaves a local queue alone and asks through the Play on picker", async () => {
      local.value = { ...local.value, upcoming: [{ track_id: "x" }] };
      setTarget([serverPlayer("aswitch", "playing")]);
      const { user } = renderWithProviders(<HomeNowPlaying />);
      await user.click(screen.getByRole("button", { name: "Open Now playing: Track" }));
      expect(select).not.toHaveBeenCalled();
      expect(usePlaybackTargetDialog.getState().open).toBe(true);
      expect(useQueueDrawerOpen()).toBe(false);
    });
  });

  describe("vinyl fallback", () => {
    it("shows a recent detection as VINYL, without transport or progress", async () => {
      detections.value = [vinylDetection()];
      renderWithProviders(<HomeNowPlaying />);
      expect(screen.getByRole("heading", { name: /NOW PLAYING/ }).textContent).toContain("VINYL");
      expect(screen.getByText("Flaca")).toBeTruthy();
      expect(screen.getByText("Andrés Calamaro · Alta Suciedad")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Pause|Play/, hidden: true })).toBeNull();
      expect(screen.queryAllByTestId("now-playing-progress")).toHaveLength(0);
      expect(screen.getByRole("link").getAttribute("href")).toBe("/tracks/t1?friend_id=1");
      expect(vi.mocked(useRecentDetectionsQuery).mock.calls.at(-1)).toEqual([
        { matched: true, limit: 1 },
        { enabled: true, refetchInterval: 15_000 },
      ]);
    });

    it("renders nothing before the detections load", () => {
      vi.mocked(useRecentDetectionsQuery).mockReturnValueOnce({ data: undefined } as never);
      const { container } = renderWithProviders(<HomeNowPlaying />);
      expect(container.querySelector("section")).toBeNull();
    });

    it("shows a detection with no artist", () => {
      detections.value = [vinylDetection({ artist: null, album: null })];
      renderWithProviders(<HomeNowPlaying />);
      expect(screen.getByText("Flaca")).toBeTruthy();
    });

    it("prefers a playing server player over a fresh detection", () => {
      detections.value = [vinylDetection()];
      setTarget([serverPlayer("aswitch", "playing")]);
      renderWithProviders(<HomeNowPlaying />);
      expect(screen.queryByText("Flaca")).toBeNull();
      expect(screen.getByText("Track")).toBeTruthy();
    });

    it("shows a detection exactly at the threshold", () => {
      const at = new Date(Date.parse(FIXTURE_NOW) - VINYL_NOW_PLAYING_MAX_AGE_MS).toISOString();
      detections.value = [vinylDetection({ window_start_at: at })];
      renderWithProviders(<HomeNowPlaying />);
      expect(screen.getByText("Flaca")).toBeTruthy();
    });

    it("hides a stale detection", () => {
      const at = new Date(
        Date.parse(FIXTURE_NOW) - VINYL_NOW_PLAYING_MAX_AGE_MS - 1000,
      ).toISOString();
      detections.value = [vinylDetection({ window_start_at: at })];
      const { container } = renderWithProviders(<HomeNowPlaying />);
      expect(container.querySelector("section")).toBeNull();
    });
  });
});

function useQueueDrawerOpen() {
  return useQueueDrawerStore.getState().isOpen;
}
