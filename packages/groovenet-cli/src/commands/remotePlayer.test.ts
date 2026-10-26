import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroovenetClient, Track } from "@groovenet/client";
import type { ServerPlayer, ServerPlayerCommandInput } from "@groovenet/contracts";
import { RemotePlayerController, formatRemoteDevice, makeRemoteApi } from "./remotePlayer.js";

vi.mock("@groovenet/client", async (original) => ({ ...await original<typeof import("@groovenet/client")>(), loadConfig: () => ({ api_base: "http://example/api", api_key: "collection", player_api_key: "household" }) }));

export const entry = { id: "00000000-0000-4000-8000-000000000001", track_id: "track", friend_id: 1, title: "Song", artist: "Artist" };
export function player(): ServerPlayer {
  return { id: "lounge", name: "Lounge", engine_id: "primary", revision: 3, assigned_output: "speaker", state: {
    queue: [entry, { ...entry, id: "00000000-0000-4000-8000-000000000002" }], current_entry_id: entry.id,
    status: "playing", position: 10, duration: 120, volume: 50, desired_output: "speaker", checkpoint: false, error: null,
  } };
}
function setup() {
  const state = player();
  const api = {
    getServerPlayer: vi.fn(async () => state),
    commandServerPlayer: vi.fn(async (_id: string, command: ServerPlayerCommandInput) => ({ player: { ...state, revision: command.expected_revision! + 1 } })),
    searchTracks: vi.fn(async () => ({ tracks: [entry] })),
    getPlaylistTracks: vi.fn(async () => ({ track_refs: [entry] })),
    listServerPlayerDevices: vi.fn(async () => [{ id: "speaker", name: "Room", assigned_player_id: "other", desired_by: ["other"], observed: { availability: "unknown", sender_identity: "unknown" } }]),
    serverPlayerEvents: vi.fn(),
  };
  const control = new RemotePlayerController(api as unknown as GroovenetClient, "lounge");
  return { state, api, control };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("remote controller", () => {
  it("loads independent queue entries and requested state", async () => {
    const { control } = setup();
    const snapshot = await control.refresh();
    expect(snapshot.current?.id).toBe(entry.id);
    expect(snapshot.queue).toHaveLength(2);
    expect(snapshot.remote.player.id).toBe("lounge");
    expect(await control.request("queue.list")).toEqual(snapshot.queue);
    expect(await control.request("devices")).toEqual([expect.objectContaining({ name: expect.stringContaining("activity=unknown") })]);
    await control.close();
  });

  it.each([
    ["play", {}, { type: "play" }], ["play", { index: 1 }, { type: "play", entry_id: "00000000-0000-4000-8000-000000000002" }],
    ["play", { id: entry.id }, { type: "play", entry_id: entry.id }],
    ["pause", {}, { type: "pause" }], ["resume", { allow_unknown: true }, { type: "resume", allow_unknown: true }],
    ["next", { takeover: true }, { type: "next", takeover: true }], ["prev", {}, { type: "previous" }],
    ["seek", { seconds: 42 }, { type: "seek", seconds: 42 }], ["volume", { volume: 60 }, { type: "volume", volume: 60 }],
    ["stop", {}, { type: "stop" }], ["shutdown", {}, { type: "stop" }], ["queue.clear", {}, { type: "queue.clear" }],
    ["queue.remove", { id: entry.id }, { type: "queue.remove", entry_id: entry.id }],
    ["queue.move", { id: entry.id, to: 1 }, { type: "queue.move", entry_id: entry.id, to: 1 }],
    ["devices.select", { id: "speaker" }, { type: "output.select", output_id: "speaker" }],
    ["queue.addTrack", { track: entry as unknown as Track }, { type: "queue.add", tracks: [{ track_id: "track", friend_id: 1 }] }],
    ["queue.add", { playlistId: "7" }, { type: "queue.add", tracks: [{ track_id: "track", friend_id: 1 }] }],
    ["queue.add", { query: "Song" }, { type: "queue.add", tracks: [{ track_id: "track", friend_id: 1 }] }],
  ])("maps %s through the revisioned API", async (method, params, expected) => {
    const { api, control } = setup();
    await control.request(method, params);
    expect(api.commandServerPlayer).toHaveBeenCalledWith("lounge", { ...expected, expected_revision: 3 });
    await control.request("pause");
    expect(api.commandServerPlayer).toHaveBeenLastCalledWith("lounge", { type: "pause", expected_revision: 4 });
    await control.close();
  });

  it("rejects missing entries and unsupported commands without side effects", async () => {
    const { api, control } = setup();
    for (const [method, params] of [["play", { index: 99 }], ["queue.remove", { id: "gone" }], ["queue.move", {}], ["queue.add", {}], ["queue.add", { query: " " }], ["wat", {}]] as const) {
      await expect(control.request(method, params)).rejects.toThrow();
    }
    expect(api.commandServerPlayer).not.toHaveBeenCalled();
  });

  it("refreshes conflicts without retrying, and fences double submissions", async () => {
    const { api, control, state } = setup();
    await control.refresh();
    let reject!: (error: Error) => void;
    api.commandServerPlayer.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const command = control.request("next");
    await expect(control.request("pause")).rejects.toThrow("already in progress");
    api.getServerPlayer.mockResolvedValue({ ...state, revision: 9 });
    reject(new Error("REVISION_CONFLICT"));
    await expect(command).rejects.toThrow("REVISION_CONFLICT");
    expect(api.commandServerPlayer).toHaveBeenCalledTimes(1);
    await control.request("pause");
    expect(api.commandServerPlayer).toHaveBeenLastCalledWith("lounge", { type: "pause", expected_revision: 9 });
  });

  it("reports partial transfers despite HTTP success and refreshes both revisions", async () => {
    const { api, control, state } = setup();
    api.getServerPlayer.mockImplementation(async (id?: string) => ({ ...state, id: id ?? "lounge", revision: id === "other" ? 12 : 3 }));
    api.commandServerPlayer.mockResolvedValueOnce({ player: { ...state, revision: 4 }, transfer: { detached: true, attached: false, from_player: state, error: { code: "DEVICE_BUSY", message: "occupied" } } } as never);
    await expect(control.request("devices.transfer", { id: "speaker", takeover: true })).rejects.toThrow("detached=true, attached=false. DEVICE_BUSY: occupied");
    expect(api.commandServerPlayer).toHaveBeenCalledWith("lounge", { type: "output.transfer", expected_revision: 3, from_player_id: "other", from_revision: 12, output_id: "speaker", play: true, takeover: true });
    api.commandServerPlayer.mockResolvedValueOnce({ player: state, transfer: { detached: true, attached: true, from_player: state, error: null } } as never);
    await control.request("devices.transfer", { id: "speaker", allow_unknown: true });
    api.listServerPlayerDevices.mockResolvedValueOnce([]);
    await expect(control.request("devices.transfer", { id: "speaker" })).rejects.toThrow("no other Groovenet owner");
  });

  it("marks ambiguous errors disconnected when refresh fails; close never stops audio", async () => {
    const { api, control } = setup();
    await control.refresh();
    api.commandServerPlayer.mockRejectedValueOnce(new Error("timeout"));
    api.getServerPlayer.mockRejectedValue(new Error("unreachable"));
    await expect(control.request("next")).rejects.toThrow("timeout");
    await expect(control.request("next")).rejects.toThrow("disconnected");
    await control.close();
    expect(api.commandServerPlayer).toHaveBeenCalledTimes(1);
    await expect(control.request("play")).rejects.toThrow("closed");
    control.startEvents();
    expect(api.serverPlayerEvents).not.toHaveBeenCalled();
  });

  it("uses only matching ordered events and a fresh snapshot after reconnect", async () => {
    vi.useFakeTimers();
    const { api, control, state } = setup();
    await control.refresh();
    const worker = "worker-a";
    const snapshot = (sequence: number, revision = 3, worker_instance = worker) => ({ type: "snapshot", player: { ...state, revision }, sequence, worker_instance });
    const tick = (sequence: number, overrides = {}) => ({ type: "position", player_id: "lounge", revision: 3, current_entry_id: entry.id, position: 45, duration: 120, worker_instance: worker, sequence, ...overrides });
    let release!: () => void;
    api.serverPlayerEvents.mockImplementationOnce(async function* () {
      yield tick(0); // no snapshot yet
      yield snapshot(1);
      yield tick(2, { player_id: "other" });
      yield tick(3, { revision: 2 });
      yield tick(4, { current_entry_id: "old" });
      yield tick(5, { worker_instance: "old-worker" });
      yield tick(6);
      yield tick(5, { position: 1 });
      yield snapshot(7, 2);
      yield { ...snapshot(8), player: { ...state, id: "other" } };
      await new Promise<void>((resolve) => { release = resolve; });
    });
    const states: unknown[] = [];
    control.on("event", (event) => { if (event.event === "state") states.push(event.data); });
    control.startEvents();
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({ position: 45 });
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({ remote: { connected: false } });
    await expect(control.request("pause")).rejects.toThrow("disconnected");
    api.serverPlayerEvents.mockImplementationOnce(async function* () {
      yield tick(90, { worker_instance: "worker-b" });
      yield snapshot(1, 4, "worker-b");
      await new Promise(() => {});
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)).toMatchObject({ remote: { connected: true, player: { revision: 4 } } });
    await control.close();
    expect(api.commandServerPlayer).not.toHaveBeenCalled();
  });

  it("ignores delayed responses after close and renders idle observation", async () => {
    const { api, control, state } = setup();
    let resolve!: (state: ServerPlayer) => void;
    api.getServerPlayer.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = control.refresh();
    await control.close(); resolve(state);
    await expect(pending).rejects.toThrow("closed");
    expect(formatRemoteDevice({ id: "s", name: "Room", assigned_player_id: null, desired_by: [], observed: { availability: "idle", source: "unconfigured", observed_at: null, sender_identity: "unknown" } })).toContain("assigned=none · desired=none");
  });

  it("constructs the API with a separate environment/config key", () => {
    expect(makeRemoteApi()).toBeDefined();
    vi.stubEnv("PLAYER_API_KEY", "env-key");
    expect(makeRemoteApi()).toBeDefined();
  });
});

it("fences a closed in-flight command and ignores late stream events", async () => {
  const { control, api, state } = setup();
  await control.refresh();
  let resolve!: (result: { player: ServerPlayer }) => void;
  api.commandServerPlayer.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const pending = control.request("pause");
  await control.close(); resolve({ player: state });
  await expect(pending).rejects.toThrow("closed");
  const second = setup();
  let release!: () => void;
  second.api.serverPlayerEvents.mockImplementationOnce(async function* () {
    await new Promise<void>((resolve) => { release = resolve; });
    yield { type: "snapshot", player: state, worker_instance: "worker", sequence: 1 };
  });
  await second.control.refresh(); second.control.startEvents();
  const event = vi.fn(); second.control.on("event", event);
  await second.control.close(); release();
  await new Promise((resolve) => setImmediate(resolve));
  expect(event).not.toHaveBeenCalled();
});

it("keeps a newer command/event snapshot when an older refresh completes", async () => {
  const { control, api, state } = setup();
  await control.refresh();
  await control.request("pause");
  expect((await control.refresh()).remote.player.revision).toBe(4);
  api.commandServerPlayer.mockResolvedValueOnce({ player: state });
  await control.request("stop");
  expect((await control.refresh()).remote.player.revision).toBe(4);
  api.commandServerPlayer.mockResolvedValueOnce({ player: state, transfer: { detached: false, attached: false, error: null } } as never);
  await expect(control.request("devices.transfer", { id: "speaker" })).rejects.toThrow("INCOMPLETE: Transfer incomplete");
});

it("ignores a failed stream after close and reconnects after non-Error failures", async () => {
  vi.useFakeTimers();
  const { control, api } = setup();
  let reject!: (error: unknown) => void;
  api.serverPlayerEvents.mockImplementationOnce(async function* () { await new Promise((_resolve, fail) => { reject = fail; }); });
  control.startEvents();
  const events: unknown[] = []; control.on("event", (event) => events.push(event));
  reject("offline"); await vi.advanceTimersByTimeAsync(0);
  expect(events).toEqual([expect.objectContaining({ event: "error" })]);
  api.serverPlayerEvents.mockImplementationOnce(async function* () { await new Promise((_resolve, fail) => { reject = fail; }); });
  await vi.advanceTimersByTimeAsync(1000);
  await control.close(); reject(new Error("cancelled"));
  await vi.advanceTimersByTimeAsync(0);
  expect(api.serverPlayerEvents).toHaveBeenCalledTimes(2);
});


it("does not reconnect when a stream ends as the controller closes", async () => {
  vi.useFakeTimers();
  const { control, api } = setup();
  let release!: () => void;
  api.serverPlayerEvents.mockImplementationOnce(async function* () { await new Promise<void>((resolve) => { release = resolve; }); });
  await control.refresh(); control.startEvents();
  await control.close(); release();
  await vi.advanceTimersByTimeAsync(2000);
  expect(api.serverPlayerEvents).toHaveBeenCalledOnce();
});

it("formats mapped entity and sender engine diagnostics", () => {
  expect(formatRemoteDevice({ id: "s", name: "Room", assigned_player_id: "a", desired_by: ["a"], observed: { availability: "occupied", source: "home_assistant", observed_at: "now", entity_id: "media_player.room", sender_identity: "groovenet", sender_engine_id: "primary" } })).toContain("entity=media_player.room · sender=groovenet(primary) · observed=now");
});
