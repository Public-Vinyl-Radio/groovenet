import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnToneBackend } from "./ownToneBackend.js";

const instance = "a".repeat(32);
function fixture() {
  let version = 1;
  let nextId = 10;
  let items: { id: number; file_id: number }[] = [];
  const terminal = { version: 1, instance, sequence: 0, item_id: 0, reason: "none" };
  const status = { state: "stop", item_id: 0, item_progress_ms: 0, item_length_ms: 10000, groovenet_terminal: terminal };
  const outputs = [{ id: "speaker/1", name: "Lounge", type: "AirPlay", selected: false, requires_auth: false, needs_auth_key: false, busy: false }];
  let tracks = [{ id: 1, path: "/media/song.m4a", data_kind: "file", length_ms: 10000 }];
  const requests: { path: string; method: string; body?: unknown; authorization: unknown }[] = [];
  const responses = new Map<string, unknown>();
  const failures = new Map<string, number | Error | "bad-json">();
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path: path + url.search, method, body, authorization: (init?.headers as Record<string, string>)?.Authorization });
    const failure = failures.get(path);
    if (failure instanceof Error) throw failure;
    if (failure === "bad-json") return new Response("not json");
    if (failure) return new Response("secret body", { status: failure });
    if (responses.has(path)) return Response.json(responses.get(path));
    let data: unknown;
    if (path === "library/files") data = { tracks: { items: tracks } };
    else if (path === "player") data = status;
    else if (path === "outputs") data = { outputs };
    else if (path === "queue") data = { version, items };
    else if (path === "queue/items/add") {
      items = [{ id: nextId++, file_id: 1 }];
      version++;
      data = { version, items };
      status.item_id = items[0]!.id;
    } else if (path === "queue/clear") { items = []; version++; }
    else if (path === "player/play") status.state = "play";
    else if (path === "player/pause") status.state = "pause";
    else if (path === "player/stop") status.state = "stop";
    else if (path === "outputs/set") {
      for (const output of outputs) output.selected = body.outputs.includes(output.id);
    }
    return data === undefined ? new Response(null, { status: 204 }) : Response.json(data);
  });
  const backend = new OwnToneBackend({ apiUrl: "http://engine/api", outputId: "speaker/1", password: "private", fetch });
  const errors = vi.fn();
  const ended = vi.fn();
  const position = vi.fn();
  backend.on("error", errors).on("ended", ended).on("position", position);
  return {
    backend, status, outputs, terminal, requests, failures, responses, fetch, errors, ended, position,
    setTracks: (value: typeof tracks) => { tracks = value; },
    fail: (reason = "output_lost", state = "pause") => { terminal.sequence++; terminal.item_id = status.item_id; terminal.reason = reason; status.state = state; },
    replace: () => { items = [{ id: 99, file_id: 2 }]; version++; status.item_id = 99; },
    eof: (keep = false) => { terminal.sequence++; terminal.item_id = status.item_id; terminal.reason = "eof"; status.state = "stop"; if (!keep) { items = []; version++; } },
    changeVersion: () => { version++; },
  };
}
const source = { url: "file:///media/song.m4a" };

describe("OwnToneBackend", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("maps the exact indexed path without interpolating query expressions, uses engine-only auth, and selects just one output", async () => {
    const f = fixture();
    await f.backend.load(source);
    expect(new URL(`http://engine/api/${f.requests[0]!.path}`).searchParams.get("directory")).toBe("/media");
    expect(f.requests.every((r) => r.authorization === `Basic ${Buffer.from("admin:private").toString("base64")}`)).toBe(true);
    expect(f.requests.find((r) => r.path === "outputs/set")?.body).toEqual({ outputs: ["speaker/1"] });
    expect(f.requests.filter((r) => r.method !== "GET").map((r) => r.path)).toEqual([
      "outputs/set", "player/stop", "player/repeat?state=off", "player/consume?state=false", "player/shuffle?state=false", "queue/items/add?uris=library%3Atrack%3A1&clear=true", "player/play",
    ]);
    expect(await f.backend.listDevices()).toEqual([{ id: "speaker/1", name: "Lounge", description: "AirPlay" }]);
    await f.backend.close();
  });

  it("supports pause, resume, absolute seek, output volume and seconds-based positions", async () => {
    const f = fixture();
    await f.backend.load(source);
    await f.backend.pause(true);
    await f.backend.pause(false);
    await f.backend.seek(2.345);
    await f.backend.setVolume(15);
    expect(f.requests.some((r) => r.path === "player/seek?position_ms=2345")).toBe(true);
    expect(f.requests.find((r) => r.path === "outputs/speaker%2F1")?.body).toEqual({ volume: 15 });
    f.status.item_progress_ms = 2500;
    await vi.advanceTimersByTimeAsync(500);
    expect(f.position).toHaveBeenCalledWith(2.5, 10);
    f.status.item_length_ms = 0;
    await vi.advanceTimersByTimeAsync(500);
    expect(f.position).toHaveBeenLastCalledWith(2.5, null);
    await f.backend.close();
  });

  it("emits EOF once only for a fresh terminal signal from the owned item and instance", async () => {
    const f = fixture();
    await f.backend.load(source);
    f.eof();
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.ended).toHaveBeenCalledTimes(1);
    expect(f.errors).not.toHaveBeenCalled();
    await f.backend.close();
  });

  it.each(["input_error", "failed", "output_lost", "interrupted", "none"])("does not advance on %s", async (reason) => {
    const f = fixture();
    await f.backend.load(source);
    f.terminal.sequence++;
    f.terminal.item_id = f.status.item_id;
    f.terminal.reason = reason;
    f.status.state = "stop";
    const writes = f.requests.filter((r) => r.method !== "GET").length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.ended).not.toHaveBeenCalled();
    expect(f.errors).toHaveBeenCalledWith(expect.objectContaining({ code: "PLAYBACK_INTERRUPTED" }));
    await f.backend.close();
    expect(f.requests.filter((r) => r.method !== "GET")).toHaveLength(writes + (["input_error", "failed", "output_lost"].includes(reason) ? 3 : 0));
  });

  it.each(["duplicate", "wrong item", "restart", "replacement"])("ignores %s completion signals", async (kind) => {
    const f = fixture();
    await f.backend.load(source);
    f.terminal.item_id = kind === "wrong item" ? 123 : f.status.item_id;
    f.terminal.reason = "eof";
    if (kind !== "duplicate") f.terminal.sequence++;
    if (kind === "restart") f.terminal.instance = "b".repeat(32);
    if (kind === "replacement") f.replace();
    else f.status.state = "stop";
    await vi.advanceTimersByTimeAsync(500);
    expect(f.ended).not.toHaveBeenCalled();
    expect(f.errors).toHaveBeenCalledTimes(1);
    await f.backend.close();
  });

  it("refuses unpatched engines before touching playback or outputs", async () => {
    const f = fixture();
    f.terminal.version = 0;
    await expect(f.backend.load(source)).rejects.toMatchObject({ code: "ENGINE_INCOMPATIBLE" });
    expect(f.requests.every((r) => r.method === "GET")).toBe(true);
  });

  it("rejects HTTP/header sources instead of leaking or dropping app credentials", async () => {
    const f = fixture();
    await expect(f.backend.load({ url: "https://app/audio", headers: { Authorization: "secret" } })).rejects.toMatchObject({ code: "STREAM_FAILED" });
    await expect(f.backend.load({ ...source, headers: { Authorization: "secret" } })).rejects.toMatchObject({ code: "STREAM_FAILED" });
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each([[], [{ id: 1, path: "/other/song.m4a", data_kind: "file", length_ms: 10 }], [1, 2].map((id) => ({ id, path: "/media/song.m4a", data_kind: "file", length_ms: 10 }))].map((tracks) => ({ tracks })))("refuses missing or ambiguous index matches", async ({ tracks }) => {
    const f = fixture();
    f.setTracks(tracks);
    await expect(f.backend.load(source)).rejects.toMatchObject({ code: "NO_AUDIO" });
    expect(f.requests.every((r) => r.method === "GET")).toBe(true);
  });

  it("refuses a foreign engine session without stopping it", async () => {
    const f = fixture();
    f.status.state = "play";
    await expect(f.backend.load(source)).rejects.toMatchObject({ code: "DEVICE_BUSY" });
    await expect(f.backend.setOutputDevice("speaker/1")).rejects.toMatchObject({ code: "PLAYBACK_INTERRUPTED" });
    expect(f.requests.every((r) => r.method === "GET")).toBe(true);
  });

  it.each(["busy", "requires_auth", "needs_auth_key", "missing"])("reports unavailable output: %s", async (kind) => {
    const f = fixture();
    if (kind === "missing") f.outputs.length = 0;
    else f.outputs[0]![kind as "busy" | "requires_auth" | "needs_auth_key"] = true;
    await expect(f.backend.load(source)).rejects.toMatchObject({ code: kind === "busy" ? "DEVICE_BUSY" : kind === "missing" ? "DEVICE_UNAVAILABLE" : "DEVICE_AUTH" });
  });

  it.each([[401, "ENGINE_AUTH"], [403, "ENGINE_AUTH"], [409, "DEVICE_BUSY"], [500, "ENGINE_API"], [new Error("secret URL"), "ENGINE_UNAVAILABLE"], ["bad-json", "ENGINE_UNAVAILABLE"]])("maps transport failure %s to %s without secrets", async (failure, code) => {
    const f = fixture();
    f.failures.set("outputs", failure as number | Error | "bad-json");
    await expect(f.backend.listDevices()).rejects.toMatchObject({ code });
    await expect(f.backend.listDevices()).rejects.not.toThrow(/secret/);
  });

  it("times out requests including response reads", async () => {
    const f = fixture();
    // AbortSignal.timeout uses the real clock independently of fake timers.
    vi.useRealTimers();
    const backend = new OwnToneBackend({ apiUrl: "http://engine/api", timeoutMs: 5, fetch: vi.fn(async (_url, init) => {
      await new Promise((_, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new Error("aborted")));
        setTimeout(() => reject(new Error("deadline not applied")), 100);
      });
      return Response.json({ outputs: [] });
    }) });
    await expect(backend.listDevices()).rejects.toMatchObject({ code: "ENGINE_TIMEOUT" });
    await f.backend.close();
  });

  it("never mutates a replacement during close and makes close idempotent", async () => {
    const f = fixture();
    await f.backend.load(source);
    f.replace();
    const count = f.requests.length;
    await f.backend.close();
    await f.backend.close();
    expect(f.requests.slice(count).every((r) => r.method === "GET")).toBe(true);
    await expect(f.backend.listDevices()).rejects.toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.errors).not.toHaveBeenCalled();
  });

  it("stops, clears and releases only its own active session", async () => {
    const f = fixture();
    await f.backend.load(source);
    await f.backend.close();
    expect(f.requests.slice(-3).map((r) => r.path)).toEqual(["player/stop", "queue/clear", "outputs/set"]);
    expect(f.outputs[0]!.selected).toBe(false);
  });

  it("rejects invalid arguments and configuration", async () => {
    const f = fixture();
    for (const apiUrl of ["broken", "file:///api", "http://user:secret@host/api", "http://host/api?x=1"]) {
      expect(() => new OwnToneBackend({ apiUrl })).toThrow(/URL/);
    }
    expect(() => new OwnToneBackend({ apiUrl: "http://host/api", pollIntervalMs: 0 })).toThrow(/positive/);
    await expect(f.backend.seek(-1)).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(f.backend.setVolume(101)).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(f.backend.setVolume(10)).rejects.toMatchObject({ code: "DEVICE_UNAVAILABLE" });
    await expect(f.backend.setOutputDevice("")).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });
  it("reconciles an API outage using reads only and requires explicit resume", async () => {
    const f = fixture();
    await f.backend.load(source);
    f.failures.set("player", new Error("offline"));
    const writes = f.requests.filter((r) => r.method !== "GET").length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.errors).toHaveBeenCalledTimes(1);
    f.failures.delete("player");
    await vi.advanceTimersByTimeAsync(500);
    expect(f.position).toHaveBeenCalled();
    expect(f.requests.filter((r) => r.method !== "GET")).toHaveLength(writes);
    await f.backend.pause(false);
    await f.backend.close();
  });

  it("does not infer EOF across an API outage", async () => {
    const f = fixture();
    await f.backend.load(source);
    f.failures.set("player", new Error("offline"));
    await vi.advanceTimersByTimeAsync(500);
    f.eof();
    f.failures.delete("player");
    await vi.advanceTimersByTimeAsync(500);
    expect(f.ended).not.toHaveBeenCalled();
    expect(f.errors).toHaveBeenLastCalledWith(expect.objectContaining({ code: "PLAYBACK_INTERRUPTED" }));
    await f.backend.close();
  });

  it("requires explicit selection when no output is configured and releases an idle selection", async () => {
    const f = fixture();
    const backend = new OwnToneBackend({ apiUrl: "http://engine/api/", fetch: f.fetch });
    await expect(backend.load(source)).rejects.toMatchObject({ code: "DEVICE_UNAVAILABLE" });
    await backend.setOutputDevice("speaker/1");
    await backend.setVolume(5);
    await backend.close();
    expect(f.outputs[0]!.selected).toBe(false);
    expect(f.requests.every((r) => r.authorization === undefined)).toBe(true);
  });

  it("retains cleanup identity after a lost play reply", async () => {
    const f = fixture();
    f.failures.set("player/play", new Error("lost reply"));
    await expect(f.backend.load(source)).rejects.toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    await f.backend.close();
    expect(f.outputs[0]!.selected).toBe(false);
  });

  it("detects a refused output selection", async () => {
    const f = fixture();
    f.responses.set("outputs/set", {});
    await expect(f.backend.setOutputDevice("speaker/1")).rejects.toMatchObject({ code: "DEVICE_UNAVAILABLE" });
    await f.backend.close();
  });

  it("fails on a deselected or additional output without changing the engine", async () => {
    const f = fixture();
    await f.backend.load(source);
    f.outputs[0]!.selected = false;
    await vi.advanceTimersByTimeAsync(500);
    expect(f.errors).toHaveBeenCalledWith(expect.objectContaining({ code: "DEVICE_UNAVAILABLE" }));
    expect(f.ended).not.toHaveBeenCalled();
    await f.backend.close();
  });

  it("leaves an added foreign output untouched at close", async () => {
    const f = fixture();
    await f.backend.load(source);
    f.outputs.push({ ...f.outputs[0]!, id: "foreign", selected: true });
    const count = f.requests.length;
    await f.backend.close();
    expect(f.requests.slice(count).every((r) => r.method === "GET")).toBe(true);
  });

  it("releases a completed session on close", async () => {
    const f = fixture();
    await f.backend.load(source);
    f.eof();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all([f.backend.close(), f.backend.close()]);
    expect(f.outputs[0]!.selected).toBe(false);
  });

  it.each([
    ["library/files", null], ["library/files", { tracks: { items: null } }],
    ["library/files", { tracks: { items: [null] } }],
    ["player", { state: "unknown" }],
    ["outputs", { outputs: [null] }],
    ["queue/items/add", { version: 2, items: [null] }],
    ["queue/items/add", { version: 2, items: [] }],
  ])("rejects malformed %s responses", async (path, response) => {
    const f = fixture();
    f.responses.set(path, response);
    await expect(f.backend.load(source)).rejects.toMatchObject({ code: path === "queue/items/add" && (response as { items: unknown[] }).items.length === 0 ? "STREAM_FAILED" : "ENGINE_API" });
    await f.backend.close();
  });

  it("replaces its own active item without a stale completion", async () => {
    const f = fixture();
    await f.backend.load(source);
    await f.backend.load(source);
    await vi.advanceTimersByTimeAsync(500);
    expect(f.errors).not.toHaveBeenCalled();
    expect(f.ended).not.toHaveBeenCalled();
    f.replace();
    await expect(f.backend.load(source)).rejects.toMatchObject({ code: "DEVICE_BUSY" });
    await f.backend.close();
  });

  it("rejects volume changes after deselection", async () => {
    const f = fixture();
    await f.backend.setOutputDevice("speaker/1");
    f.outputs[0]!.selected = false;
    await expect(f.backend.setVolume(5)).rejects.toMatchObject({ code: "DEVICE_UNAVAILABLE" });
    await f.backend.close();
  });

  it("discards a scheduled poll after a command detects replacement", async () => {
    const f = fixture();
    await f.backend.load(source);
    f.replace();
    await expect(f.backend.pause(false)).rejects.toMatchObject({ code: "PLAYBACK_INTERRUPTED" });
    await vi.advanceTimersByTimeAsync(500);
    expect(f.errors).not.toHaveBeenCalled();
    await f.backend.close();
  });

  it("supports an engine retaining its completed queue item", async () => {
    const f = fixture();
    await f.backend.load(source);
    f.eof(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(f.ended).toHaveBeenCalledTimes(1);
    await f.backend.close();
    expect(f.outputs[0]!.selected).toBe(false);
  });

  it("does not accept EOF when an external edit changed the queue version", async () => {
    const f = fixture();
    await f.backend.load(source);
    f.eof(true);
    f.changeVersion();
    await vi.advanceTimersByTimeAsync(500);
    expect(f.ended).not.toHaveBeenCalled();
    expect(f.errors).toHaveBeenCalledTimes(1);
    await f.backend.close();
  });

  it("distinguishes selected outputs from proven transport connections", async () => {
    const f = fixture();
    const unconfigured = new OwnToneBackend({ apiUrl: "http://engine/api", fetch: f.fetch });
    expect(await unconfigured.outputConnection()).toBe("unknown");
    expect(await f.backend.outputConnection()).toBe("disconnected");
    await f.backend.load(source);
    expect(await f.backend.outputConnection()).toBe("unknown");
    f.responses.set("outputs", { outputs: [{ ...f.outputs[0], connected: true }] });
    expect(await f.backend.outputConnection()).toBe("connected");
    f.responses.set("outputs", { outputs: [{ ...f.outputs[0], connected: false }] });
    expect(await f.backend.outputConnection()).toBe("disconnected");
    f.responses.set("outputs", { outputs: [] });
    expect(await f.backend.outputConnection()).toBe("disconnected");
    f.responses.delete("outputs");
    await f.backend.close(); await unconfigured.close();
  });

  it("reports an unexpected queue edit separately from normal stop", async () => {
    const f = fixture(); await f.backend.load(source);
    f.changeVersion(); await vi.advanceTimersByTimeAsync(500);
    expect(f.errors).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("queue changed") }));
    await f.backend.close();
  });
  it("reports a replaced current item without treating it as completion", async () => {
    const f = fixture(); await f.backend.load(source);
    f.status.item_id = 999; await vi.advanceTimersByTimeAsync(500);
    expect(f.errors).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("item replaced") }));
    expect(f.ended).not.toHaveBeenCalled(); await f.backend.close();
  });

  it.each(["output_lost", "input_error", "failed"])("releases its verified %s session without replay and permits a fresh explicit play", async (reason) => {
    const f = fixture(); await f.backend.load(source);
    const writes = f.requests.filter(r => r.method !== "GET").length;
    f.fail(reason);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.errors).toHaveBeenCalledTimes(1);
    expect(f.ended).not.toHaveBeenCalled();
    expect(f.requests.filter(r => r.method !== "GET")).toHaveLength(writes);
    await f.backend.close();
    expect(f.requests.slice(-3).map(r => r.path)).toEqual(["player/stop", "queue/clear", "outputs/set"]);
    expect(f.status.state).toBe("stop"); expect(f.outputs[0]!.selected).toBe(false);
    const next = new OwnToneBackend({ apiUrl: "http://engine/api", outputId: "speaker/1", fetch: f.fetch });
    await next.load(source);
    expect(f.status.state).toBe("play");
    await next.close();
  });

  it.each(["restart", "item", "queue version", "empty queue", "queue item", "resumed", "new terminal", "terminal reason", "terminal item", "foreign output"])("rechecks failure identity and leaves %s untouched at close", async (change) => {
    const f = fixture(); await f.backend.load(source); f.fail();
    await vi.advanceTimersByTimeAsync(500);
    if (change === "restart") f.terminal.instance = "b".repeat(32);
    if (change === "item") f.status.item_id = 99;
    if (change === "queue version") f.changeVersion();
    if (change === "empty queue") f.responses.set("queue", { version: 2, items: [] });
    if (change === "queue item") f.responses.set("queue", { version: 2, items: [{ id: 99 }] });
    if (change === "resumed") f.status.state = "play";
    if (change === "new terminal") f.terminal.sequence++;
    if (change === "terminal reason") f.terminal.reason = "interrupted";
    if (change === "terminal item") f.terminal.item_id = 99;
    if (change === "foreign output") f.outputs.push({ ...f.outputs[0]!, id: "foreign", selected: true });
    const count = f.requests.length;
    await f.backend.close();
    expect(f.requests.slice(count).every(r => r.method === "GET")).toBe(true);
  });

  it.each(["queue changed", "still playing"])("does not mutate the engine when failure is observed with %s", async (change) => {
    const f = fixture(); await f.backend.load(source); f.fail();
    if (change === "queue changed") f.changeVersion();
    else f.status.state = "play";
    const writes = f.requests.filter(r => r.method !== "GET").length;
    await vi.advanceTimersByTimeAsync(500); await f.backend.close();
    expect(f.requests.filter(r => r.method !== "GET")).toHaveLength(writes);
  });

  it("retains verified failure identity when a control command detects interruption before the poll", async () => {
    const f = fixture(); await f.backend.load(source); f.fail();
    await expect(f.backend.pause(false)).rejects.toMatchObject({ code: "PLAYBACK_INTERRUPTED" });
    await f.backend.close();
    expect(f.status.state).toBe("stop"); expect(f.outputs[0]!.selected).toBe(false);
  });

  it("reports failed cleanup instead of claiming the engine was released", async () => {
    const f = fixture(); await f.backend.load(source); f.fail();
    await vi.advanceTimersByTimeAsync(500);
    f.failures.set("player/stop", new Error("offline"));
    await expect(f.backend.close()).rejects.toMatchObject({ code: "ENGINE_UNAVAILABLE" });
    expect(f.status.state).toBe("pause"); expect(f.outputs[0]!.selected).toBe(true);
  });

  it("waits for a nonplaying state before cleaning up a terminal failure observed during transition", async () => {
    const f = fixture(); await f.backend.load(source); f.fail("output_lost", "play");
    await vi.advanceTimersByTimeAsync(500);
    expect(f.errors).toHaveBeenCalledTimes(1);
    f.status.state = "pause";
    await f.backend.close();
    expect(f.status.state).toBe("stop"); expect(f.outputs[0]!.selected).toBe(false);
  });

});
