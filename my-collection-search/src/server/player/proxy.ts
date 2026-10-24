import { timingSafeEqual } from "node:crypto";
import { createServerPlayerSchema, playerIdSchema, serverPlayerCommandSchema } from "@groovenet/contracts";

export type PlayerRouteContext = { params: Promise<{ playerId: string }> };

async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new RangeError("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString();
}

/** Players use explicit household bearer authorization, including reads/SSE. */
export async function proxyPlayer(request: Request, path: string, bodyType?: "create" | "command"): Promise<Response> {
  const key = process.env.PLAYER_API_KEY;
  const worker = process.env.PLAYER_WORKER_URL;
  if (!key || key.length < 32 || !worker) return Response.json({ error: "Server players are not configured", code: "PLAYERS_DISABLED" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${key}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  let body: string | undefined;
  if (bodyType) {
    try {
      const text = await readBody(request);
      const schema = bodyType === "create" ? createServerPlayerSchema : serverPlayerCommandSchema;
      const parsed = schema.safeParse(JSON.parse(text));
      if (!parsed.success) return Response.json({ error: "Invalid player command", code: "INVALID_ARGUMENT" }, { status: 400 });
      body = JSON.stringify(parsed.data);
    } catch (error) {
      return Response.json({ error: error instanceof RangeError ? "Player command exceeds 2 MB" : "Invalid JSON", code: error instanceof RangeError ? "BODY_TOO_LARGE" : "INVALID_JSON" }, { status: error instanceof RangeError ? 413 : 400 });
    }
  }
  const streaming = path.endsWith("/events");
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), streaming ? 5000 : 30000);
  try {
    const base = new URL(worker.endsWith("/") ? worker : `${worker}/`);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("Invalid worker URL");
    const upstream = await fetch(new URL(path.replace(/^\//, ""), base), {
      method: request.method, headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body } : {}), signal: AbortSignal.any([request.signal, controller.signal]), redirect: "error", cache: "no-store",
    });
    if (streaming && upstream.ok) {
      // Only the connection header deadline is cleared. request.signal still
      // cancels the worker subscription when the remote client disconnects.
      clearTimeout(deadline);
      return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
    }
    const payload: unknown = await upstream.json();
    return Response.json(payload, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Player worker unavailable", code: "WORKER_UNAVAILABLE" }, { status: 503 });
  } finally { clearTimeout(deadline); }
}

export async function proxyNamedPlayer(request: Request, context: PlayerRouteContext, suffix = "", bodyType?: "command"): Promise<Response> {
  const parsed = playerIdSchema.safeParse((await context.params).playerId);
  if (!parsed.success) return Response.json({ error: "Invalid player ID" }, { status: 400 });
  return proxyPlayer(request, `players/${parsed.data}${suffix}`, bodyType);
}
