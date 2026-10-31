import { createConnection } from "node:net";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ServerPlayerTransport, ServerPlayerStreamEvent, Track } from "@groovenet/client";
import type { ServerPlayer } from "@groovenet/contracts";
import { RemoteNowPlaying, startRemoteSocket } from "./nowPlayingRemote.js";
import { PlayerControlClient } from "./protocol.js";

const entry = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
function player(revision = 3): ServerPlayer {
  return {
    id: "lounge",
    name: "Lounge",
    engine_id: "primary",
    revision,
    assigned_output: "speaker",
    availability_policy: "ask",
    state: {
      queue: [{ id: entry, track_id: "track", friend_id: 1, title: "Title", artist: "Artist" }],
      current_entry_id: entry,
      status: "playing",
      position: 12.5,
      duration: 120,
      volume: 30,
      desired_output: "speaker",
      checkpoint: false,
      error: null,
    },
  };
}
function setup(fetch = vi.fn().mockResolvedValue([])) {
  let event: (event: ServerPlayerStreamEvent) => void;
  let disconnect: (reason?: unknown) => void;
  const off = vi.fn();
  const transport = {
    get: vi.fn().mockResolvedValue(player()),
    devices: vi.fn(),
    command: vi.fn().mockResolvedValue({ player: player(4) }),
    subscribe: vi.fn((_id, receive, lost) => {
      event = receive;
      disconnect = lost;
      receive({ type: "snapshot", player: player(), sequence: 1, worker_instance: worker });
      return off;
    }),
  } satisfies ServerPlayerTransport;
  const controller = new RemoteNowPlaying("lounge", transport, fetch);
  const emit = (value: ServerPlayer, sequence = 2) =>
    event({ type: "snapshot", player: value, sequence, worker_instance: worker });
  return {
    controller,
    transport,
    fetch,
    off,
    emit,
    event: (value: ServerPlayerStreamEvent) => event(value),
    disconnect: () => disconnect(),
  };
}
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  vi.restoreAllMocks();
  vi.doUnmock("node:fs/promises");
  vi.resetModules();
});

it("maps remote state and hydrates album without overwriting queue identity or transport state", async () => {
  let resolve: (tracks: Track[]) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Track[]>((done) => {
        resolve = done;
      }),
  );
  const { controller, emit } = setup(fetch);
  cleanup.push(() => controller.close());
  await controller.start();
  expect(controller.snapshot().current).toMatchObject({
    id: entry,
    track: { title: "Title", album: "" },
  });
  const next = player(4);
  next.state.position = 44;
  emit(next);
  resolve!([
    {
      track_id: "track",
      friend_id: 1,
      title: "Old title",
      artist: "Old artist",
      album: "Album",
      id: 10,
    },
  ]);
  await vi.waitFor(() => expect(controller.snapshot().current?.track.album).toBe("Album"));
  expect(controller.snapshot()).toMatchObject({
    position: 44,
    duration: 120,
    current: { id: entry, track: { title: "Title", artist: "Artist" } },
  });
  expect(fetch).toHaveBeenCalledOnce();
  next.state.checkpoint = true;
  emit({ ...next, revision: 5 }, 3);
  expect(controller.snapshot().status).toBe("stopped");
});

it("forwards only transport controls with revisions and never acknowledges takeover", async () => {
  const { controller, transport } = setup();
  cleanup.push(() => controller.close());
  await controller.start();
  for (const [method, type] of [
    ["pause", "pause"],
    ["resume", "resume"],
    ["play", "play"],
    ["next", "next"],
    ["prev", "previous"],
  ]) {
    await controller.request(method);
    expect(transport.command).toHaveBeenLastCalledWith("lounge", {
      type,
      expected_revision: method === "pause" ? 3 : 4,
    });
  }
  expect(await controller.request("status")).toMatchObject({ position: 12.5 });
  await expect(controller.request("shutdown")).rejects.toThrow("Unsupported");
  await expect(controller.request("stop")).rejects.toThrow("Unsupported");
  controller.close();
  controller.close();
  await expect(controller.request("play")).rejects.toThrow("disconnected");
  expect(transport.command).toHaveBeenCalledTimes(5);
});

it("uses shared stale-position fences and clears connection on remote stream loss", async () => {
  const { controller, event, disconnect, off } = setup();
  await controller.start();
  const lost = vi.fn();
  controller.on("disconnect", lost);
  event({
    type: "position",
    player_id: "lounge",
    revision: 3,
    current_entry_id: entry,
    position: 20,
    duration: null,
    observed_at: "now",
    sequence: 2,
    worker_instance: worker,
  });
  expect(controller.snapshot().position).toBe(20);
  event({
    type: "position",
    player_id: "lounge",
    revision: 2,
    current_entry_id: entry,
    position: 99,
    duration: 99,
    observed_at: "now",
    sequence: 3,
    worker_instance: worker,
  });
  expect(controller.snapshot().position).toBe(20);
  disconnect();
  expect(lost).toHaveBeenCalledOnce();
  expect(off).toHaveBeenCalled();
  expect(() => controller.snapshot()).toThrow("disconnected");
});

it("retains server metadata on collection failures and ignores late metadata after close", async () => {
  const first = setup(vi.fn().mockRejectedValue(new Error("no collection key")));
  await first.controller.start();
  expect(first.controller.snapshot().current?.track.album).toBe("");
  first.controller.close();
  let resolve: (tracks: Track[]) => void;
  const second = setup(
    vi.fn(
      () =>
        new Promise<Track[]>((done) => {
          resolve = done;
        }),
    ),
  );
  await second.controller.start();
  const state = vi.fn();
  second.controller.on("state", state);
  second.controller.close();
  resolve!([]);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(state).not.toHaveBeenCalled();
});

it("handles empty current state and late track changes without refetching on position ticks", async () => {
  const { controller, emit, fetch } = setup();
  await controller.start();
  const empty = player(4);
  empty.state.queue = [];
  empty.state.current_entry_id = null;
  emit(empty);
  expect(controller.snapshot().current).toBeNull();
  emit(player(5), 3);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  controller.close();
});

it("reports authentication, event startup failure and timeout without leaving a subscription", async () => {
  const first = setup();
  first.transport.get.mockRejectedValue(new Error("unauthorized"));
  await expect(first.controller.start()).rejects.toThrow("unauthorized");
  const second = setup();
  second.transport.subscribe.mockImplementation(() => second.off);
  await expect(second.controller.start(1)).rejects.toThrow("Timed out");
  expect(second.off).toHaveBeenCalled();
  const third = setup();
  third.transport.subscribe.mockImplementation((_id, _event, disconnect) => {
    queueMicrotask(() => disconnect(new Error("lost")));
    return third.off;
  });
  await expect(third.controller.start()).rejects.toThrow("disconnected");
  expect(() => new RemoteNowPlaying("../bad", first.transport, first.fetch)).toThrow();
});

it("rejects overlapping commands and propagates policy failures without retry", async () => {
  const { controller, transport } = setup();
  await controller.start();
  let resolve: (value: { player: ServerPlayer }) => void;
  transport.command.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const command = controller.request("next");
  await expect(controller.request("next")).rejects.toThrow("already in progress");
  resolve!({ player: player(4) });
  await command;
  transport.command.mockRejectedValue(new Error("SPEAKER_OCCUPIED"));
  await expect(controller.request("resume")).rejects.toThrow("SPEAKER_OCCUPIED");
  expect(transport.command).toHaveBeenCalledTimes(2);
  controller.close();
});

it("serves the Swift helper's real socket protocol and closes it on remote disconnect", async () => {
  const { controller, disconnect, emit } = setup();
  await controller.start();
  const proxy = await startRemoteSocket(controller);
  cleanup.push(proxy.close);
  const client = new PlayerControlClient(proxy.socketPath);
  cleanup.push(() => client.close());
  expect(await client.request("status")).toMatchObject({ position: 12.5, current: { id: entry } });
  expect(await client.request("pause")).toMatchObject({ status: "playing" });
  await expect(client.request("shutdown")).rejects.toThrow("Unsupported");
  const event = once(client, "event");
  emit(player(5));
  expect((await event)[0]).toMatchObject({ event: "state", data: { position: 12.5 } });
  const closed = once(client, "disconnect");
  disconnect();
  await closed;
});

it("rejects malformed, unsupported-version and oversized socket requests", async () => {
  const { controller } = setup();
  await controller.start();
  const proxy = await startRemoteSocket(controller);
  cleanup.push(proxy.close);
  const socket = createConnection(proxy.socketPath);
  await once(socket, "connect");
  cleanup.push(() => {
    socket.destroy();
  });
  socket.setEncoding("utf8");
  let output = "";
  socket.on("data", (chunk) => (output += chunk));
  socket.write('nope\n{"jsonrpc":"2.0","id":3,"version":2,"method":"status"}\n{}\n');
  await vi.waitFor(() => expect(output.split("\n").filter(Boolean)).toHaveLength(3));
  expect(output).toContain("Unsupported player protocol");
  const closed = once(socket, "close");
  socket.write("x".repeat(65537));
  await closed;
});

it("cleans up the remote session when its local proxy cannot start", async () => {
  const { controller } = setup();
  await controller.start();
  const directory = await mkdtemp(join(tmpdir(), "gn-np-test-"));
  await writeFile(join(directory, "player.sock"), "occupied");
  vi.doMock("node:fs/promises", async (original) => ({
    ...(await original<typeof import("node:fs/promises")>()),
    mkdtemp: async () => directory,
  }));
  const { startRemoteSocket: start } = await import("./nowPlayingRemote.js");
  await expect(start(controller)).rejects.toThrow();
  expect(() => controller.snapshot()).toThrow("disconnected");
});

it("reports non-Error failures and drops a backpressured helper connection", async () => {
  const { controller } = setup();
  await controller.start();
  const proxy = await startRemoteSocket(controller);
  cleanup.push(proxy.close);
  const client = new PlayerControlClient(proxy.socketPath);
  cleanup.push(() => client.close());
  vi.spyOn(controller, "request").mockRejectedValueOnce("unknown");
  await expect(client.request("status")).rejects.toThrow("Remote player request failed");
  const snapshot = controller.snapshot();
  const huge = {
    ...snapshot,
    queue: [
      {
        ...snapshot.queue[0],
        track: { ...snapshot.queue[0].track, title: "x".repeat(2 * 1024 * 1024) },
      },
    ],
  };
  const disconnected = once(client, "disconnect");
  controller.emit("state", huge);
  controller.emit("state", huge);
  controller.emit("state", huge);
  await disconnected;
});
