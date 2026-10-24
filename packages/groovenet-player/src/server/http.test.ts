import { EventEmitter } from "node:events";
import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { ServerPlayerManager } from "./manager.js";
import { playerHttpServer } from "./http.js";
import { PlayerError } from "../types.js";
import { ServerPlayerError } from "./store.js";
const key = "test-key-".repeat(5);
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function fixture() {
  const player = { id: "lounge", revision: 3, state: { status: "playing" } };
  const manager = Object.assign(new EventEmitter(), {
    list: vi.fn(() => [player]), get: vi.fn(() => player), engineIds: vi.fn(() => ["primary"]),
    create: vi.fn(async (input) => ({ ...player, ...input })), command: vi.fn(async () => ({ player })),
    devices: vi.fn(async () => [{ id: "speaker", name: "Lounge" }]), shutdown: vi.fn(),
  });
  const server = playerHttpServer(manager as unknown as ServerPlayerManager, key);
  let response: ServerResponse;
  server.on("request", (_request, value) => { response = value; });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, init: RequestInit = {}) => fetch(base + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...init.headers } });
  return { manager, server, request, base, response: () => response };
}
describe("private player worker HTTP API", () => {
  it("requires the configured bearer key for reads and commands", async () => {
    expect(() => playerHttpServer({} as ServerPlayerManager, "short")).toThrow(/32/);
    const f = await fixture();
    expect((await fetch(f.base + "/players")).status).toBe(401);
    expect((await f.request("/players", { headers: { Authorization: `Bearer ${"x".repeat(key.length)}` } })).status).toBe(401);
    expect(await (await f.request("/players")).json()).toEqual({ players: [{ id: "lounge", revision: 3, state: { status: "playing" } }] });
    expect(await (await f.request("/engines")).json()).toEqual({ engines: ["primary"] });
    expect((await f.request("/health")).status).toBe(200);
  });
  it("validates creation, commands, IDs, unknown routes and method errors", async () => {
    const f = await fixture();
    expect((await f.request("/players", { method: "POST", body: JSON.stringify({ id: "lounge", name: "Lounge", engine_id: "primary" }) })).status).toBe(201);
    expect((await f.request("/players", { method: "DELETE" })).status).toBe(404);
    expect((await f.request("/players/lounge/commands", { method: "POST", body: JSON.stringify({ type: "pause", expected_revision: 3 }) })).status).toBe(200);
    expect(f.manager.command).toHaveBeenCalledWith("lounge", { type: "pause", expected_revision: 3 });
    expect((await f.request("/players/lounge/devices")).status).toBe(200);
    expect((await f.request("/players/lounge")).status).toBe(200);
    expect((await f.request("/players/lounge", { method: "PUT" })).status).toBe(405);
    expect((await f.request("/other")).status).toBe(404);
    expect((await f.request("/players/UPPER")).status).toBe(400);
    expect((await f.request("/players/lounge/commands", { method: "POST", body: "broken" })).status).toBe(400);
    expect((await f.request("/players/lounge/commands", { method: "POST", body: "{}" })).status).toBe(400);
  });
  it("returns conflicts and hides unexpected internal errors", async () => {
    const f = await fixture();
    f.manager.get.mockImplementationOnce(() => { throw new ServerPlayerError("PLAYER_NOT_FOUND", "Player missing", 404); });
    expect((await f.request("/players/missing")).status).toBe(404);
    f.manager.command.mockRejectedValueOnce(new ServerPlayerError("REVISION_CONFLICT", "Refresh player"));
    const conflict = await f.request("/players/lounge/commands", { method: "POST", body: '{"type":"pause","expected_revision":3}' });
    expect(conflict.status).toBe(409);
    f.manager.command.mockRejectedValueOnce(new Error("secret database URL"));
    const failure = await f.request("/players/lounge/commands", { method: "POST", body: '{"type":"pause","expected_revision":3}' });
    expect(failure.status).toBe(502); expect(await failure.text()).not.toContain("secret");
  });
  it("sends a fresh snapshot and unsubscribes without stopping playback on disconnect", async () => {
    const f = await fixture(); const controller = new AbortController();
    const response = await f.request("/players/lounge/events", { signal: controller.signal });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"status":"playing"');
    expect(first).toContain('"worker_instance":');
    f.manager.emit("snapshot", { id: "other", revision: 5 });
    f.manager.emit("snapshot", { id: "lounge", revision: 4 });
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"revision":4');
    controller.abort();
    await vi.waitFor(() => expect(f.manager.listenerCount("snapshot")).toBe(0));
    expect(f.manager.shutdown).not.toHaveBeenCalled();
    expect(f.manager.command).not.toHaveBeenCalled();
  });
  it("bounds command uploads and returns typed engine failures", async () => {
    const f = await fixture();
    const huge = await f.request("/players", { method: "POST", body: "x".repeat(2 * 1024 * 1024 + 1) });
    expect(huge.status).toBe(413);
    f.manager.command.mockRejectedValueOnce(new PlayerError("ENGINE_UNAVAILABLE", "Engine unreachable"));
    const response = await f.request("/players/lounge/commands", { method: "POST", body: '{"type":"pause","expected_revision":3}' });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
  });
  it("streams lightweight positions only for the requested player", async () => {
    const f = await fixture(); const controller = new AbortController();
    const response = await f.request("/players/lounge/events", { signal: controller.signal });
    const reader = response.body!.getReader(); await reader.read();
    f.manager.emit("position", { player_id: "other", position: 99 });
    f.manager.emit("position", { player_id: "lounge", revision: 3, position: 4, duration: 90 });
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"position":4');
    controller.abort();
    await vi.waitFor(() => expect(f.manager.listenerCount("position")).toBe(0));
  });

  it.each(["snapshot", "position"])("drops a slow %s client without stopping playback", async event => {
    const f = await fixture(); const controller = new AbortController();
    const response = await f.request("/players/lounge/events", { signal: controller.signal });
    await response.body!.getReader().read();
    vi.spyOn(f.response(), "writableLength", "get").mockReturnValue(64 * 1024 * 1024 + 1);
    if (event === "snapshot") f.manager.emit(event, { id: "lounge", revision: 4 });
    else f.manager.emit(event, { player_id: "lounge", revision: 3, position: 4 });
    await vi.waitFor(() => expect(f.manager.listenerCount("snapshot")).toBe(0));
    expect(f.manager.shutdown).not.toHaveBeenCalled(); controller.abort();
  });

  it("sends heartbeats and disconnects when a heartbeat cannot be buffered", async () => {
    const f = await fixture(); const interval = vi.spyOn(globalThis, "setInterval");
    const controller = new AbortController();
    try {
      const response = await f.request("/players/lounge/events", { signal: controller.signal });
      const reader = response.body!.getReader(); await reader.read();
      const heartbeat = interval.mock.calls.find(call => call[1] === 15000)![0] as () => void;
      heartbeat(); expect(new TextDecoder().decode((await reader.read()).value)).toContain(": heartbeat");
      vi.spyOn(f.response(), "write").mockReturnValue(false);
      heartbeat();
      await vi.waitFor(() => expect(f.manager.listenerCount("snapshot")).toBe(0));
      expect(f.manager.shutdown).not.toHaveBeenCalled();
    } finally { controller.abort(); interval.mockRestore(); }
  });

  it("closes a stream if setup fails after sending its headers", async () => {
    const f = await fixture();
    vi.spyOn(f.manager, "on").mockImplementationOnce(() => { throw new Error("subscription failed"); });
    await expect(f.request("/players/lounge/events")).rejects.toThrow();
    expect(f.manager.shutdown).not.toHaveBeenCalled();
  });

});
