// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { PlaybackTargetProvider, usePlaybackTarget, usePlaybackPlayer } from "./PlaybackTargetProvider";
import { player, device, workerA, entryB } from "@/test/serverPlayerFixtures";
import { sampleTrack } from "@/stories/fixtures/track";
import { playerApi } from "@/services/internalApi/players";
const local = vi.hoisted(() => ({ playlist: [], playlistLength: 0, pause: vi.fn(), appendToQueue: vi.fn(), replacePlaylist: vi.fn() }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({ usePlaylistPlayer: () => local }));
vi.mock("@/services/internalApi/players", () => ({ playerApi: { session: vi.fn(), list: vi.fn(), unlock: vi.fn(), lock: vi.fn(), subscribe: vi.fn(), get: vi.fn(), command: vi.fn(), devices: vi.fn() } }));
const api = vi.mocked(playerApi);
let receive: Parameters<typeof playerApi.subscribe>[1];
const close = vi.fn();
const wrapper = ({ children }: { children: React.ReactNode }) => <PlaybackTargetProvider>{children}</PlaybackTargetProvider>;
const mount = () => renderHook(() => ({ target: usePlaybackTarget(), playback: usePlaybackPlayer() }), { wrapper });
const snapshot = (id = "lounge") => receive({ type: "snapshot", player: player(id), worker_instance: workerA, sequence: 1 });
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  api.session.mockResolvedValue({ authorized: true }); api.list.mockResolvedValue([player(), player("aswitch")]); api.unlock.mockResolvedValue({ authorized: true }); api.lock.mockResolvedValue({});
  api.subscribe.mockImplementation((_id, event) => { receive = event; return close; });
  api.get.mockResolvedValue(player()); api.devices.mockResolvedValue([device]);
  api.command.mockImplementation(async (_id, command) => ({ player: player("lounge", command.expected_revision + 1) }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("local and server playback target", () => {
  it("keeps existing local actions and queues, persists viewing selection without transport, and fences switched players", async () => {
    const hook = mount(); await waitFor(() => expect(hook.result.current.target.players.length).toBe(2));
    expect(hook.result.current.playback).toBe(local);
    act(() => hook.result.current.target.select("../unsafe")); expect(hook.result.current.target.target).toBe("");
    act(() => hook.result.current.target.select("lounge")); expect(local.pause).toHaveBeenCalledTimes(1); expect(api.command).not.toHaveBeenCalled();
    await act(async () => snapshot()); expect(hook.result.current.playback.playlistLength).toBe(2);
    expect(localStorage.getItem("mcs:playback-target")).toBe("lounge");
    const old = receive;
    act(() => hook.result.current.target.select("aswitch")); expect(close).toHaveBeenCalled();
    await act(async () => { snapshot("aswitch"); old({ type: "snapshot", player: player("lounge", 99), worker_instance: workerA, sequence: 99 }); });
    expect(hook.result.current.target.remote.player?.id).toBe("aswitch");
    act(() => hook.result.current.target.select("")); expect(hook.result.current.playback).toBe(local); expect(api.command).not.toHaveBeenCalled();
    hook.unmount(); expect(api.command).not.toHaveBeenCalled();
  });
  it("restores a viewed server, waits for authorization and a fresh snapshot, and never auto-plays", async () => {
    localStorage.setItem("mcs:playback-target", "lounge"); api.session.mockResolvedValueOnce({ authorized: false });
    const hook = mount(); await waitFor(() => expect(hook.result.current.target.target).toBe("lounge"));
    act(() => { hook.result.current.playback.play(); hook.result.current.playback.pause(); hook.result.current.playback.appendToQueue(sampleTrack); hook.result.current.playback.replacePlaylist([sampleTrack], { autoplay: true }); });
    expect(hook.result.current.target.problem).toContain("Unlock server access");
    expect(api.command).not.toHaveBeenCalled(); expect(api.subscribe).not.toHaveBeenCalled();
    await act(async () => hook.result.current.target.unlock("web-passphrase")); expect(api.unlock).toHaveBeenCalledWith("web-passphrase");
    await act(async () => snapshot()); expect(api.command).not.toHaveBeenCalled();
    await act(async () => hook.result.current.target.lock()); expect(close).toHaveBeenCalled(); expect(hook.result.current.target.authorized).toBe(false);
  });
  it("routes additions with friend identity and queue UUIDs, plays only explicitly requested entries after an add", async () => {
    const hook = mount(); await waitFor(() => expect(hook.result.current.target.authorized).toBe(true));
    act(() => hook.result.current.target.select("lounge")); await act(async () => snapshot());
    const track = { ...sampleTrack, track_id: "new", friend_id: 2 };
    const p = player("lounge", 4); p.state.queue.push({ id: "55555555-5555-4555-8555-555555555555", track_id: "new", friend_id: 2, title: "New", artist: "Artist" });
    api.command.mockResolvedValueOnce({ player: p });
    await act(async () => hook.result.current.playback.replacePlaylist([track], { autoplay: true, startIndex: 0 }));
    expect(api.command.mock.calls[0]![1]).toEqual({ type: "queue.add", tracks: [{ track_id: "new", friend_id: 2 }], expected_revision: 3 });
    expect(api.command.mock.calls[1]![1]).toEqual({ type: "play", entry_id: p.state.queue[2]!.id, expected_revision: 4 });
    await act(async () => hook.result.current.playback.enqueueNext([track])); expect(api.command.mock.lastCall?.[1]).toMatchObject({ type: "queue.add", at: 1 });
    expect(local.appendToQueue).not.toHaveBeenCalled(); expect(local.replacePlaylist).not.toHaveBeenCalled();
  });
  it("routes shortcuts to remote transport and retains duplicate track references", async () => {
    const hook = mount(); await waitFor(() => expect(hook.result.current.target.authorized).toBe(true)); act(() => hook.result.current.target.select("lounge")); await act(async () => snapshot());
    expect(hook.result.current.playback.playlist[1]).toMatchObject({ id: entryB, friend_id: 2 });
    for (const action of ["play", "pause", "stop", "playNext", "playPrev", "clearQueue"] as const) await act(async () => hook.result.current.playback[action]());
    expect(api.command.mock.calls.map(call => call[1].type)).toEqual(["resume", "pause", "stop", "next", "previous", "queue.clear"]);
    const p = player("lounge", 10); p.state.status = "stopped"; p.state.current_entry_id = null;
    await act(async () => receive({ type: "snapshot", player: p, worker_instance: workerA, sequence: 2 }));
    expect(hook.result.current.playback.currentTrackIndex).toBeNull(); await act(async () => hook.result.current.playback.play()); expect(api.command.mock.lastCall?.[1].type).toBe("play");
  });
  it("does not play after a failed add, after an empty selection, or for enqueue-only requests", async () => {
    const hook = mount(); await waitFor(() => expect(hook.result.current.target.authorized).toBe(true)); act(() => hook.result.current.target.select("lounge")); await act(async () => snapshot());
    await act(async () => { hook.result.current.playback.appendToQueue([]); hook.result.current.playback.replacePlaylist([], { autoplay: true }); }); expect(api.command).not.toHaveBeenCalled();
    api.command.mockRejectedValueOnce(new Error("failed add")); await act(async () => hook.result.current.playback.replacePlaylist([sampleTrack], { autoplay: true })); expect(api.command).toHaveBeenCalledTimes(1);
    api.command.mockClear(); await act(async () => hook.result.current.playback.replacePlaylist([sampleTrack])); expect(api.command).toHaveBeenCalledTimes(1);
  });
  it("surfaces unlock, lock and discovery failures, without falling back to local playback", async () => {
    api.session.mockRejectedValueOnce(new Error("disabled")); const hook = mount(); await act(async () => {});
    api.unlock.mockRejectedValueOnce(new Error("denied")); await act(async () => hook.result.current.target.unlock("bad")); expect(hook.result.current.target.problem).toBe("denied");
    await act(async () => hook.result.current.target.unlock("correct")); api.list.mockRejectedValueOnce(new Error("worker unavailable"));
    await act(async () => hook.result.current.target.loadPlayers()); expect(hook.result.current.target.problem).toBe("worker unavailable");
    api.lock.mockRejectedValueOnce(new Error("lock failed")); await act(async () => hook.result.current.target.lock()); expect(hook.result.current.target.problem).toBe("lock failed");
    expect(local.appendToQueue).not.toHaveBeenCalled();
  });
  it("tolerates disabled storage and ignores invalid saved IDs", async () => {
    localStorage.setItem("mcs:playback-target", "../secret"); const first = mount(); await act(async () => {}); expect(first.result.current.target.target).toBe(""); first.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("disabled"); }); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disabled"); });
    const hook = mount(); await act(async () => {}); act(() => hook.result.current.target.select("lounge")); expect(hook.result.current.target.target).toBe("lounge");
  });
  it("allows existing consumers outside the target provider and reports missing required context", () => {
    expect(renderHook(usePlaybackPlayer).result.current).toBe(local);
    expect(() => renderHook(usePlaybackTarget)).toThrow("PlaybackTargetProvider is required");
  });
});

it("surfaces non-Error rejections and chooses newly added entries by stable UUID and requested track offset", async () => {
  const hook = mount(); await waitFor(() => expect(hook.result.current.target.authorized).toBe(true));
  for (const method of ["unlock", "lock", "list"] as const) {
    api[method].mockRejectedValueOnce("offline");
    await act(async () => method === "unlock" ? hook.result.current.target.unlock("test") : method === "lock" ? hook.result.current.target.lock() : hook.result.current.target.loadPlayers());
    expect(hook.result.current.target.problem).toMatch(/Unable|unavailable/);
  }
  act(() => hook.result.current.target.select("lounge")); await act(async () => snapshot());
  const next = { ...sampleTrack, track_id: "second", friend_id: 2 };
  const p = player("lounge", 4);
  p.state.queue.push({ id: "55555555-5555-4555-8555-555555555555", track_id: sampleTrack.track_id, friend_id: sampleTrack.friend_id, title: "First", artist: "Artist" }, { id: "66666666-6666-4666-8666-666666666666", track_id: "second", friend_id: 2, title: "Second", artist: "Artist" });
  api.command.mockResolvedValueOnce({ player: p });
  await act(async () => hook.result.current.playback.replacePlaylist([sampleTrack, next], { autoplay: true, startTrackId: "second" }));
  expect(api.command.mock.lastCall?.[1]).toMatchObject({ type: "play", entry_id: p.state.queue[3]!.id });
  api.command.mockClear();
  api.command.mockResolvedValueOnce({ player: player("lounge", 6) });
  await act(async () => hook.result.current.playback.replacePlaylist([sampleTrack], { autoplay: true, startTrackId: "missing" }));
  expect(api.command).toHaveBeenCalledTimes(1);
  api.command.mockClear();
  const newPlayer = player("lounge", 7); newPlayer.state.queue.push({ id: "77777777-7777-4777-8777-777777777777", track_id: sampleTrack.track_id, friend_id: sampleTrack.friend_id, title: "New", artist: "Artist" });
  api.command.mockResolvedValueOnce({ player: newPlayer });
  await act(async () => hook.result.current.playback.replacePlaylist([sampleTrack], { autoplay: true }));
  expect(api.command.mock.lastCall?.[1]).toMatchObject({ type: "play", entry_id: newPlayer.state.queue[2]!.id });
});
