// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  PlaybackTargetProvider,
  usePlaybackTarget,
  usePlaybackPlayer,
  upcomingLocalTracks,
} from "./PlaybackTargetProvider";
import { player, device, workerA, entryB } from "@/test/serverPlayerFixtures";
import { sampleTrack } from "@/stories/fixtures/track";
import { playerApi } from "@/services/internalApi/players";
const local = vi.hoisted(() => ({
  playlist: [] as unknown[],
  playlistLength: 0,
  currentTrackIndex: null as number | null,
  finishedTrack: null as unknown,
  isAirPlayActive: false,
  pause: vi.fn(),
  clearQueue: vi.fn(),
  appendToQueue: vi.fn(),
  replacePlaylist: vi.fn(),
}));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({ usePlaylistPlayer: () => local }));
vi.mock("@/services/internalApi/players", () => ({
  playerApi: {
    session: vi.fn(),
    list: vi.fn(),
    subscribeAll: vi.fn(),
    unlock: vi.fn(),
    lock: vi.fn(),
    subscribe: vi.fn(),
    get: vi.fn(),
    command: vi.fn(),
    devices: vi.fn(),
  },
}));
const api = vi.mocked(playerApi);
let receive: Parameters<typeof playerApi.subscribe>[1];
const close = vi.fn();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PlaybackTargetProvider>{children}</PlaybackTargetProvider>
);
const mount = () =>
  renderHook(() => ({ target: usePlaybackTarget(), playback: usePlaybackPlayer() }), { wrapper });
const snapshot = (id = "lounge") =>
  receive({ type: "snapshot", player: player(id), worker_instance: workerA, sequence: 1 });
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  local.playlist = [];
  local.currentTrackIndex = null;
  local.finishedTrack = null;
  api.subscribeAll.mockImplementation((event) => {
    event({
      type: "players",
      players: [player(), player("aswitch")],
      worker_instance: workerA,
      sequence: 1,
    });
    return vi.fn();
  });
  api.session.mockResolvedValue({ authorized: true });
  api.list.mockResolvedValue([player(), player("aswitch")]);
  api.unlock.mockResolvedValue({ authorized: true });
  api.lock.mockResolvedValue({});
  api.subscribe.mockImplementation((_id, event) => {
    receive = event;
    return close;
  });
  api.get.mockResolvedValue(player());
  api.devices.mockResolvedValue([device]);
  let revision = 3;
  api.command.mockImplementation(async () => ({ player: player("lounge", ++revision) }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("local and server playback target", () => {
  it("keeps existing local actions and queues, persists viewing selection without transport, and fences switched players", async () => {
    const hook = mount();
    await waitFor(() => expect(hook.result.current.target.players.length).toBe(2));
    expect(hook.result.current.playback).toBe(local);
    act(() => hook.result.current.target.select("../unsafe"));
    expect(hook.result.current.target.target).toBe("");
    act(() => hook.result.current.target.select("lounge"));
    expect(local.pause).toHaveBeenCalledTimes(1);
    expect(api.command).not.toHaveBeenCalled();
    await act(async () => snapshot());
    expect(hook.result.current.playback.playlistLength).toBe(2);
    expect(localStorage.getItem("mcs:playback-target")).toBe("lounge");
    const old = receive;
    act(() => hook.result.current.target.select("aswitch"));
    expect(close).toHaveBeenCalled();
    await act(async () => {
      snapshot("aswitch");
      old({
        type: "snapshot",
        player: player("lounge", 99),
        worker_instance: workerA,
        sequence: 99,
      });
    });
    expect(hook.result.current.target.remote.player?.id).toBe("aswitch");
    act(() => hook.result.current.target.select(""));
    expect(hook.result.current.playback).toBe(local);
    expect(api.command).not.toHaveBeenCalled();
    hook.unmount();
    expect(api.command).not.toHaveBeenCalled();
  });
  it("restores a viewed server, waits for authorization and a fresh snapshot, and never auto-plays", async () => {
    localStorage.setItem("mcs:playback-target", "lounge");
    api.session.mockResolvedValueOnce({ authorized: false });
    const hook = mount();
    await waitFor(() => expect(hook.result.current.target.target).toBe("lounge"));
    act(() => {
      hook.result.current.playback.play();
      hook.result.current.playback.pause();
      hook.result.current.playback.appendToQueue(sampleTrack);
      hook.result.current.playback.replacePlaylist([sampleTrack], { autoplay: true });
    });
    expect(hook.result.current.target.problem).toContain("Unlock server access");
    expect(api.command).not.toHaveBeenCalled();
    expect(api.subscribe).not.toHaveBeenCalled();
    await act(async () => hook.result.current.target.unlock("web-passphrase"));
    expect(api.unlock).toHaveBeenCalledWith("web-passphrase");
    await act(async () => snapshot());
    expect(api.command).not.toHaveBeenCalled();
    await act(async () => hook.result.current.target.lock());
    expect(close).toHaveBeenCalled();
    expect(hook.result.current.target.authorized).toBe(false);
  });
  it("atomically replaces for Play now, while additions retain friend identity", async () => {
    const hook = mount();
    await waitFor(() => expect(hook.result.current.target.authorized).toBe(true));
    act(() => hook.result.current.target.select("lounge"));
    await act(async () => snapshot());
    const track = { ...sampleTrack, track_id: "new", friend_id: 2 };
    await act(async () =>
      hook.result.current.playback.replacePlaylist([track], { autoplay: true, startIndex: 0 }),
    );
    expect(api.command).toHaveBeenCalledTimes(1);
    const replacement = api.command.mock.calls[0]![1];
    expect(replacement).toMatchObject({
      type: "queue.replace",
      entries: [{ id: expect.any(String), track_id: "new", friend_id: 2 }],
      position: 0,
      play: true,
    });
    expect(replacement).not.toHaveProperty("expected_revision");
    if (replacement.type !== "queue.replace") throw new Error("Expected replacement");
    expect(replacement.current_entry_id).toBe(replacement.entries[0]!.id);
    await act(async () => hook.result.current.playback.enqueueNext([track]));
    expect(api.command.mock.lastCall?.[1]).toMatchObject({ type: "queue.add", at: 1 });
    await act(async () => hook.result.current.playback.appendToQueue(track));
    expect(api.command.mock.lastCall?.[1]).toMatchObject({
      type: "queue.add",
      tracks: [{ track_id: "new", friend_id: 2 }],
    });
    expect(local.appendToQueue).not.toHaveBeenCalled();
    expect(local.replacePlaylist).not.toHaveBeenCalled();
  });
  it("routes shortcuts to remote transport and retains duplicate track references", async () => {
    const hook = mount();
    await waitFor(() => expect(hook.result.current.target.authorized).toBe(true));
    act(() => hook.result.current.target.select("lounge"));
    await act(async () => snapshot());
    expect(hook.result.current.playback.playlist[1]).toMatchObject({ id: entryB, friend_id: 2 });
    for (const action of ["play", "pause", "stop", "playNext", "playPrev", "clearQueue"] as const)
      await act(async () => hook.result.current.playback[action]());
    expect(api.command.mock.calls.map((call) => call[1].type)).toEqual([
      "resume",
      "pause",
      "stop",
      "next",
      "previous",
      "queue.clear",
    ]);
    const p = player("lounge", 10);
    p.state.status = "stopped";
    p.state.current_entry_id = null;
    await act(async () =>
      receive({ type: "snapshot", player: p, worker_instance: workerA, sequence: 2 }),
    );
    expect(hook.result.current.playback.currentTrackIndex).toBeNull();
    await act(async () => hook.result.current.playback.play());
    expect(api.command.mock.lastCall?.[1].type).toBe("play");
  });
  it("does not retry or issue separate play commands after a failed replacement or empty selection", async () => {
    const hook = mount();
    await waitFor(() => expect(hook.result.current.target.authorized).toBe(true));
    act(() => hook.result.current.target.select("lounge"));
    await act(async () => snapshot());
    await act(async () => {
      hook.result.current.playback.appendToQueue([]);
      hook.result.current.playback.replacePlaylist([], { autoplay: true });
    });
    expect(api.command).not.toHaveBeenCalled();
    api.command.mockRejectedValueOnce(new Error("failed add"));
    await act(async () =>
      hook.result.current.playback.replacePlaylist([sampleTrack], { autoplay: true }),
    );
    expect(api.command).toHaveBeenCalledTimes(1);
    api.command.mockClear();
    await act(async () => hook.result.current.playback.replacePlaylist([sampleTrack]));
    expect(api.command).toHaveBeenCalledTimes(1);
  });
  it("surfaces unlock, lock and discovery failures, without falling back to local playback", async () => {
    api.session.mockRejectedValueOnce(new Error("disabled"));
    const hook = mount();
    await act(async () => {});
    api.unlock.mockRejectedValueOnce(new Error("denied"));
    await act(async () => hook.result.current.target.unlock("bad"));
    expect(hook.result.current.target.problem).toBe("denied");
    await act(async () => hook.result.current.target.unlock("correct"));
    api.list.mockRejectedValueOnce(new Error("worker unavailable"));
    await act(async () => hook.result.current.target.loadPlayers());
    expect(hook.result.current.target.problem).toBe("worker unavailable");
    api.lock.mockRejectedValueOnce(new Error("lock failed"));
    await act(async () => hook.result.current.target.lock());
    expect(hook.result.current.target.problem).toBe("lock failed");
    expect(local.appendToQueue).not.toHaveBeenCalled();
  });
  it("tolerates disabled storage and ignores invalid saved IDs", async () => {
    localStorage.setItem("mcs:playback-target", "../secret");
    const first = mount();
    await act(async () => {});
    expect(first.result.current.target.target).toBe("");
    first.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    const hook = mount();
    await act(async () => {});
    act(() => hook.result.current.target.select("lounge"));
    expect(hook.result.current.target.target).toBe("lounge");
  });
  it("allows existing consumers outside the target provider and reports missing required context", () => {
    expect(renderHook(usePlaybackPlayer).result.current).toBe(local);
    expect(() => renderHook(usePlaybackTarget)).toThrow("PlaybackTargetProvider is required");
  });
});

it("surfaces non-Error rejections and selects a requested track offset within one replacement", async () => {
  const hook = mount();
  await waitFor(() => expect(hook.result.current.target.authorized).toBe(true));
  for (const method of ["unlock", "lock", "list"] as const) {
    api[method].mockRejectedValueOnce("offline");
    await act(async () =>
      method === "unlock"
        ? hook.result.current.target.unlock("test")
        : method === "lock"
          ? hook.result.current.target.lock()
          : hook.result.current.target.loadPlayers(),
    );
    expect(hook.result.current.target.problem).toMatch(/Unable|unavailable/);
  }
  act(() => hook.result.current.target.select("lounge"));
  await act(async () => snapshot());
  const next = { ...sampleTrack, track_id: "second", friend_id: 2 };
  await act(async () =>
    hook.result.current.playback.replacePlaylist([sampleTrack, next], {
      autoplay: true,
      startTrackId: "second",
    }),
  );
  const command = api.command.mock.lastCall![1];
  if (command.type !== "queue.replace") throw new Error("Expected replacement");
  expect(command.current_entry_id).toBe(command.entries[1]!.id);
  expect(api.command).toHaveBeenCalledTimes(1);
  api.command.mockClear();
  await act(async () =>
    hook.result.current.playback.replacePlaylist([sampleTrack], { startTrackId: "missing" }),
  );
  const fallback = api.command.mock.lastCall![1];
  if (fallback.type !== "queue.replace") throw new Error("Expected replacement");
  expect(fallback.current_entry_id).toBe(fallback.entries[0]!.id);
  expect(fallback.play).toBe(false);
});

it("falls back to the first replacement entry when a requested index is out of range", async () => {
  const hook = mount();
  await waitFor(() => expect(hook.result.current.target.authorized).toBe(true));
  act(() => hook.result.current.target.select("lounge"));
  await act(async () => snapshot());
  await act(async () =>
    hook.result.current.playback.replacePlaylist([sampleTrack], { autoplay: true, startIndex: 99 }),
  );
  const command = api.command.mock.lastCall![1];
  if (command.type !== "queue.replace") throw new Error("Expected replacement");
  expect(command.current_entry_id).toBe(command.entries[0]!.id);
});

describe("join and Play here (#793)", () => {
  const queued = (id: string) => ({ ...sampleTrack, track_id: id, friend_id: 1 });
  const ready = async () => {
    const hook = mount();
    await waitFor(() => expect(hook.result.current.target.authorized).toBe(true));
    return hook;
  };

  it("takes the current track onward, never what already played", () => {
    const [a, b, c] = [queued("a"), queued("b"), queued("c")];
    expect(
      upcomingLocalTracks({ playlist: [a, b, c], currentTrackIndex: 1, finishedTrack: null }),
    ).toEqual([b, c]);
    expect(
      upcomingLocalTracks({ playlist: [a, b], currentTrackIndex: null, finishedTrack: null }),
    ).toEqual([a, b]);
    expect(
      upcomingLocalTracks({ playlist: [a, b], currentTrackIndex: null, finishedTrack: b }),
    ).toEqual([]);
  });

  it("appends the local queue to a live server with one session.join, then clears it locally", async () => {
    local.playlist = [queued("played"), queued("now"), queued("next")];
    local.currentTrackIndex = 1;
    const hook = await ready();
    act(() => hook.result.current.target.join("lounge"));
    expect(local.pause).toHaveBeenCalledTimes(1);
    expect(local.clearQueue).not.toHaveBeenCalled();
    const live = player();
    live.state.status = "playing";
    await act(async () =>
      receive({ type: "snapshot", player: live, worker_instance: workerA, sequence: 1 }),
    );
    await waitFor(() => expect(local.clearQueue).toHaveBeenCalledTimes(1));
    expect(api.command.mock.calls.map((call) => call[1])).toEqual([
      {
        type: "session.join",
        tracks: [
          { track_id: "now", friend_id: 1 },
          { track_id: "next", friend_id: 1 },
        ],
      },
    ]);
  });

  it("starts an idle server on the first appended entry", async () => {
    local.playlist = [queued("now")];
    local.currentTrackIndex = 0;
    const hook = await ready();
    const appended = player("lounge", 4);
    appended.state.status = "stopped";
    appended.state.queue.push({
      id: "66666666-6666-4666-8666-666666666666",
      track_id: "now",
      friend_id: 1,
      title: "Now",
      artist: "A",
    });
    api.command.mockResolvedValueOnce({ player: appended });
    act(() => hook.result.current.target.join("lounge"));
    const idle = player();
    idle.state.status = "stopped";
    await act(async () =>
      receive({ type: "snapshot", player: idle, worker_instance: workerA, sequence: 1 }),
    );
    await waitFor(() => expect(local.clearQueue).toHaveBeenCalledOnce());
    expect(api.command.mock.calls.map((call) => call[1])).toEqual([
      { type: "session.join", tracks: [{ track_id: "now", friend_id: 1 }] },
    ]);
  });

  it("keeps the local queue when the append fails", async () => {
    local.playlist = [queued("now")];
    local.currentTrackIndex = 0;
    api.command.mockRejectedValueOnce(new Error("offline"));
    const hook = await ready();
    act(() => hook.result.current.target.join("lounge"));
    await act(async () => snapshot());
    await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1));
    expect(local.clearQueue).not.toHaveBeenCalled();
  });

  it("just switches with an empty local queue, carries nothing between servers, and Play here sends nothing", async () => {
    const hook = await ready();
    act(() => hook.result.current.target.join("lounge"));
    await act(async () => snapshot());
    local.playlist = [queued("left-behind")];
    local.currentTrackIndex = 0;
    act(() => hook.result.current.target.join("lounge")); // already there
    act(() => hook.result.current.target.join("aswitch"));
    await act(async () => snapshot("aswitch"));
    act(() => hook.result.current.target.playHere());
    expect(hook.result.current.target.target).toBe("");
    expect(localStorage.getItem("mcs:playback-target")).toBe("");
    expect(api.command).not.toHaveBeenCalled();
    expect(local.clearQueue).not.toHaveBeenCalled();
    expect(local.pause).toHaveBeenCalledTimes(1);
  });
});

it("updates every server through one list stream, ignores stale events, and closes it on lock", async () => {
  let update!: Parameters<typeof playerApi.subscribeAll>[0];
  const stop = vi.fn();
  api.subscribeAll.mockImplementation((event) => {
    update = event;
    return stop;
  });
  const hook = mount();
  await waitFor(() => expect(api.subscribeAll).toHaveBeenCalledOnce());
  expect(api.list).not.toHaveBeenCalled();
  expect(api.subscribe).not.toHaveBeenCalled();
  const send = (p: ReturnType<typeof player>, sequence: number, worker_instance = workerA) =>
    update({ type: "snapshot", player: p, sequence, worker_instance });
  act(() => send(player("lounge", 10), 2));
  expect(hook.result.current.target.players).toEqual([]);
  act(() =>
    update({
      type: "players",
      players: [player(), player("other")],
      worker_instance: workerA,
      sequence: 1,
    }),
  );
  const latest = player("lounge", 5);
  latest.state.status = "playing";
  act(() => {
    send(latest, 3);
    send(player("lounge", 4), 4);
    send(player("lounge", 20), 2);
    send(player("lounge", 20), 5, "another-worker");
    send(player("new"), 6);
  });
  expect(hook.result.current.target.players).toEqual([latest, player("other"), player("new")]);
  await act(async () => hook.result.current.target.lock());
  expect(stop).toHaveBeenCalledOnce();
  act(() => send(player("late"), 7));
  expect(hook.result.current.target.players).toEqual([]);
});

it("reconnects the list stream for a fresh complete snapshot and fences the old stream", async () => {
  let receiveAll!: Parameters<typeof playerApi.subscribeAll>[0];
  let disconnectAll!: () => void;
  const stop = vi.fn();
  api.subscribeAll.mockImplementation((event, disconnect) => {
    receiveAll = event;
    disconnectAll = disconnect;
    return stop;
  });
  const hook = mount();
  await waitFor(() => expect(api.subscribeAll).toHaveBeenCalledOnce());
  vi.useFakeTimers();
  try {
    const old = receiveAll;
    act(() => {
      receiveAll({
        type: "players",
        players: [player("old", 20)],
        worker_instance: workerA,
        sequence: 10,
      });
      disconnectAll();
      disconnectAll();
    });
    expect(hook.result.current.target.problem).toContain("Reconnecting");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(api.subscribeAll).toHaveBeenCalledTimes(2);
    act(() => {
      receiveAll({ type: "players", players: [], worker_instance: "new-worker", sequence: 1 });
      old({ type: "snapshot", player: player("late"), worker_instance: workerA, sequence: 11 });
    });
    expect(hook.result.current.target.players).toEqual([]);
    expect(hook.result.current.target.problem).toBeNull();
    hook.unmount();
    disconnectAll();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.subscribeAll).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it("retains local tracks for speaker acknowledgement and clears them only after the join commits", async () => {
  local.playlist = [{ ...sampleTrack, track_id: "local" }];
  local.currentTrackIndex = 0;
  api.command.mockRejectedValueOnce(
    Object.assign(new Error("Confirm speaker"), { data: { code: "AVAILABILITY_UNKNOWN" } }),
  );
  const hook = mount();
  await waitFor(() => expect(hook.result.current.target.authorized).toBe(true));
  act(() => hook.result.current.target.join("lounge"));
  await act(async () => snapshot());
  expect(local.clearQueue).not.toHaveBeenCalled();
  expect(hook.result.current.target.remote.acknowledgement?.command.type).toBe("session.join");
  await act(async () => hook.result.current.target.controller!.acknowledge());
  expect(local.clearQueue).toHaveBeenCalledOnce();
  expect(api.command).toHaveBeenCalledTimes(2);
  expect(api.command.mock.lastCall?.[1]).toMatchObject({
    type: "session.join",
    allow_unknown: true,
    expected_revision: 3,
  });
});

it("cleans up when a subscription disconnects during setup", async () => {
  const stop = vi.fn();
  api.subscribeAll.mockImplementation((_event, disconnect) => {
    disconnect();
    return stop;
  });
  const hook = mount();
  await waitFor(() => expect(hook.result.current.target.problem).toContain("Reconnecting"));
  hook.unmount();
  expect(stop).toHaveBeenCalledOnce();
});
