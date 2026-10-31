import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postServerPlay, runPlayerWorker } from "./runtime.js";
import { Server } from "node:http";
import { Pool } from "pg";
import { OwnToneBackend } from "../ownToneBackend.js";
import { PostgresPlayerStore as Store } from "./store.js";
import type { ServerPlayerManager } from "./manager.js";
import type { PostgresPlayerStore } from "./store.js";
const env = {
  PLAYER_API_KEY: "x".repeat(40),
  PLAYER_LIBRARY_FRIEND_ID: "1",
  DATABASE_URL: "postgres://test",
  PLAYER_ENGINES_JSON: JSON.stringify({ a: { apiUrl: "http://a/api", libraryRoot: "/media" } }),
};
function fixture() {
  const store = {
    acquire: vi.fn(async (_lost: () => void) => {
      void _lost;
    }),
    release: vi.fn(async () => {}),
    heartbeat: vi.fn(async () => {}),
  };
  const manager = Object.assign(new EventEmitter(), {
    initialize: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
    retryPlays: vi.fn(async () => {}),
  });
  const server = Object.assign(new EventEmitter(), {
    listen: vi.fn((_port: number, _host: string, callback: () => void) => callback()),
    close: vi.fn(),
    closeAllConnections: vi.fn(),
  });
  const signals = new EventEmitter();
  const dependencies = {
    store: store as unknown as PostgresPlayerStore,
    manager: manager as unknown as ServerPlayerManager,
    server: server as unknown as Server,
    signals,
  };
  return { store, manager, server, signals, dependencies };
}
describe("player worker lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
    process.exitCode = 0;
    vi.restoreAllMocks();
  });
  it("holds the DB lease before listening and shuts engines down before releasing it", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = fixture();
    const running = await runPlayerWorker(env, f.dependencies);
    expect(f.store.acquire.mock.invocationCallOrder[0]).toBeLessThan(
      f.server.listen.mock.invocationCallOrder[0]!,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.store.heartbeat).toHaveBeenCalledOnce();
    await running.shutdown();
    await running.shutdown();
    expect(f.manager.shutdown).toHaveBeenCalledOnce();
    expect(f.manager.shutdown.mock.invocationCallOrder[0]).toBeLessThan(
      f.store.release.mock.invocationCallOrder[0]!,
    );
    expect(f.signals.listenerCount("SIGTERM")).toBe(0);
  });
  it("fails closed after a DB heartbeat error and closes client connections", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = fixture();
    f.store.heartbeat.mockRejectedValue(new Error("offline"));
    await runPlayerWorker(env, f.dependencies);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.server.closeAllConnections).toHaveBeenCalledOnce();
    expect(f.manager.shutdown).toHaveBeenCalledOnce();
  });
  it("cleans up if initialization fails and handles process termination", async () => {
    const f = fixture();
    f.manager.initialize.mockRejectedValue(new Error("invalid saved state"));
    await expect(runPlayerWorker(env, f.dependencies)).rejects.toThrow("invalid saved state");
    expect(f.store.release).toHaveBeenCalledOnce();
    const next = fixture();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runPlayerWorker(env, next.dependencies);
    next.signals.emit("SIGTERM");
    await vi.waitFor(() => expect(next.store.release).toHaveBeenCalledOnce());
  });
  it("does not start accepting commands if the lease is lost during restoration", async () => {
    const f = fixture();
    f.manager.initialize.mockImplementation(async () => {
      f.store.acquire.mock.calls[0]![0]();
    });
    await expect(runPlayerWorker(env, f.dependencies)).rejects.toThrow(/lost its lease/);
    expect(f.server.listen).not.toHaveBeenCalled();
    expect(f.store.release).toHaveBeenCalledOnce();
  });
  it("shares shutdown completion between concurrent callers", async () => {
    const f = fixture();
    vi.spyOn(console, "log").mockImplementation(() => {});
    let finish!: () => void;
    f.manager.shutdown.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const worker = await runPlayerWorker(env, f.dependencies);
    const first = worker.shutdown(),
      second = worker.shutdown();
    expect(first).toBe(second);
    expect(f.store.release).not.toHaveBeenCalled();
    finish();
    await second;
    expect(f.store.release).toHaveBeenCalledOnce();
  });
  it("skips overlapping heartbeats and handles lease, manager and server faults", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = fixture();
    let finish!: () => void;
    f.store.heartbeat.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const worker = await runPlayerWorker(env, f.dependencies);
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.store.heartbeat).toHaveBeenCalledOnce();
    finish();
    await worker.shutdown();
    for (const trigger of ["lease", "fault", "error"]) {
      const next = fixture();
      await runPlayerWorker(env, next.dependencies);
      if (trigger === "lease") next.store.acquire.mock.calls[0]![0]();
      else (trigger === "fault" ? next.manager : next.server).emit(trigger, new Error("failed"));
      await vi.waitFor(() => expect(next.store.release).toHaveBeenCalledOnce());
    }
  });
  it("sets a failing exit status if shutdown cannot release the database", async () => {
    const f = fixture();
    vi.spyOn(console, "log").mockImplementation(() => {});
    f.store.release.mockRejectedValue(new Error("database unavailable"));
    await runPlayerWorker(env, f.dependencies);
    f.signals.emit("SIGINT");
    await vi.waitFor(() => expect(process.exitCode).toBe(1));
  });
  it("wires the default store, manager, private server and configured engine without playback on restore", async () => {
    vi.spyOn(Store.prototype, "acquire").mockResolvedValue();
    vi.spyOn(Store.prototype, "list").mockResolvedValue([]);
    vi.spyOn(Store.prototype, "release").mockImplementation(async function (this: Store) {
      await this.pool.end();
    });
    vi.spyOn(Store.prototype, "create").mockImplementation(async (input, state) => ({
      ...input,
      availability_policy: "ask",
      state,
      revision: 0,
      assigned_output: null,
    }));
    vi.spyOn(Pool.prototype, "connect").mockImplementation(() => {
      throw new Error("No DB network expected");
    });
    const listen = vi.spyOn(Server.prototype, "listen").mockImplementation(function (this: Server) {
      return this;
    });
    const devices = vi
      .spyOn(OwnToneBackend.prototype, "listDevices")
      .mockResolvedValue([{ id: "opaque", name: "Lounge" }]);
    const ha = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ state: "paused", attributes: { client_name: "Groovenet-a" } }),
      );
    vi.spyOn(OwnToneBackend.prototype, "close").mockResolvedValue();
    const worker = await runPlayerWorker({
      ...env,
      PLAYER_HA_URL: "http://ha",
      PLAYER_HA_TOKEN: "token",
      PLAYER_HA_ENTITIES_JSON: '{"Lounge":"media_player.room"}',
      PLAYER_HA_SENDERS_JSON: '{"a":{"client_name":"Groovenet-a"}}',
    });
    expect(listen).toHaveBeenCalledWith(13700, "0.0.0.0", expect.any(Function));
    expect(devices).not.toHaveBeenCalled();
    await worker.manager.create({ id: "lounge", name: "Lounge", engine_id: "a" });
    expect((await worker.manager.devices("lounge"))[0]!.observed).toMatchObject({
      entity_id: "media_player.room",
      sender_identity: "groovenet",
      sender_engine_id: "a",
    });
    expect(ha).toHaveBeenCalledOnce();
    expect(devices).toHaveBeenCalledOnce();
    // No persisted player in this unit fixture needs a shutdown UPDATE.
    vi.spyOn(Store.prototype, "save").mockImplementation(async (player) => player);
    await worker.shutdown();
  });
  it.each([
    [{ ...env, PLAYER_ENGINES_JSON: "{}" }, /dedicated engine/],
    [{ ...env, PLAYER_ENGINES_JSON: undefined }, /dedicated engine/],
    [
      {
        ...env,
        PLAYER_ENGINES_JSON: JSON.stringify({
          a: { apiUrl: "file:///api", libraryRoot: "/media" },
        }),
      },
      /Invalid/,
    ],
    [{ ...env, PLAYER_HA_SENDERS_JSON: '{"a":{}}' }, /Invalid/],
    [
      { ...env, PLAYER_HA_SENDERS_JSON: '{"missing":{"client_name":"engine"}}' },
      /configured engine/,
    ],
    [{ ...env, PLAYER_HA_SENDERS_JSON: '{"a":{"client_name":""}}' }, /Too small/],
    [{ ...env, PLAYER_API_KEY: "short" }, /32/],
    [{ ...env, PLAYER_API_KEY: undefined }, /32/],
    [{ ...env, PLAYER_LIBRARY_FRIEND_ID: "" }, /Too small/],
    [{ ...env, DATABASE_URL: undefined }, /DATABASE_URL/],
    [
      {
        ...env,
        PLAYER_ENGINES_JSON: JSON.stringify({
          a: { apiUrl: "http://same/api", libraryRoot: "/media" },
          b: { apiUrl: "http://same/api/", libraryRoot: "/media" },
        }),
      },
      /different API URL/,
    ],
  ])("rejects invalid worker configuration", async (configuration, message) => {
    await expect(runPlayerWorker(configuration, fixture().dependencies)).rejects.toThrow(message);
  });
});

describe("server play API delivery", () => {
  it("posts the entry's track and friend, accepts an existing digital play, and retries other failures", async () => {
    const play = {
      entryId: "entry",
      playerId: "a",
      trackId: "track",
      friendId: 3,
      releaseId: "release",
      outputName: "Lounge",
      startedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const transport = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(
        Response.json({ error: "Digital play already logged" }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }));
    await postServerPlay("http://app:3000", play);
    expect(transport).toHaveBeenCalledWith(
      new URL("http://app:3000/api/spins"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          friend_id: 3,
          release_id: "release",
          medium: "digital",
          played_at: "2026-01-01T00:00:00.000Z",
          context_type: "player",
          output_name: "Lounge",
          track_refs: [{ track_id: "track", friend_id: 3 }],
        }),
      }),
    );
    await expect(postServerPlay("http://app:3000", play)).resolves.toBeUndefined();
    await expect(postServerPlay("http://app:3000", play)).rejects.toThrow("503");
    transport.mockRestore();
  });
});
