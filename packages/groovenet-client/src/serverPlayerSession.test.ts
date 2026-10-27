import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerPlayer, ServerPlayerDevice } from "@groovenet/contracts";
import { ServerPlayerSession, isIdle, isLive, upcomingTracks, type ServerPlayerTransport } from "./serverPlayerSession.js";

const entryA = "11111111-1111-4111-8111-111111111111";
const entryB = "22222222-2222-4222-8222-222222222222";
const workerA = "33333333-3333-4333-8333-333333333333";
const workerB = "44444444-4444-4444-8444-444444444444";
function player(id = "lounge", revision = 3): ServerPlayer {
  return { id, name: id === "lounge" ? "Lounge" : "Aswitch", engine_id: "primary", availability_policy: "ask", revision, assigned_output: null,
    state: { queue: [{ id: entryA, track_id: "same-track", friend_id: 1, title: "Track", artist: "Artist" }, { id: entryB, track_id: "same-track", friend_id: 2, title: "Track", artist: "Artist" }], current_entry_id: entryA, status: "paused", position: 12, duration: 100, volume: 30, desired_output: "speaker", checkpoint: false, error: null } };
}
const device: ServerPlayerDevice = { id: "speaker", name: "Speaker", assigned_player_id: null, desired_by: ["lounge"], observed: { availability: "unknown", observed_at: null, source: "unconfigured", sender_identity: "unknown" } };

type Event = Parameters<ServerPlayerTransport["subscribe"]>[1];
let receive: Event;
let disconnect: (reason?: unknown) => void;
const close = vi.fn();
const api = { get: vi.fn(), devices: vi.fn(), command: vi.fn(), subscribe: vi.fn() };
let session: ServerPlayerSession;
const snapshot = (revision = 3, sequence = 1, worker_instance = workerA, id = "lounge") => receive({ type: "snapshot", player: player(id, revision), worker_instance, sequence });
const failure = (code: string) => Object.assign(new Error(code), { data: { code } });

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  api.devices.mockResolvedValue([device]); api.get.mockResolvedValue(player());
  api.subscribe.mockImplementation((_id, onEvent, onDisconnect) => { receive = onEvent; disconnect = onDisconnect; return close; });
  api.command.mockResolvedValue({ player: player("lounge", 4) });
  session = new ServerPlayerSession("lounge", api); session.start();
});
afterEach(() => { session.close(); vi.useRealTimers(); });
describe("remote player observations", () => {
  it("requires a first matching snapshot, fences identity, worker, revision, entry and sequence", async () => {
    const listener = vi.fn(); const off = session.subscribe(listener);
    const position = { type: "position" as const, player_id: "lounge", revision: 3, current_entry_id: player().state.current_entry_id, position: 20, duration: null, observed_at: "now", worker_instance: workerA, sequence: 2 };
    receive(position); snapshot(3, 1, workerA, "aswitch"); expect(session.getSnapshot().player).toBeNull();
    snapshot(); await Promise.resolve(); expect(session.getSnapshot().devices).toEqual([device]);
    receive({ ...position, worker_instance: workerB }); snapshot(2, 2); snapshot(10, 1);
    expect(session.getSnapshot().player?.revision).toBe(3);
    receive({ ...position, sequence: 3, player_id: "aswitch" }); receive({ ...position, sequence: 4, revision: 2 }); receive({ ...position, sequence: 5, current_entry_id: entryB });
    expect(session.getSnapshot().player?.state.position).toBe(12);
    receive({ ...position, sequence: 6 }); expect(session.getSnapshot().player?.state.position).toBe(20);
    snapshot(3, 7, workerA, "aswitch"); expect(session.getSnapshot().player?.id).toBe("lounge");
    off(); const calls = listener.mock.calls.length; snapshot(4, 8); expect(listener).toHaveBeenCalledTimes(calls);
  });
  it("reconnects for a new snapshot and accepts stopped restart checkpoints with lower revisions", async () => {
    snapshot(); const oldReceive = receive; const oldDisconnect = disconnect;
    disconnect(); expect(session.getSnapshot().connected).toBe(false);
    await session.command({ type: "play" }); expect(api.command).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500); oldReceive({ type: "snapshot", player: player("lounge", 99), worker_instance: workerA, sequence: 99 }); oldDisconnect();
    snapshot(0, 0, workerB); expect(session.getSnapshot().player?.revision).toBe(0);
    expect(api.command).not.toHaveBeenCalled(); expect(session.getSnapshot().connected).toBe(true);
    session.close(); snapshot(5, 8); disconnect(); await vi.advanceTimersByTimeAsync(2000);
    expect(api.subscribe).toHaveBeenCalledTimes(2);
  });
  it("retains a newer command revision across reconnects to the same worker", async () => {
    snapshot(); await session.command({ type: "pause" }); disconnect(); await vi.advanceTimersByTimeAsync(1500);
    snapshot(3); expect(session.getSnapshot().connected).toBe(false);
    snapshot(4, 2); expect(session.getSnapshot().connected).toBe(true);
  });
  it("fences outstanding device and refresh responses after closing", async () => {
    let resolve!: (value: typeof device[]) => void;
    api.devices.mockReturnValueOnce(new Promise(done => { resolve = done; })); snapshot(); session.close(); resolve([device]); await Promise.resolve();
    expect(session.getSnapshot().devices).toEqual([]);
    api.get.mockResolvedValue(player("lounge", 99)); await session.refresh(); expect(session.getSnapshot().player?.revision).toBe(3);
    api.get.mockRejectedValue(new Error("offline")); await session.refresh();
  });
  it("surfaces output failures and refresh failures, and does not lower revisions", async () => {
    api.devices.mockRejectedValueOnce(new Error("devices offline")); snapshot(); await Promise.resolve();
    expect(session.getSnapshot().problem).toContain("devices offline");
    api.get.mockResolvedValue(player("lounge", 1)); await session.refresh(); expect(session.getSnapshot().player?.revision).toBe(3);
    api.get.mockRejectedValueOnce("offline"); await session.refresh(); expect(session.getSnapshot().problem).toContain("Player request failed");
  });
});
describe("shared player commands", () => {
  it("serializes commands, sends stable UUIDs without a revision, and rejects stale responses", async () => {
    snapshot(); let resolve!: (result: { player: ReturnType<typeof player> }) => void;
    api.command.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = session.command({ type: "queue.remove", entry_id: entryB });
    await session.command({ type: "next" }); expect(session.getSnapshot().problem).toContain("in progress");
    snapshot(8, 4); resolve({ player: player("lounge", 4) }); await pending;
    expect(session.getSnapshot().player?.revision).toBe(8);
    expect(api.command).toHaveBeenCalledExactlyOnceWith("lounge", { type: "queue.remove", entry_id: entryB });
    await session.command({ type: "pause" }); expect(api.command.mock.lastCall?.[1]).toEqual({ type: "pause" });
  });
  it("lets two sessions act from the same snapshot and converge on the newer state", async () => {
    snapshot();
    const other = new ServerPlayerSession("lounge", api); other.start();
    const receiveOther = receive; receiveOther({ type: "snapshot", player: player(), worker_instance: workerA, sequence: 1 });
    api.command.mockResolvedValueOnce({ player: player("lounge", 4) }).mockResolvedValueOnce({ player: player("lounge", 5) });
    await session.command({ type: "pause" });
    await other.command({ type: "queue.remove", entry_id: entryB });
    expect(api.command.mock.calls.map(call => call[1])).toEqual([{ type: "pause" }, { type: "queue.remove", entry_id: entryB }]);
    receiveOther({ type: "snapshot", player: player("lounge", 5), worker_instance: workerA, sequence: 2 });
    expect(other.getSnapshot().player?.revision).toBe(5);
    expect(other.getSnapshot().problem).toBeNull();
    other.close();
  });
  it.each(["AVAILABILITY_UNKNOWN", "SPEAKER_OCCUPIED"])("requires an explicit acknowledgement for %s", async code => {
    snapshot(); api.command.mockRejectedValueOnce(failure(code)); await session.command({ type: "play" });
    expect(session.getSnapshot().acknowledgement).toEqual({ command: { type: "play" }, code, revision: 3 });
    await session.acknowledge();
    expect(api.command.mock.lastCall?.[1]).toEqual({ type: "play", ...(code === "AVAILABILITY_UNKNOWN" ? { allow_unknown: true } : { takeover: true }) });
    session.dismissAcknowledgement(); expect(session.getSnapshot().acknowledgement).toBeNull();
  });
  it.each([null, { code: "ENGINE_FAILURE", message: "Failed attachment" }])("exposes partial HTTP 200 transfers (%s)", async error => {
    snapshot(); api.command.mockResolvedValueOnce({ player: player("lounge", 4), transfer: { from_player: player("aswitch"), detached: true, attached: false, error } });
    await session.command({ type: "output.transfer", output_id: "speaker", from_player_id: "aswitch", from_revision: 3, play: true });
    expect(session.getSnapshot().problem).toContain("partially completed");
  });
  it("treats deliberate non-playing transfers as complete and preserves playback failures through edits", async () => {
    const p = player("lounge", 4); p.state.error = { code: "FAIL", message: "Receiver lost" }; p.state.status = "error";
    snapshot(); api.command.mockResolvedValueOnce({ player: p, transfer: { from_player: player("aswitch"), detached: true, attached: false, error: null } });
    await session.command({ type: "output.transfer", output_id: "speaker", from_player_id: "aswitch", from_revision: 3, play: false });
    expect(session.getSnapshot().problem).toBeNull(); expect(session.getSnapshot().player?.state.error?.code).toBe("FAIL");
  });
  it("fences command success and failure after a player subscription closes", async () => {
    snapshot(); let reject!: (error: Error) => void;
    api.command.mockReturnValueOnce(new Promise((_done, fail) => { reject = fail; })); const pending = session.command({ type: "stop" });
    session.close(); reject(new Error("offline")); expect(await pending).toBeNull();
    session.start(); snapshot(); let resolve!: (value: { player: ReturnType<typeof player> }) => void;
    api.command.mockReturnValueOnce(new Promise(done => { resolve = done; })); const next = session.command({ type: "play" });
    session.close(); resolve({ player: player("lounge", 10) }); expect(await next).toBeNull();
  });
});

it("ignores device errors after disconnect and does not offer connect acknowledgements for queue edits", async () => {
  let reject!: (error: Error) => void;
  api.devices.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  snapshot(); session.close(); reject(new Error("Late error")); await Promise.resolve();
  expect(session.getSnapshot().problem).toBeNull();
  session.start(); snapshot();
  api.command.mockRejectedValueOnce(failure("AVAILABILITY_UNKNOWN"));
  await session.command({ type: "queue.clear" }); expect(session.getSnapshot().acknowledgement).toBeNull();
});

it("fences an availability acknowledgement when another session changes the player", async () => {
  await session.acknowledge(); expect(api.command).not.toHaveBeenCalled();
  snapshot(); api.command.mockRejectedValueOnce(failure("AVAILABILITY_UNKNOWN"));
  await session.command({ type: "play" }); snapshot(4, 2);
  await session.acknowledge(); expect(api.command).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().acknowledgement).toBeNull(); expect(session.getSnapshot().problem).toContain("changed while awaiting");
});

it.each(["AVAILABILITY_UNKNOWN", "SPEAKER_OCCUPIED"])("acknowledges %s by replaying the complete atomic replacement", async code => {
  snapshot(); api.command.mockRejectedValueOnce(failure(code));
  const replacement = { type: "queue.replace" as const, entries: [{ id: entryB, track_id: "track", friend_id: 1 }], current_entry_id: entryB, position: 42, play: true };
  await session.command(replacement);
  expect(session.getSnapshot().acknowledgement?.command).toEqual(replacement);
  await session.acknowledge();
  expect(api.command.mock.lastCall?.[1]).toEqual({ ...replacement, ...(code === "AVAILABILITY_UNKNOWN" ? { allow_unknown: true } : { takeover: true }) });
});
it("preserves an explicit revision when acknowledging a conditional replacement", async () => {
  snapshot(); api.command.mockRejectedValueOnce(failure("AVAILABILITY_UNKNOWN"));
  const replacement = { type: "queue.replace" as const, entries: [], play: true };
  await session.command(replacement, 3);
  expect(session.getSnapshot().acknowledgement?.expectedRevision).toBe(3);
  await session.acknowledge();
  expect(api.command.mock.lastCall?.[1]).toEqual({ ...replacement, allow_unknown: true, expected_revision: 3 });
});
it("never treats an enqueue-only replacement as a connection request", async () => {
  snapshot(); api.command.mockRejectedValueOnce(failure("AVAILABILITY_UNKNOWN"));
  await session.command({ type: "queue.replace", entries: [], play: false });
  expect(session.getSnapshot().acknowledgement).toBeNull();
});

describe("joining a server (#793)", () => {
  const added = (status: "playing" | "stopped", ...extra: string[]) => {
    const p = player("lounge", 4); p.state.status = status;
    p.state.queue.push(...extra.map((id, n) => ({ id, track_id: `t${n}`, friend_id: 1, title: "New", artist: "New" })));
    return { player: p };
  };
  const newEntry = "55555555-5555-4555-8555-555555555555";
  const tracks = [{ track_id: "t0", friend_id: 1 }];

  it("waits for a fresh snapshot, then appends once and leaves a live session playing", async () => {
    const live = player(); live.state.status = "playing";
    api.command.mockResolvedValueOnce(added("playing", newEntry));
    const joining = session.join(tracks);
    receive({ type: "snapshot", player: live, worker_instance: workerA, sequence: 1 });
    expect(await joining).toBe(true);
    expect(api.command.mock.calls.map(call => call[1])).toEqual([{ type: "queue.add", tracks }]);
  });

  it("plays the first appended entry when the server was idle", async () => {
    const idle = player(); idle.state.status = "stopped";
    receive({ type: "snapshot", player: idle, worker_instance: workerA, sequence: 1 });
    api.command.mockResolvedValueOnce(added("stopped", newEntry)).mockResolvedValueOnce({ player: player("lounge", 5) });
    expect(await session.join(tracks)).toBe(true);
    expect(api.command.mock.calls.map(call => call[1])).toEqual([{ type: "queue.add", tracks }, { type: "play", entry_id: newEntry }]);
  });

  it("reports the join even while playback awaits a speaker confirm", async () => {
    const idle = player(); idle.state.current_entry_id = null;
    receive({ type: "snapshot", player: idle, worker_instance: workerA, sequence: 1 });
    api.command.mockResolvedValueOnce(added("stopped", newEntry)).mockRejectedValueOnce(failure("AVAILABILITY_UNKNOWN"));
    expect(await session.join(tracks)).toBe(true);
    expect(session.getSnapshot().acknowledgement?.command).toEqual({ type: "play", entry_id: newEntry });
  });

  it("fails without sending anything for no tracks, a failed append or a closed session", async () => {
    expect(await session.join([])).toBe(false);
    snapshot(); api.command.mockRejectedValueOnce(new Error("offline"));
    expect(await session.join(tracks)).toBe(false);
    expect(api.command).toHaveBeenCalledTimes(1);
    const waiting = new ServerPlayerSession("aswitch", api); waiting.start();
    const pending = waiting.join(tracks); waiting.close();
    expect(await pending).toBe(false); expect(await waiting.ready()).toBe(false);
  });

  it("classifies idle and live sessions", () => {
    const p = player();
    expect([isIdle(p), isLive(p)]).toEqual([false, true]);
    p.state.status = "ended"; expect([isIdle(p), isLive(p)]).toEqual([true, false]);
    p.state.status = "playing"; p.state.current_entry_id = null; expect(isIdle(p)).toBe(true);
  });
});

describe("server volume", () => {
  it("sends the latest value once an in-flight command finishes, and skips an unchanged volume", async () => {
    snapshot(); let resolve!: (result: { player: ReturnType<typeof player> }) => void;
    api.command.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = session.command({ type: "pause" });
    session.setVolume(40); session.setVolume(45);
    expect(api.command).toHaveBeenCalledTimes(1);
    resolve({ player: player("lounge", 4) }); await pending; await Promise.resolve();
    expect(api.command.mock.calls.map(call => call[1])).toEqual([{ type: "pause" }, { type: "volume", volume: 45 }]);
    session.setVolume(30); await Promise.resolve();
    expect(api.command).toHaveBeenCalledTimes(2);
  });

  it("clears a passing problem, and a dismissed confirm takes its rejection with it", async () => {
    snapshot(); api.command.mockRejectedValueOnce(failure("AVAILABILITY_UNKNOWN"));
    await session.command({ type: "play" });
    expect(session.getSnapshot().problem).toBe("AVAILABILITY_UNKNOWN");
    session.dismissAcknowledgement(); expect(session.getSnapshot().problem).toBeNull();
    await session.command({ type: "pause" }); session.close(); session.start();
    await session.command({ type: "pause" }); expect(session.getSnapshot().problem).toContain("fresh server snapshot");
    session.dismissProblem(); expect(session.getSnapshot().problem).toBeNull();
  });
});

describe("Play here and joining rules", () => {
  it("sends the current track onward, nothing already played, and nothing after a finished queue", () => {
    expect(upcomingTracks({ playlist: ["a", "b", "c"], currentTrackIndex: 1, finishedTrack: null })).toEqual(["b", "c"]);
    expect(upcomingTracks({ playlist: ["a", "b"], currentTrackIndex: null, finishedTrack: null })).toEqual(["a", "b"]);
    expect(upcomingTracks({ playlist: ["a", "b"], currentTrackIndex: null, finishedTrack: "b" })).toEqual([]);
  });

  it("plays here without sending the server a command", async () => {
    snapshot(); session.playHere();
    expect(api.command).not.toHaveBeenCalled();
    expect(await session.ready()).toBe(false);
    await session.command({ type: "pause" });
    expect(api.command).not.toHaveBeenCalled();
  });
});

describe("session options", () => {
  it("reconnects on the configured delay and words the problem from what ended the stream", async () => {
    session.close();
    const lost = vi.fn();
    session = new ServerPlayerSession("lounge", api, { reconnectMs: 1000, disconnectMessage: reason => `lost: ${String(reason)}`, onDisconnect: lost });
    session.start(); snapshot();
    disconnect("offline");
    expect(session.getSnapshot().problem).toBe("lost: offline");
    expect(lost).toHaveBeenCalledExactlyOnceWith("offline");
    await vi.advanceTimersByTimeAsync(999); expect(api.subscribe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(api.subscribe).toHaveBeenCalledTimes(3);
    snapshot(3, 1, workerB); expect(session.getSnapshot().problem).toBeNull();
  });

  it("leaves the outputs alone when asked not to fetch them", async () => {
    session.close();
    session = new ServerPlayerSession("lounge", api, { devices: false });
    session.start(); snapshot(); await session.refresh();
    await session.command({ type: "pause" });
    expect(api.devices).not.toHaveBeenCalled();
    expect(session.getSnapshot().devices).toEqual([]);
  });

  it("observes without marking a held view disconnected", async () => {
    snapshot(); session.close();
    const stop = session.observe();
    expect(session.getSnapshot().connected).toBe(true);
    expect(api.subscribe).toHaveBeenCalledTimes(2);
    stop(); disconnect(); await vi.advanceTimersByTimeAsync(2000);
    expect(api.subscribe).toHaveBeenCalledTimes(2);
  });
});

describe("one-shot load and strict execution", () => {
  it("loads once as proof of connection, never replacing a newer player, and refuses once closed", async () => {
    api.get.mockResolvedValueOnce(player("lounge", 5));
    expect((await session.load()).revision).toBe(5);
    expect(session.getSnapshot().connected).toBe(true);
    api.get.mockResolvedValueOnce(player("lounge", 2));
    expect((await session.load()).revision).toBe(5);
    session.close();
    await expect(session.load()).rejects.toThrow("closed");
  });

  it("returns the whole result with the revision it was given, and clears busy", async () => {
    await session.load();
    const transfer = { from_player: player("aswitch"), detached: true, attached: true, error: null };
    api.command.mockResolvedValueOnce({ player: player("lounge", 4), transfer });
    const states: boolean[] = []; session.subscribe(() => states.push(session.getSnapshot().busy));
    const result = await session.execute({ type: "pause" }, 3);
    expect(result.transfer).toEqual(transfer);
    expect(api.command).toHaveBeenCalledWith("lounge", { type: "pause", expected_revision: 3 });
    expect(session.getSnapshot()).toMatchObject({ busy: false, player: { revision: 4 } });
    expect(states).toContain(true);
  });

  it("throws what the transport threw after a fresh load, and never replays", async () => {
    await session.load();
    api.command.mockRejectedValueOnce(new Error("REVISION_CONFLICT")); api.get.mockResolvedValueOnce(player("lounge", 9));
    await expect(session.execute({ type: "next" }, 3)).rejects.toThrow("REVISION_CONFLICT");
    expect(api.command).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({ connected: true, busy: false, player: { revision: 9 } });
  });

  it("marks the session disconnected when the fresh load fails too", async () => {
    await session.load();
    api.command.mockRejectedValueOnce(new Error("timeout")); api.get.mockRejectedValueOnce(new Error("unreachable"));
    await expect(session.execute({ type: "next" }, 3)).rejects.toThrow("timeout");
    expect(session.getSnapshot().connected).toBe(false);
  });

  it("throws closed when the session ends mid-command, leaving the busy flag alone", async () => {
    await session.load();
    let resolve!: (result: { player: ReturnType<typeof player> }) => void;
    api.command.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = session.execute({ type: "pause" }, 3);
    session.close(); resolve({ player: player("lounge", 4) });
    await expect(pending).rejects.toThrow("closed");
    expect(session.getSnapshot().busy).toBe(true);
  });
});
