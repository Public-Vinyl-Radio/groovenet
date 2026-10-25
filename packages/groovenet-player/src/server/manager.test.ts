import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { ServerPlayer, ServerPlayerCommand, ServerPlayerState, SpeakerObservation } from "@groovenet/contracts";
import type { PlaybackBackend, PlaybackSource } from "../types.js";
import type { Track } from "@groovenet/client";
import { ServerPlayerManager, unknownSpeaker } from "./manager.js";
import { ServerPlayerError, type PlayerStore } from "./store.js";
import { OwnToneBackend } from "../ownToneBackend.js";
import { PlayerError } from "../types.js";

class FakeBackend extends EventEmitter implements PlaybackBackend {
  load = vi.fn(async (_source: PlaybackSource) => { void _source; });
  pause = vi.fn(async (_paused: boolean) => { void _paused; });
  seek = vi.fn(async (_seconds: number) => { void _seconds; });
  setVolume = vi.fn(async (_volume: number) => { void _volume; });
  listDevices = vi.fn(async () => [{ id: "speaker-a", name: "A" }, { id: "speaker-b", name: "B" }]);
  outputConnection = vi.fn<() => Promise<"connected" | "disconnected" | "unknown">>(async () => "connected");
  setOutputDevice = vi.fn(async (_id: string) => { void _id; });
  close = vi.fn(async () => {});
}
class MemoryStore implements PlayerStore {
  rows = new Map<string, ServerPlayer>();
  tracks = new Map([1, 2, 3].map((id) => [String(id), { track_id: String(id), friend_id: 1, title: `Track ${id}`, artist: "Artist", local_audio_url: `${id}.wav` } as Track]));
  list = vi.fn(async () => structuredClone([...this.rows.values()]));
  create = vi.fn(async (input: { id: string; name: string; engine_id: string }, state: ServerPlayerState) => {
    if ([...this.rows.values()].some(p => p.id === input.id || p.engine_id === input.engine_id)) throw new ServerPlayerError("ASSIGNMENT_CONFLICT", "Already exists");
    const row = { ...input, state, revision: 0, assigned_output: null };
    this.rows.set(row.id, structuredClone(row));
    return structuredClone(row);
  });
  save = vi.fn(async (input: ServerPlayer, revision: number) => {
    if (this.rows.get(input.id)?.revision !== revision) throw new ServerPlayerError("REVISION_CONFLICT", "Changed");
    if (input.assigned_output && [...this.rows.values()].some(p => p.id !== input.id && p.assigned_output === input.assigned_output)) throw new ServerPlayerError("ASSIGNMENT_CONFLICT", "Assigned");
    const row = { ...structuredClone(input), revision: revision + 1 };
    this.rows.set(row.id, structuredClone(row));
    return row;
  });
  checkpoint = vi.fn(async (input: ServerPlayer) => { if (this.rows.get(input.id)?.revision === input.revision) this.rows.set(input.id, structuredClone(input)); });
  resolve = vi.fn(async (ref: { track_id: string }) => this.tracks.get(ref.track_id) ?? null);
}
async function fixture(observed: SpeakerObservation = unknownSpeaker()) {
  const store = new MemoryStore();
  const backends: FakeBackend[] = [];
  const create = vi.fn(() => { const backend = new FakeBackend(); backends.push(backend); return backend; });
  const observer = vi.fn(async () => observed);
  const manager = new ServerPlayerManager(store, { a: { libraryRoot: "/media", create }, b: { libraryRoot: "/media", create } }, observer);
  const fault = vi.fn();
  manager.on("fault", fault);
  await manager.initialize();
  for (const id of ["a", "b"]) await manager.create({ id, name: id.toUpperCase(), engine_id: id });
  const command = (id: string, value: Omit<ServerPlayerCommand, "expected_revision"> | Record<string, unknown>) => manager.command(id, { ...value, expected_revision: manager.get(id).revision } as ServerPlayerCommand);
  const prepare = async (id: string, output = `speaker-${id}`) => {
    await command(id, { type: "queue.add", tracks: [{ track_id: "1", friend_id: 1 }, { track_id: "2", friend_id: 1 }] });
    await command(id, { type: "output.select", output_id: output });
  };
  // A read-only queued command is unnecessary; settle callback microtasks.
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { store, backends, create, observer, manager, fault, command, prepare, settle };
}

describe("persistent server player manager", () => {
  it("restores independent checkpoints without contacting engines or claiming outputs", async () => {
    const f = await fixture();
    await f.prepare("a"); await f.prepare("b");
    await f.command("a", { type: "play", allow_unknown: true });
    f.backends[0]!.emit("position", 12, 100);
    await f.settle();
    await f.manager.shutdown();
    const create = vi.fn(() => new FakeBackend());
    const restored = new ServerPlayerManager(f.store, { a: { libraryRoot: "/media", create }, b: { libraryRoot: "/media", create } });
    await restored.initialize();
    expect(create).not.toHaveBeenCalled();
    expect(restored.get("a").state).toMatchObject({ position: 12, status: "stopped", checkpoint: true });
    expect(restored.get("a").assigned_output).toBeNull();
    expect(restored.get("b").state.queue).toHaveLength(2);
    expect(restored.get("a").state.queue[0]!.id).not.toBe(restored.get("b").state.queue[0]!.id);
  });

  it("requires an explicit acknowledgement of unknown or occupied observations", async () => {
    const f = await fixture(); await f.prepare("a");
    await expect(f.command("a", { type: "play" })).rejects.toMatchObject({ code: "AVAILABILITY_UNKNOWN" });
    expect(f.create).not.toHaveBeenCalled();
    const busy = await fixture({ availability: "occupied", source: "home_assistant", observed_at: "now", sender_identity: "unknown" });
    await busy.prepare("a");
    await expect(busy.command("a", { type: "play" })).rejects.toMatchObject({ code: "SPEAKER_OCCUPIED" });
    await busy.command("a", { type: "play", takeover: true });
    expect(busy.backends[0]!.load).toHaveBeenCalledWith({ url: "file:///media/1.wav" });
    await busy.manager.shutdown();
  });

  it("advances only the completed player's queue and discards duplicate old events", async () => {
    const f = await fixture(); await f.prepare("a"); await f.prepare("b");
    await f.command("a", { type: "play", allow_unknown: true });
    await f.command("b", { type: "play", allow_unknown: true });
    const old = f.backends[0]!;
    const other = f.manager.get("b");
    old.emit("ended"); old.emit("ended");
    await f.settle();
    const a = f.manager.get("a");
    expect(a.state.current_entry_id).toBe(a.state.queue[1]!.id);
    expect(a.state.status).toBe("playing");
    expect(f.backends).toHaveLength(3);
    expect(f.manager.get("b")).toEqual(other);
    // The durable pointer moves before the next engine starts.
    expect(f.store.rows.get("a")!.state.current_entry_id).toBe(a.state.queue[1]!.id);
    f.backends[2]!.emit("ended"); await f.settle();
    expect(f.manager.get("a").state.status).toBe("ended");
    expect(f.manager.get("b").state.status).toBe("playing");
    await f.manager.shutdown();
  });

  it("preserves current and next entries on external interruption", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "play", allow_unknown: true });
    const before = f.manager.get("a");
    f.backends[0]!.emit("error", Object.assign(new Error("Taken over"), { code: "PLAYBACK_INTERRUPTED" }));
    f.backends[0]!.emit("ended"); await f.settle();
    expect(f.manager.get("a")).toMatchObject({ assigned_output: null, state: { current_entry_id: before.state.current_entry_id, status: "error", queue: before.state.queue } });
    expect(f.backends).toHaveLength(1);
    await f.manager.shutdown();
  });

  it("rejects stale edits and prevents two players claiming one speaker", async () => {
    const f = await fixture(); await f.prepare("a"); await f.prepare("b", "speaker-a");
    await expect(f.manager.command("a", { type: "rename", name: "Changed", expected_revision: 0 })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await f.command("a", { type: "play", allow_unknown: true });
    await expect(f.command("b", { type: "play", allow_unknown: true })).rejects.toMatchObject({ code: "OUTPUT_ASSIGNED" });
    expect(f.create).toHaveBeenCalledTimes(1);
    await f.manager.shutdown();
  });

  it("explicitly transfers a speaker after detaching its old player", async () => {
    const f = await fixture(); await f.prepare("a"); await f.prepare("b");
    await f.command("a", { type: "play", allow_unknown: true });
    f.backends[0]!.emit("position", 9, 100); await f.settle();
    const result = await f.command("b", { type: "output.transfer", from_player_id: "a", from_revision: f.manager.get("a").revision, output_id: "speaker-a", play: true, allow_unknown: true });
    expect(result.transfer).toMatchObject({ detached: true, attached: true, error: null });
    expect(f.manager.get("a")).toMatchObject({ assigned_output: null, state: { status: "paused", position: 9 } });
    expect(f.manager.get("b")).toMatchObject({ assigned_output: "speaker-a", state: { status: "playing" } });
    expect(f.backends[0]!.close.mock.invocationCallOrder[0]).toBeLessThan(f.backends[1]!.load.mock.invocationCallOrder[0]!);
    await f.manager.shutdown();
  });

  it("reports a partial transfer without reconnecting the detached source", async () => {
    const f = await fixture(); await f.prepare("a"); await f.prepare("b");
    await f.command("a", { type: "play", allow_unknown: true });
    f.store.tracks.clear();
    const result = await f.command("b", { type: "output.transfer", from_player_id: "a", from_revision: f.manager.get("a").revision, output_id: "speaker-a", play: true, allow_unknown: true });
    expect(result.transfer).toMatchObject({ detached: true, attached: false, error: { code: "NO_AUDIO" } });
    expect(f.backends).toHaveLength(1);
    expect(f.manager.get("a").assigned_output).toBeNull();
    await f.manager.shutdown();
  });

  it("persists position checkpoints without invalidating edit revisions", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "play", allow_unknown: true });
    const revision = f.manager.get("a").revision;
    f.backends[0]!.emit("position", 12, 100); await f.settle();
    expect(f.store.checkpoint).toHaveBeenCalledTimes(1);
    expect(f.manager.get("a").revision).toBe(revision);
    await f.command("a", { type: "pause" });
    await f.command("a", { type: "seek", seconds: 30 });
    await f.command("a", { type: "resume" });
    await f.command("a", { type: "volume", volume: 12 });
    expect(f.backends[0]!.seek).toHaveBeenCalledWith(30);
    expect(f.backends[0]!.setVolume).toHaveBeenLastCalledWith(12);
    await f.manager.shutdown();
  });
  it("supports queue edits, metadata changes, explicit next/previous and output reconfiguration", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "rename", name: "Lounge" });
    const first = f.manager.get("a").state.queue[0]!;
    await f.command("a", { type: "queue.move", entry_id: first.id, to: 1 });
    await f.command("a", { type: "queue.add", at: 0, tracks: [{ track_id: "3", friend_id: 1 }] });
    expect(f.manager.get("a").state.queue.map(e => e.track_id)).toEqual(["3", "2", "1"]);
    await f.command("a", { type: "play", allow_unknown: true });
    await f.command("a", { type: "next", allow_unknown: true });
    expect(f.manager.get("a").state.current_entry_id).toBe(f.manager.get("a").state.queue[1]!.id);
    await f.command("a", { type: "previous", allow_unknown: true });
    const active = f.manager.get("a").state.current_entry_id;
    await f.command("a", { type: "output.select", output_id: "speaker-b" });
    expect(f.manager.get("a")).toMatchObject({ assigned_output: null, state: { status: "paused", current_entry_id: active, desired_output: "speaker-b" } });
    await f.command("a", { type: "seek", seconds: 17 });
    await f.command("a", { type: "volume", volume: 25 });
    await f.command("a", { type: "resume", allow_unknown: true });
    expect(f.backends.at(-1)!.seek).toHaveBeenCalledWith(17);
    expect(f.backends.at(-1)!.setVolume).toHaveBeenCalledWith(25);
    await f.command("a", { type: "queue.remove", entry_id: active });
    expect(f.manager.get("a").state.status).toBe("stopped");
    await f.command("a", { type: "queue.remove", entry_id: first.id });
    await f.command("a", { type: "queue.clear" });
    expect(f.manager.get("a").state.queue).toEqual([]);
    await f.command("a", { type: "stop" });
    await f.manager.shutdown();
  });

  it("reports device assignments separately from desired outputs and observations", async () => {
    const f = await fixture(); await f.prepare("a"); await f.prepare("b", "speaker-a");
    await f.command("a", { type: "play", allow_unknown: true });
    const devices = await f.manager.devices("b");
    expect(devices[0]).toMatchObject({ assigned_player_id: "a", desired_by: ["a", "b"], observed: { availability: "unknown", sender_identity: "unknown" } });
    expect(f.backends[1]!.close).toHaveBeenCalledOnce();
    await f.manager.devices("a");
    expect(f.backends[0]!.close).not.toHaveBeenCalled();
    expect(f.manager.engineIds()).toEqual(["a", "b"]);
    const copy = f.manager.get("a"); copy.name = "Tampered";
    expect(f.manager.get("a").name).toBe("A");
    await f.manager.shutdown();
    await expect(f.command("a", { type: "pause" })).rejects.toMatchObject({ code: "WORKER_STOPPING" });
    await expect(f.manager.create({ id: "c", name: "C", engine_id: "c" })).rejects.toMatchObject({ code: "WORKER_STOPPING" });
  });

  it("rejects malformed queue operations, missing tracks and unknown players/engines without effects", async () => {
    const f = await fixture();
    expect(() => f.manager.get("missing")).toThrow(/does not exist/);
    await expect(f.manager.create({ id: "c", name: "C", engine_id: "missing" })).rejects.toMatchObject({ code: "ENGINE_NOT_CONFIGURED" });
    await expect(f.command("a", { type: "play", allow_unknown: true })).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
    await expect(f.command("a", { type: "seek", seconds: 1 })).rejects.toMatchObject({ code: "NO_CURRENT_TRACK" });
    await expect(f.command("a", { type: "pause" })).rejects.toMatchObject({ code: "PLAYER_INACTIVE" });
    await expect(f.command("a", { type: "resume" })).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
    await expect(f.command("a", { type: "queue.add", tracks: [{ track_id: "missing", friend_id: 1 }] })).rejects.toMatchObject({ code: "TRACK_NOT_FOUND" });
    await f.command("a", { type: "queue.add", tracks: [{ track_id: "1", friend_id: 1 }] });
    await expect(f.command("a", { type: "play", allow_unknown: true })).rejects.toMatchObject({ code: "OUTPUT_REQUIRED" });
    await expect(f.command("a", { type: "queue.add", at: 100, tracks: [{ track_id: "1", friend_id: 1 }] })).rejects.toMatchObject({ code: "INVALID_QUEUE" });
    await expect(f.command("a", { type: "queue.move", entry_id: f.manager.get("a").state.queue[0]!.id, to: 100 })).rejects.toMatchObject({ code: "INVALID_QUEUE" });
    await expect(f.command("a", { type: "queue.remove", entry_id: "00000000-0000-4000-8000-000000000001" })).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
    expect(f.create).not.toHaveBeenCalled();
  });

  it("ends an explicit next at the end of the queue and resumes restored checkpoints only on command", async () => {
    const f = await fixture(); await f.prepare("a");
    const last = f.manager.get("a").state.queue[1]!.id;
    await f.command("a", { type: "play", entry_id: last, allow_unknown: true });
    await f.command("a", { type: "next", allow_unknown: true });
    expect(f.manager.get("a").state.status).toBe("ended");
    await f.manager.shutdown();
  });

  it("does not replay a completed entry if resolving the next track fails", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "play", allow_unknown: true });
    f.store.tracks.delete("2");
    f.backends[0]!.emit("ended"); await f.settle();
    const current = f.manager.get("a");
    expect(current.state.current_entry_id).toBe(current.state.queue[1]!.id);
    expect(current.state.status).toBe("error");
    expect(f.store.rows.get("a")!.state.current_entry_id).toBe(current.state.current_entry_id);
    expect(f.backends).toHaveLength(1);
    await f.manager.shutdown();
  });

  it("reports uncertain detach without assigning the speaker twice", async () => {
    const f = await fixture(); await f.prepare("a"); await f.prepare("b");
    await f.command("a", { type: "play", allow_unknown: true });
    f.backends[0]!.close.mockRejectedValue(new Error("offline"));
    const transfer = await f.command("b", { type: "output.transfer", from_player_id: "a", from_revision: f.manager.get("a").revision, output_id: "speaker-a", play: true, allow_unknown: true });
    expect(transfer.transfer).toMatchObject({ detached: false, attached: false, error: { code: "PLAYER_OPERATION_FAILED" } });
    expect(f.manager.get("a").assigned_output).toBe("speaker-a");
    await expect(f.command("a", { type: "stop" })).rejects.toMatchObject({ code: "RELEASE_UNCERTAIN" });
    expect(f.backends).toHaveLength(1);
    await f.manager.shutdown();
    expect(f.fault).toHaveBeenCalled();
  });

  it("requires a fresh occupancy decision when a paused engine released transport", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "play", allow_unknown: true });
    await f.command("a", { type: "pause" });
    f.backends[0]!.outputConnection.mockResolvedValue("disconnected");
    await expect(f.command("a", { type: "resume" })).rejects.toMatchObject({ code: "AVAILABILITY_UNKNOWN" });
    f.observer.mockResolvedValue({ availability: "occupied", observed_at: "now", source: "home_assistant", sender_identity: "unknown" });
    await expect(f.command("a", { type: "resume", allow_unknown: true })).rejects.toMatchObject({ code: "SPEAKER_OCCUPIED" });
    await f.command("a", { type: "resume", takeover: true });
    expect(f.backends[0]!.pause).toHaveBeenLastCalledWith(false);
    expect(f.backends[0]!.load).toHaveBeenCalledTimes(1);
    await f.manager.shutdown();
  });

  it("persists engine command failures without exposing unexpected internal errors", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "play", allow_unknown: true });
    f.backends[0]!.pause.mockRejectedValueOnce(new Error("secret internal address"));
    await expect(f.command("a", { type: "pause" })).rejects.toThrow("secret internal address");
    expect(f.manager.get("a").state.error).toEqual({ code: "PLAYER_OPERATION_FAILED", message: "Player operation failed" });
    await f.manager.shutdown();
  });

  it("records a load failure without advancing and cleans up its attempted engine", async () => {
    const f = await fixture(); await f.prepare("a");
    f.create.mockImplementationOnce(() => {
      const backend = new FakeBackend();
      backend.load.mockRejectedValue(new Error("load failed"));
      f.backends.push(backend); return backend;
    });
    await expect(f.command("a", { type: "play", allow_unknown: true })).rejects.toThrow("load failed");
    expect(f.manager.get("a").state.status).toBe("error");
    expect(f.manager.get("a").state.current_entry_id).toBe(f.manager.get("a").state.queue[0]!.id);
    expect(f.backends[0]!.close).toHaveBeenCalledOnce();
    await f.manager.shutdown();
  });

  it("emits a fatal persistence fault if checkpoint recovery cannot be saved", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "play", allow_unknown: true });
    f.store.checkpoint.mockRejectedValue(new Error("DB unavailable"));
    f.store.save.mockRejectedValue(new Error("DB unavailable"));
    f.backends[0]!.emit("position", 3, 100);
    await f.settle(); expect(f.fault).toHaveBeenCalledOnce();
  });

  it("ignores invalid positions, throttles checkpoints and clears invalid duration", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "play", allow_unknown: true });
    const backend = f.backends[0]!;
    backend.emit("position", -1, 100); backend.emit("position", NaN, 100);
    await f.settle(); expect(f.manager.get("a").state.position).toBe(0);
    backend.emit("position", 1, null); backend.emit("position", 2, Infinity);
    backend.emit("position", 3, -1); await f.settle();
    expect(f.manager.get("a").state).toMatchObject({ position: 3, duration: null });
    expect(f.store.checkpoint).toHaveBeenCalledOnce();
    await f.manager.shutdown();
    backend.emit("ended"); await f.settle();
    expect(f.backends).toHaveLength(1);
  });

  it("rechecks occupancy before replaying a paused player with no connected transport", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "play", allow_unknown: true });
    await f.command("a", { type: "pause" });
    f.backends[0]!.outputConnection.mockResolvedValue("unknown");
    await expect(f.command("a", { type: "play" })).rejects.toMatchObject({ code: "AVAILABILITY_UNKNOWN" });
    f.observer.mockResolvedValue({ availability: "idle", observed_at: "now", source: "home_assistant", sender_identity: "unknown" });
    await f.command("a", { type: "play" });
    expect(f.backends).toHaveLength(2);
    await f.manager.shutdown();
  });

  it("preserves typed engine errors and uncertain claims after failed error cleanup", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "play", allow_unknown: true });
    f.backends[0]!.close.mockRejectedValue(new Error("offline"));
    f.backends[0]!.emit("error", new PlayerError("PLAYBACK_INTERRUPTED", "AirPlay interrupted"));
    await f.settle();
    expect(f.manager.get("a")).toMatchObject({ assigned_output: "speaker-a", state: { error: { code: "PLAYBACK_INTERRUPTED" } } });
    await f.manager.shutdown();
  });

  it("rejects invalid transfers before detaching and supports selecting without playback", async () => {
    const f = await fixture(); await f.prepare("a"); await f.prepare("b");
    const base = { type: "output.transfer", from_player_id: "a", from_revision: f.manager.get("a").revision, output_id: "speaker-a" };
    await expect(f.command("a", base)).rejects.toMatchObject({ code: "INVALID_TRANSFER" });
    await expect(f.command("b", base)).rejects.toMatchObject({ code: "OUTPUT_NOT_ASSIGNED" });
    await f.command("a", { type: "play", allow_unknown: true });
    await expect(f.command("b", base)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await f.command("b", { type: "play", allow_unknown: true });
    const result = await f.command("b", { ...base, from_revision: f.manager.get("a").revision, play: false });
    expect(result.transfer).toMatchObject({ detached: true, attached: false, error: null });
    expect(result.player).toMatchObject({ assigned_output: null, state: { desired_output: "speaker-a", status: "paused" } });
    expect(f.backends.every(backend => backend.close.mock.calls.length === 1)).toBe(true);
    await f.manager.shutdown();
  });

  it("retains the source's uncertain claim even when saving the transfer failure also fails", async () => {
    const f = await fixture(); await f.prepare("a"); await f.prepare("b");
    await f.command("a", { type: "play", allow_unknown: true });
    f.backends[0]!.close.mockRejectedValue(new Error("offline"));
    f.store.save.mockRejectedValue(new Error("DB offline"));
    const result = await f.command("b", { type: "output.transfer", from_player_id: "a", from_revision: f.manager.get("a").revision, output_id: "speaker-a" });
    expect(result.transfer).toMatchObject({ detached: false, attached: false });
    expect(result.transfer!.from_player.assigned_output).toBe("speaker-a");
    await f.manager.shutdown();
  });

  it("restores removed engines as stopped checkpoints but refuses to access them", async () => {
    const f = await fixture(); await f.prepare("a");
    const restored = new ServerPlayerManager(f.store, {});
    await restored.initialize();
    await expect(restored.devices("a")).rejects.toMatchObject({ code: "ENGINE_NOT_CONFIGURED" });
    // Exercise the unconfigured default observer through a restored player.
    const defaults = new ServerPlayerManager(f.store, { a: { libraryRoot: "/media", create: () => new FakeBackend() } });
    await defaults.initialize();
    expect((await defaults.devices("a"))[0]!.observed.availability).toBe("unknown");
  });

  it("keeps the playback error visible through queue/settings edits and clears it on successful replay", async () => {
    const f = await fixture(); await f.prepare("a");
    await f.command("a", { type: "play", allow_unknown: true });
    const failure = new PlayerError("PLAYBACK_INTERRUPTED", "Receiver output lost; explicitly play again when ready");
    f.backends[0]!.emit("error", failure); await f.settle();
    const entry = f.manager.get("a").state.current_entry_id;
    for (const command of [
      { type: "rename", name: "Renamed" },
      { type: "queue.add", tracks: [{ track_id: "3", friend_id: 1 }] },
      { type: "queue.move", entry_id: entry, to: 1 },
      { type: "queue.remove", entry_id: f.manager.get("a").state.queue[1]!.id },
      { type: "volume", volume: 20 }, { type: "seek", seconds: 10 },
      { type: "output.select", output_id: "speaker-a" },
    ]) {
      await f.command("a", command);
      expect(f.manager.get("a").state).toMatchObject({ status: "error", error: { code: failure.code, message: failure.message } });
    }
    await expect(f.command("a", { type: "queue.remove", entry_id: "00000000-0000-4000-8000-000000000001" })).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
    expect(f.manager.get("a").state.error?.code).toBe("PLAYBACK_INTERRUPTED");
    await f.command("a", { type: "play", allow_unknown: true });
    expect(f.manager.get("a").state).toMatchObject({ status: "playing", error: null });
    await f.manager.shutdown();
  });

  it.each(["stop", "queue.clear", "remove current"])("clears an old playback error after explicit %s succeeds", async (type) => {
    const f = await fixture(); await f.prepare("a"); await f.command("a", { type: "play", allow_unknown: true });
    f.backends[0]!.emit("error", new PlayerError("PLAYBACK_INTERRUPTED", "Lost output")); await f.settle();
    await f.command("a", type === "remove current" ? { type: "queue.remove", entry_id: f.manager.get("a").state.current_entry_id } : { type });
    expect(f.manager.get("a").state).toMatchObject({ status: "stopped", error: null });
    await f.manager.shutdown();
  });

  it.each([false, true])("recovers the real OwnTone output-loss sequence through the manager (cleanup failure=%s)", async (cleanupFails) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const terminal = { version: 1, instance: "a".repeat(32), sequence: 0, item_id: 0, reason: "none" };
    const status = { state: "stop", item_id: 0, item_progress_ms: 0, item_length_ms: 10000, groovenet_terminal: terminal };
    let queue = { version: 0, items: [] as { id: number; file_id: number }[] };
    let selected: string[] = [];
    let failStop = false;
    let nextId = 10;
    const writes: string[] = [];
    const transport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input)); const path = url.pathname.replace("/api/", "");
      if (init?.method !== "GET") writes.push(path);
      let data: unknown;
      if (path === "library/files") data = { tracks: { items: [{ id: 1, path: "/media/1.wav", data_kind: "file", length_ms: 10000 }] } };
      else if (path === "player") data = status;
      else if (path === "queue") data = queue;
      else if (path === "outputs") data = { outputs: [{ id: "speaker-a", name: "A", type: "AirPlay 2", selected: selected.includes("speaker-a"), connected: false }] };
      else if (path === "outputs/set") selected = JSON.parse(String(init!.body)).outputs;
      else if (path === "queue/items/add") { queue = { version: queue.version + 1, items: [{ id: nextId++, file_id: 1 }] }; status.item_id = queue.items[0]!.id; data = queue; }
      else if (path === "queue/clear") queue = { version: queue.version + 1, items: [] };
      else if (path === "player/play") status.state = "play";
      else if (path === "player/stop") { if (failStop) return new Response(null, { status: 503 }); status.state = "stop"; }
      return data === undefined ? new Response(null, { status: 204 }) : Response.json(data);
    });
    const store = new MemoryStore();
    const create = vi.fn((outputId?: string) => new OwnToneBackend({ apiUrl: "http://engine/api", outputId, fetch: transport }));
    const manager = new ServerPlayerManager(store, { a: { libraryRoot: "/media", create } });
    const command = (value: Record<string, unknown>) => manager.command("a", { ...value, expected_revision: manager.get("a").revision } as ServerPlayerCommand);
    try {
      await manager.initialize(); await manager.create({ id: "a", name: "A", engine_id: "a" });
      await command({ type: "queue.add", tracks: [{ track_id: "1", friend_id: 1 }, { track_id: "1", friend_id: 1 }] });
      await command({ type: "output.select", output_id: "speaker-a" });
      await command({ type: "play", allow_unknown: true });
      status.item_progress_ms = 2500;
      await vi.advanceTimersByTimeAsync(500);
      for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
      const before = manager.get("a"); const plays = writes.filter(path => path === "player/play").length;
      status.state = "pause"; terminal.sequence++; terminal.item_id = status.item_id; terminal.reason = "output_lost";
      failStop = cleanupFails;
      await vi.advanceTimersByTimeAsync(1000);
      for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
      const failed = manager.get("a");
      expect(failed.state).toMatchObject({ status: "error", position: before.state.position, current_entry_id: before.state.current_entry_id, queue: before.state.queue, error: { code: "PLAYBACK_INTERRUPTED" } });
      expect(writes.filter(path => path === "player/play")).toHaveLength(plays);
      await command({ type: "rename", name: "Still failed" });
      expect(manager.get("a").state.error?.code).toBe("PLAYBACK_INTERRUPTED");
      if (cleanupFails) {
        expect(failed.assigned_output).toBe("speaker-a"); expect(status.state).toBe("pause");
        await expect(command({ type: "play", allow_unknown: true })).rejects.toMatchObject({ code: "RELEASE_UNCERTAIN" });
        expect(writes.filter(path => path === "player/play")).toHaveLength(plays);
      } else {
        expect(failed.assigned_output).toBeNull(); expect(status.state).toBe("stop"); expect(selected).toEqual([]);
        await expect(command({ type: "play" })).rejects.toMatchObject({ code: "AVAILABILITY_UNKNOWN" });
        await command({ type: "play", allow_unknown: true });
        expect(manager.get("a").state).toMatchObject({ status: "playing", error: null, position: 2.5, current_entry_id: before.state.current_entry_id, queue: before.state.queue });
        expect(writes.filter(path => path === "player/play")).toHaveLength(plays + 1);
      }
    } finally { await manager.shutdown(); vi.useRealTimers(); }
  });

  it("requires a fresh availability acknowledgement after a control failure loses transport", async () => {
    const f = await fixture(); await f.prepare("a"); await f.command("a", { type: "play", allow_unknown: true });
    f.backends[0]!.pause.mockRejectedValueOnce(new PlayerError("PLAYBACK_INTERRUPTED", "Output lost"));
    f.backends[0]!.outputConnection.mockResolvedValue("disconnected");
    await expect(f.command("a", { type: "pause" })).rejects.toMatchObject({ code: "PLAYBACK_INTERRUPTED" });
    await expect(f.command("a", { type: "play" })).rejects.toMatchObject({ code: "AVAILABILITY_UNKNOWN" });
    expect(f.backends[0]!.close).not.toHaveBeenCalled();
    await f.command("a", { type: "play", allow_unknown: true });
    expect(f.backends[0]!.close).toHaveBeenCalledOnce();
    expect(f.manager.get("a").state).toMatchObject({ status: "playing", error: null });
    await f.manager.shutdown();
  });

});
