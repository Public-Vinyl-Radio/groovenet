import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { GET, POST, DELETE } from "@/app/api/players/browser/session/route";
import { playerWebSession } from "../webSession";
import { proxyPlayer } from "../proxy";
const key = "worker-secret-".repeat(4);
const passphrase = "separate-web-passphrase-".repeat(2);
const secret = "session-signing-secret-".repeat(3);
const origin = "https://app.example";
const request = (body?: string, method = body === undefined ? "GET" : "POST", headers: Record<string, string> = {}) => new Request(`${origin}/api/players/browser/session`, { method, headers: { origin, ...headers }, ...(body === undefined ? {} : { body }) });
const login = () => POST(request(JSON.stringify({ passphrase })));
const cookie = async () => (await login()).headers.get("set-cookie")!.split(";")[0]!;
const tokenExpiry = (session: string) => Number(session.split("=")[1]!.split(".")[1]);
let nextTestTime = Date.parse("2026-10-24T12:00:00Z");
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(nextTestTime); nextTestTime += 120000;
  vi.stubEnv("PLAYER_API_KEY", key); vi.stubEnv("PLAYER_WORKER_URL", "http://worker:13700");
  vi.stubEnv("PLAYER_WEB_PASSPHRASE", passphrase); vi.stubEnv("PLAYER_WEB_SESSION_SECRET", secret); vi.stubEnv("PLAYER_WEB_ORIGIN", origin);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ players: [] })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("player browser authorization", () => {
  it("unlocks with a separate credential, grants only a private scoped session and locks without contacting the worker", async () => {
    const response = await login(); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authorized: true });
    const setCookie = response.headers.get("set-cookie")!;
    for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/players", "Max-Age=31536000"]) expect(setCookie).toContain(flag);
    for (const credential of [key, passphrase, secret]) expect(setCookie).not.toContain(credential);
    const headers = { cookie: setCookie.split(";")[0]! };
    expect(playerWebSession(request(undefined, "GET", headers))).toBe(tokenExpiry(headers.cookie));
    expect(tokenExpiry(headers.cookie)).toBe(Math.floor(Date.now() / 1000) + 31536000);
    expect(await (await GET(request(undefined, "GET", headers))).json()).toEqual({ authorized: true });
    expect(await (await GET(request())).json()).toEqual({ authorized: false });
    const locked = await DELETE(request(undefined, "DELETE", headers)); expect(locked.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(playerWebSession(request(undefined, "GET", headers))).toBe(tokenExpiry(headers.cookie));
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([["1", 86400], ["30", 2592000], ["3650", 315360000]])("uses %s days for the cookie and signed expiry", async (days, seconds) => {
    vi.stubEnv("PLAYER_WEB_SESSION_DAYS", days);
    const response = await login();
    const setCookie = response.headers.get("set-cookie")!;
    expect(setCookie).toContain(`Max-Age=${seconds}`);
    const session = setCookie.split(";")[0]!;
    expect(tokenExpiry(session)).toBe(Math.floor(Date.now() / 1000) + seconds);
    expect(playerWebSession(request(undefined, "GET", { cookie: session }))).toBe(tokenExpiry(session));
  });
  it.each(["", "0", "-1", "1.5", " 2", "2 ", "+2", "1e2", "3651", "999999999999999999999", "NaN"])("fails closed for invalid session days %s", async days => {
    vi.stubEnv("PLAYER_WEB_SESSION_DAYS", days);
    expect((await login()).status).toBe(503);
    expect((await GET(request())).status).toBe(503);
  });
  it("invalidates a longer token when policy is shortened", async () => {
    vi.stubEnv("PLAYER_WEB_SESSION_DAYS", "3650");
    const session = await cookie();
    vi.stubEnv("PLAYER_WEB_SESSION_DAYS", "1");
    expect(playerWebSession(request(undefined, "GET", { cookie: session }))).toBeNull();
    expect(await (await GET(request(undefined, "GET", { cookie: session }))).json()).toEqual({ authorized: false });
    expect(playerWebSession(request(undefined, "GET", { cookie: await cookie() }))).not.toBeNull();
  });
  it("rejects missing, wrong, malformed and oversized credentials without echoing them", async () => {
    for (const body of [undefined, "null", "broken", "{}", JSON.stringify({ passphrase: key }), JSON.stringify({ passphrase: 42 })]) {
      const result = await POST(request(body, "POST")); expect(result.status).toBe(401); expect(await result.text()).not.toContain(key);
    }
    expect((await POST(request("x".repeat(4097)))).status).toBe(400);
  });
  it("rate limits a bounded global login budget", async () => {
    await vi.advanceTimersByTimeAsync(60000);
    for (let n = 0; n < 10; n++) expect((await POST(request("{}"))).status).toBe(401);
    const limited = await login(); expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
    await vi.advanceTimersByTimeAsync(60000); expect((await login()).status).toBe(200);
  });
  it.each([
    ["PLAYER_WEB_PASSPHRASE", ""], ["PLAYER_WEB_PASSPHRASE", "short"], ["PLAYER_WEB_PASSPHRASE", key],
    ["PLAYER_WEB_SESSION_SECRET", ""], ["PLAYER_WEB_SESSION_SECRET", "short"], ["PLAYER_WEB_SESSION_SECRET", key], ["PLAYER_WEB_SESSION_SECRET", passphrase],
    ["PLAYER_WEB_ORIGIN", ""], ["PLAYER_WEB_ORIGIN", "not a URL"], ["PLAYER_WEB_ORIGIN", "http://app.example"], ["PLAYER_WEB_ORIGIN", `${origin}/path`],
    ["PLAYER_WORKER_URL", ""], ["PLAYER_API_KEY", "short"],
  ])("fails closed with invalid %s=%s", async (name, value) => {
    vi.stubEnv(name, value); expect((await login()).status).toBe(503);
  });
  it("denies cross-origin login/logout/commands and cross-site reads, including same-site sibling origins", async () => {
    const session = await cookie();
    for (const method of ["POST", "DELETE"]) {
      expect((await POST(request("{}", method, { origin: "https://evil.example" }))).status).toBe(403);
      expect((await DELETE(request(undefined, method, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    }
    for (const headers of [{ origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }] as Record<string, string>[]) expect(playerWebSession(request(undefined, "GET", { ...headers, cookie: session }))).toBeNull();
    expect(playerWebSession(request("{}", "POST", { origin: "", cookie: session }))).toBeNull();
    expect(playerWebSession(request(undefined, "GET", { cookie: session, "sec-fetch-site": "same-origin" }))).not.toBeNull();
  });
  it("denies missing, malformed, tampered, expired, future and rotated sessions", async () => {
    const session = await cookie();
    for (const value of ["", "other=123", "__Secure-gn-player=x", `${session}.extra`, session.replace(/[^.]+$/, "short"), session.replace(/.$/, "x")]) expect(playerWebSession(request(undefined, "GET", { cookie: value }))).toBeNull();
    const future = `${Math.floor(Date.now()/1000) + 1}.${Math.floor(Date.now()/1000) + 86400}.nonce`;
    const signature = createHmac("sha256", secret).update(future).digest("base64url");
    expect(playerWebSession(request(undefined, "GET", { cookie: `__Secure-gn-player=${future}.${signature}` }))).toBeNull();
    vi.stubEnv("PLAYER_WEB_SESSION_SECRET", "rotated-secret".repeat(4)); expect(playerWebSession(request(undefined, "GET", { cookie: session }))).toBeNull();
    vi.stubEnv("PLAYER_WEB_SESSION_SECRET", secret); await vi.advanceTimersByTimeAsync(31536000001);
    expect(playerWebSession(request(undefined, "GET", { cookie: session }))).toBeNull();
  });
  it("authorizes reads and commands only after session validation, forwards the worker key privately and forbids administration", async () => {
    const session = await cookie();
    const read = request(undefined, "GET", { cookie: session });
    expect((await proxyPlayer(read, "players")).status).toBe(200);
    expect(fetch).toHaveBeenLastCalledWith(new URL("http://worker:13700/players"), expect.objectContaining({ headers: { Authorization: `Bearer ${key}` } }));
    const command = (body: unknown) => request(JSON.stringify(body), "POST", { cookie: session });
    expect((await proxyPlayer(command({ type: "pause", expected_revision: 3 }), "players/lounge/commands", "command")).status).toBe(200);
    expect((await proxyPlayer(command({ type: "rename", name: "Other", expected_revision: 3 }), "players/lounge/commands", "command")).status).toBe(403);
    expect((await proxyPlayer(command({ id: "new", name: "New", engine_id: "primary" }), "players", "create")).status).toBe(403);
    expect((await proxyPlayer(request(), "players")).status).toBe(401);
  });
  it("bounds authenticated event streams by session expiry and forwards client cancellation", async () => {
    const session = await cookie();
    let signal!: AbortSignal;
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => { signal = init!.signal!; return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("data: {}\n\n")); } })); });
    const abort = new AbortController();
    const result = await proxyPlayer(new Request(`${origin}/api/players/lounge/events`, { headers: { cookie: session }, signal: abort.signal }), "players/lounge/events");
    expect(result.status).toBe(200);
    await vi.advanceTimersByTimeAsync(2_147_483_647); expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(31536000000 - 2_147_483_647); expect(signal.aborted).toBe(true);
    await result.body!.cancel(); abort.abort();
  });
  it.each(["completion", "cancellation", "disconnect"])("clears a long stream deadline on %s", async ending => {
    const session = await cookie();
    vi.mocked(fetch).mockImplementationOnce(async () => new Response(new ReadableStream({
      start(controller) { if (ending === "completion") controller.close(); },
    })));
    const client = new AbortController();
    const result = await proxyPlayer(new Request(`${origin}/api/players/lounge/events`, { headers: { cookie: session }, signal: client.signal }), "players/lounge/events");
    if (ending !== "completion") expect(vi.getTimerCount()).toBe(1);
    if (ending === "completion") await result.text();
    else if (ending === "cancellation") await result.body!.cancel();
    else { client.abort(); await result.body!.cancel(); }
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("fails closed when the worker credential is absent", async () => {
  vi.stubEnv("PLAYER_API_KEY", undefined); expect((await login()).status).toBe(503);
});
