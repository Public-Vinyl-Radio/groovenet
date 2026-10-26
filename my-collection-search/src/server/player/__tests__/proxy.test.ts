import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as list, POST as create } from "@/app/api/players/route";
import { GET as engines } from "@/app/api/players/engines/route";
import { GET as state } from "@/app/api/players/[playerId]/route";
import { POST as command } from "@/app/api/players/[playerId]/commands/route";
import { GET as devices } from "@/app/api/players/[playerId]/devices/route";
import { GET as events } from "@/app/api/players/[playerId]/events/route";
const key = "x".repeat(40);
const context = { params: Promise.resolve({ playerId: "lounge" }) };
const transport = vi.fn();
const request = (body?: string, authorization = `Bearer ${key}`) => new Request("http://app/api/players", { headers: { authorization }, method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body }) });
describe("authenticated player API proxy", () => {
  beforeEach(() => { vi.stubEnv("PLAYER_API_KEY", key); vi.stubEnv("PLAYER_WORKER_URL", "http://worker:13700"); vi.stubGlobal("fetch", transport); transport.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
  it("disables unconfigured players and rejects missing or incorrect keys before contacting the worker", async () => {
    vi.stubEnv("PLAYER_API_KEY", ""); expect((await list(request())).status).toBe(503);
    vi.stubEnv("PLAYER_API_KEY", key); expect((await list(request(undefined, ""))).status).toBe(401);
    expect((await list(request(undefined, `Bearer ${"z".repeat(40)}`))).status).toBe(401);
    expect(transport).not.toHaveBeenCalled();
  });
  it("forwards only configured paths, validated bodies and the authenticated key", async () => {
    transport.mockImplementation(async () => Response.json({ players: [] }));
    expect((await list(request())).status).toBe(200);
    expect(transport).toHaveBeenLastCalledWith(new URL("http://worker:13700/players"), expect.objectContaining({ headers: { Authorization: `Bearer ${key}` }, redirect: "error", cache: "no-store" }));
    await engines(request()); await state(request(), context); await devices(request(), context);
    expect(transport.mock.calls.map(c => String(c[0]))).toContain("http://worker:13700/players/lounge/devices");
    await create(request('{"id":"lounge","name":"Lounge","engine_id":"primary"}'));
    await command(request('{"type":"pause","expected_revision":3}'), context);
    expect(transport).toHaveBeenLastCalledWith(new URL("http://worker:13700/players/lounge/commands"), expect.objectContaining({ method: "POST", body: '{"type":"pause","expected_revision":3}' }));
    await command(request('{"type":"availability.set","availability_policy":"always","expected_revision":3}'), context);
    expect(transport).toHaveBeenLastCalledWith(new URL("http://worker:13700/players/lounge/commands"), expect.objectContaining({ body: '{"type":"availability.set","expected_revision":3,"availability_policy":"always"}' }));
  });
  it("rejects malformed, oversized, unsafe-path and source-injection commands", async () => {
    expect((await create(request("broken"))).status).toBe(400);
    expect((await command(request("{}"), context)).status).toBe(400);
    expect((await create(request("x".repeat(2 * 1024 * 1024 + 1)))).status).toBe(413);
    expect((await state(request(), { params: Promise.resolve({ playerId: "../secret" }) })).status).toBe(400);
    expect((await create(request('{"id":"lounge","name":"Lounge","engine_id":"primary","apiUrl":"http://secret"}'))).status).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  });
  it("preserves revision conflicts and hides unreachable/invalid worker details", async () => {
    transport.mockResolvedValueOnce(Response.json({ code: "REVISION_CONFLICT", error: "Refresh" }, { status: 409 }));
    expect((await command(request('{"type":"pause","expected_revision":0}'), context)).status).toBe(409);
    transport.mockRejectedValueOnce(new Error("secret URL"));
    const failure = await list(request()); expect(failure.status).toBe(503); expect(await failure.text()).not.toContain("secret");
    vi.stubEnv("PLAYER_WORKER_URL", "file:///secret"); expect((await list(request())).status).toBe(503);
  });
  it("streams subscriptions with the client abort signal and no cache", async () => {
    transport.mockResolvedValueOnce(new Response('event: snapshot\ndata: {}\n\n', { headers: { "Content-Type": "text/event-stream" } }));
    const result = await events(request(), context);
    expect(result.headers.get("content-type")).toBe("text/event-stream");
    expect(await result.text()).toContain("event: snapshot");
    expect(transport.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
  });
  it("handles empty bodies, absent headers and normalized worker URL slashes", async () => {
    expect((await list(new Request("http://app/api/players"))).status).toBe(401);
    expect((await create(new Request("http://app/api/players", { method: "POST", headers: { Authorization: `Bearer ${key}` } }))).status).toBe(400);
    vi.stubEnv("PLAYER_WORKER_URL", "http://worker:13700/");
    transport.mockResolvedValueOnce(Response.json({ players: [] }));
    expect((await list(request())).status).toBe(200);
  });
  it("times out an unreachable worker without leaking connection details", async () => {
    vi.useFakeTimers();
    transport.mockImplementationOnce(async (_url, init) => new Promise((_resolve, reject) => { init.signal.addEventListener("abort", () => reject(new Error("aborted"))); }));
    const result = list(request());
    await vi.advanceTimersByTimeAsync(30001);
    expect((await result).status).toBe(503);
  });

});

describe("event stream lifetime", () => {
  beforeEach(() => { vi.stubEnv("PLAYER_API_KEY", key); vi.stubEnv("PLAYER_WORKER_URL", "http://worker:13700"); vi.stubGlobal("fetch", transport); transport.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("denies missing upstream event bodies and propagates a failed stream without keeping its deadline", async () => {
    transport.mockResolvedValueOnce(new Response(null));
    expect((await events(request(), context)).status).toBe(503);
    transport.mockResolvedValueOnce(new Response(new ReadableStream({ pull(controller) { controller.error(new Error("Stream interrupted")); } })));
    const response = await events(request(), context);
    await expect(response.text()).rejects.toThrow("Stream interrupted");
  });
});
