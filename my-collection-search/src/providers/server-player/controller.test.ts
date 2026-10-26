import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerPlayerController } from "./controller";
import { player, device, entryB, workerA, workerB } from "@/test/serverPlayerFixtures";
import type { playerApi } from "@/services/internalApi/players";

type Event = Parameters<typeof playerApi.subscribe>[1];
let receive: Event;
let disconnect: () => void;
const close = vi.fn();
const api = { list: vi.fn(), get: vi.fn(), devices: vi.fn(), command: vi.fn(), subscribe: vi.fn(), session: vi.fn(), unlock: vi.fn(), lock: vi.fn() };
let controller: ServerPlayerController;
const snapshot = (revision = 3, sequence = 1, worker_instance = workerA, id = "lounge") => receive({ type: "snapshot", player: player(id, revision), worker_instance, sequence });
const failure = (code: string) => Object.assign(new Error(code), { data: { code } });

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  api.devices.mockResolvedValue([device]); api.get.mockResolvedValue(player());
  api.subscribe.mockImplementation((_id, onEvent, onDisconnect) => { receive = onEvent; disconnect = onDisconnect; return close; });
  api.command.mockResolvedValue({ player: player("lounge", 4) });
  controller = new ServerPlayerController("lounge", api); controller.start();
});
afterEach(() => { controller.close(); vi.useRealTimers(); });
describe("remote player observations", () => {
  it("requires a first matching snapshot, fences identity, worker, revision, entry and sequence", async () => {
    const listener = vi.fn(); const off = controller.subscribe(listener);
    const position = { type: "position" as const, player_id: "lounge", revision: 3, current_entry_id: player().state.current_entry_id, position: 20, duration: null, observed_at: "now", worker_instance: workerA, sequence: 2 };
    receive(position); snapshot(3, 1, workerA, "aswitch"); expect(controller.getSnapshot().player).toBeNull();
    snapshot(); await Promise.resolve(); expect(controller.getSnapshot().devices).toEqual([device]);
    receive({ ...position, worker_instance: workerB }); snapshot(2, 2); snapshot(10, 1);
    expect(controller.getSnapshot().player?.revision).toBe(3);
    receive({ ...position, sequence: 3, player_id: "aswitch" }); receive({ ...position, sequence: 4, revision: 2 }); receive({ ...position, sequence: 5, current_entry_id: entryB });
    expect(controller.getSnapshot().player?.state.position).toBe(12);
    receive({ ...position, sequence: 6 }); expect(controller.getSnapshot().player?.state.position).toBe(20);
    snapshot(3, 7, workerA, "aswitch"); expect(controller.getSnapshot().player?.id).toBe("lounge");
    off(); const calls = listener.mock.calls.length; snapshot(4, 8); expect(listener).toHaveBeenCalledTimes(calls);
  });
  it("reconnects for a new snapshot and accepts stopped restart checkpoints with lower revisions", async () => {
    snapshot(); const oldReceive = receive; const oldDisconnect = disconnect;
    disconnect(); expect(controller.getSnapshot().connected).toBe(false);
    await controller.command({ type: "play" }); expect(api.command).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500); oldReceive({ type: "snapshot", player: player("lounge", 99), worker_instance: workerA, sequence: 99 }); oldDisconnect();
    snapshot(0, 0, workerB); expect(controller.getSnapshot().player?.revision).toBe(0);
    expect(api.command).not.toHaveBeenCalled(); expect(controller.getSnapshot().connected).toBe(true);
    controller.close(); snapshot(5, 8); disconnect(); await vi.advanceTimersByTimeAsync(2000);
    expect(api.subscribe).toHaveBeenCalledTimes(2);
  });
  it("retains a newer command revision across reconnects to the same worker", async () => {
    snapshot(); await controller.command({ type: "pause" }); disconnect(); await vi.advanceTimersByTimeAsync(1500);
    snapshot(3); expect(controller.getSnapshot().connected).toBe(false);
    snapshot(4, 2); expect(controller.getSnapshot().connected).toBe(true);
  });
  it("fences outstanding device and refresh responses after closing", async () => {
    let resolve!: (value: typeof device[]) => void;
    api.devices.mockReturnValueOnce(new Promise(done => { resolve = done; })); snapshot(); controller.close(); resolve([device]); await Promise.resolve();
    expect(controller.getSnapshot().devices).toEqual([]);
    api.get.mockResolvedValue(player("lounge", 99)); await controller.refresh(); expect(controller.getSnapshot().player?.revision).toBe(3);
    api.get.mockRejectedValue(new Error("offline")); await controller.refresh();
  });
  it("surfaces output failures and refresh failures, and does not lower revisions", async () => {
    api.devices.mockRejectedValueOnce(new Error("devices offline")); snapshot(); await Promise.resolve();
    expect(controller.getSnapshot().problem).toContain("devices offline");
    api.get.mockResolvedValue(player("lounge", 1)); await controller.refresh(); expect(controller.getSnapshot().player?.revision).toBe(3);
    api.get.mockRejectedValueOnce("offline"); await controller.refresh(); expect(controller.getSnapshot().problem).toContain("Player request failed");
  });
});
describe("shared player commands", () => {
  it("serializes commands, sends stable UUIDs without a revision, and rejects stale responses", async () => {
    snapshot(); let resolve!: (result: { player: ReturnType<typeof player> }) => void;
    api.command.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = controller.command({ type: "queue.remove", entry_id: entryB });
    await controller.command({ type: "next" }); expect(controller.getSnapshot().problem).toContain("in progress");
    snapshot(8, 4); resolve({ player: player("lounge", 4) }); await pending;
    expect(controller.getSnapshot().player?.revision).toBe(8);
    expect(api.command).toHaveBeenCalledExactlyOnceWith("lounge", { type: "queue.remove", entry_id: entryB });
    await controller.command({ type: "pause" }); expect(api.command.mock.lastCall?.[1]).toEqual({ type: "pause" });
  });
  it("lets two controllers act from the same snapshot and converge on the newer state", async () => {
    snapshot();
    const other = new ServerPlayerController("lounge", api); other.start();
    const receiveOther = receive; receiveOther({ type: "snapshot", player: player(), worker_instance: workerA, sequence: 1 });
    api.command.mockResolvedValueOnce({ player: player("lounge", 4) }).mockResolvedValueOnce({ player: player("lounge", 5) });
    await controller.command({ type: "pause" });
    await other.command({ type: "queue.remove", entry_id: entryB });
    expect(api.command.mock.calls.map(call => call[1])).toEqual([{ type: "pause" }, { type: "queue.remove", entry_id: entryB }]);
    receiveOther({ type: "snapshot", player: player("lounge", 5), worker_instance: workerA, sequence: 2 });
    expect(other.getSnapshot().player?.revision).toBe(5);
    expect(other.getSnapshot().problem).toBeNull();
    other.close();
  });
  it.each(["AVAILABILITY_UNKNOWN", "SPEAKER_OCCUPIED"])("requires an explicit acknowledgement for %s", async code => {
    snapshot(); api.command.mockRejectedValueOnce(failure(code)); await controller.command({ type: "play" });
    expect(controller.getSnapshot().acknowledgement).toEqual({ command: { type: "play" }, code, revision: 3 });
    await controller.acknowledge();
    expect(api.command.mock.lastCall?.[1]).toEqual({ type: "play", ...(code === "AVAILABILITY_UNKNOWN" ? { allow_unknown: true } : { takeover: true }) });
    controller.dismissAcknowledgement(); expect(controller.getSnapshot().acknowledgement).toBeNull();
  });
  it.each([null, { code: "ENGINE_FAILURE", message: "Failed attachment" }])("exposes partial HTTP 200 transfers (%s)", async error => {
    snapshot(); api.command.mockResolvedValueOnce({ player: player("lounge", 4), transfer: { from_player: player("aswitch"), detached: true, attached: false, error } });
    await controller.command({ type: "output.transfer", output_id: "speaker", from_player_id: "aswitch", from_revision: 3, play: true });
    expect(controller.getSnapshot().problem).toContain("partially completed");
  });
  it("treats deliberate non-playing transfers as complete and preserves playback failures through edits", async () => {
    const p = player("lounge", 4); p.state.error = { code: "FAIL", message: "Receiver lost" }; p.state.status = "error";
    snapshot(); api.command.mockResolvedValueOnce({ player: p, transfer: { from_player: player("aswitch"), detached: true, attached: false, error: null } });
    await controller.command({ type: "output.transfer", output_id: "speaker", from_player_id: "aswitch", from_revision: 3, play: false });
    expect(controller.getSnapshot().problem).toBeNull(); expect(controller.getSnapshot().player?.state.error?.code).toBe("FAIL");
  });
  it("fences command success and failure after a player subscription closes", async () => {
    snapshot(); let reject!: (error: Error) => void;
    api.command.mockReturnValueOnce(new Promise((_done, fail) => { reject = fail; })); const pending = controller.command({ type: "stop" });
    controller.close(); reject(new Error("offline")); expect(await pending).toBeNull();
    controller.start(); snapshot(); let resolve!: (value: { player: ReturnType<typeof player> }) => void;
    api.command.mockReturnValueOnce(new Promise(done => { resolve = done; })); const next = controller.command({ type: "play" });
    controller.close(); resolve({ player: player("lounge", 10) }); expect(await next).toBeNull();
  });
});

it("ignores device errors after disconnect and does not offer connect acknowledgements for queue edits", async () => {
  let reject!: (error: Error) => void;
  api.devices.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  snapshot(); controller.close(); reject(new Error("Late error")); await Promise.resolve();
  expect(controller.getSnapshot().problem).toBeNull();
  controller.start(); snapshot();
  api.command.mockRejectedValueOnce(failure("AVAILABILITY_UNKNOWN"));
  await controller.command({ type: "queue.clear" }); expect(controller.getSnapshot().acknowledgement).toBeNull();
});

it("fences an availability acknowledgement when another controller changes the player", async () => {
  await controller.acknowledge(); expect(api.command).not.toHaveBeenCalled();
  snapshot(); api.command.mockRejectedValueOnce(failure("AVAILABILITY_UNKNOWN"));
  await controller.command({ type: "play" }); snapshot(4, 2);
  await controller.acknowledge(); expect(api.command).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().acknowledgement).toBeNull(); expect(controller.getSnapshot().problem).toContain("changed while awaiting");
});

it.each(["AVAILABILITY_UNKNOWN", "SPEAKER_OCCUPIED"])("acknowledges %s by replaying the complete atomic replacement", async code => {
  snapshot(); api.command.mockRejectedValueOnce(failure(code));
  const replacement = { type: "queue.replace" as const, entries: [{ id: entryB, track_id: "track", friend_id: 1 }], current_entry_id: entryB, position: 42, play: true };
  await controller.command(replacement);
  expect(controller.getSnapshot().acknowledgement?.command).toEqual(replacement);
  await controller.acknowledge();
  expect(api.command.mock.lastCall?.[1]).toEqual({ ...replacement, ...(code === "AVAILABILITY_UNKNOWN" ? { allow_unknown: true } : { takeover: true }) });
});
it("preserves an explicit revision when acknowledging a conditional replacement", async () => {
  snapshot(); api.command.mockRejectedValueOnce(failure("AVAILABILITY_UNKNOWN"));
  const replacement = { type: "queue.replace" as const, entries: [], play: true };
  await controller.command(replacement, 3);
  expect(controller.getSnapshot().acknowledgement?.expectedRevision).toBe(3);
  await controller.acknowledge();
  expect(api.command.mock.lastCall?.[1]).toEqual({ ...replacement, allow_unknown: true, expected_revision: 3 });
});
it("never treats an enqueue-only replacement as a connection request", async () => {
  snapshot(); api.command.mockRejectedValueOnce(failure("AVAILABILITY_UNKNOWN"));
  await controller.command({ type: "queue.replace", entries: [], play: false });
  expect(controller.getSnapshot().acknowledgement).toBeNull();
});
