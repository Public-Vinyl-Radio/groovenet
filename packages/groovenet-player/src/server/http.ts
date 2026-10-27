import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { createServerPlayerSchema, playerIdSchema, serverPlayerCommandSchema } from "@groovenet/contracts";
import { PlayerError } from "../types.js";
import { ServerPlayerManager } from "./manager.js";
import { ServerPlayerError } from "./store.js";

function authorized(header: string | undefined, key: string): boolean {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${key}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 2 * 1024 * 1024) { request.resume(); throw new ServerPlayerError("BODY_TOO_LARGE", "Player command exceeds 2 MB", 413); }
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new ServerPlayerError("INVALID_JSON", "Invalid JSON request", 400); }
}
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

/** The worker API is private to Compose. Public clients go through the app. */
export function playerHttpServer(manager: ServerPlayerManager, key: string) {
  if (key.length < 32) throw new Error("PLAYER_API_KEY must contain at least 32 characters");
  const instance = randomUUID();
  let sequence = 0;
  const server = createServer((request, response) => {
    void (async () => {
      if (!authorized(request.headers.authorization, key)) { json(response, 401, { error: "Unauthorized", code: "UNAUTHORIZED" }); return; }
      const path = new URL(request.url ?? "/", "http://worker").pathname;
      if (request.method === "GET" && path === "/health") { json(response, 200, { status: "ok", instance }); return; }
      if (request.method === "GET" && path === "/engines") { json(response, 200, { engines: manager.engineIds() }); return; }
      if (path === "/players") {
        if (request.method === "GET") { json(response, 200, { players: manager.list() }); return; }
        if (request.method === "POST") { json(response, 201, await manager.create(createServerPlayerSchema.parse(await body(request)))); return; }
      }
      const allEvents = path === "/players/events";
      const match = /^\/players\/([^/]+)(?:\/(commands|devices|events))?$/.exec(path);
      if (!allEvents && !match) { json(response, 404, { error: "Not found" }); return; }
      const id = allEvents ? null : playerIdSchema.parse(match![1]);
      if (id !== null) {
        const player = manager.get(id);
        if (!match![2] && request.method === "GET") { json(response, 200, player); return; }
        if (match![2] === "devices" && request.method === "GET") { json(response, 200, { devices: await manager.devices(id) }); return; }
        if (match![2] === "commands" && request.method === "POST") { json(response, 200, await manager.command(id, serverPlayerCommandSchema.parse(await body(request)))); return; }
      }
      if ((allEvents || match![2] === "events") && request.method === "GET") {
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
        const send = (value: ReturnType<typeof manager.get>) => {
          if ((id !== null && value.id !== id) || response.destroyed) return;
          const event = JSON.stringify({ type: "snapshot", player: value, worker_instance: instance, sequence: ++sequence });
          // A slow/disconnected client is dropped; it never blocks the player.
          response.write(`event: snapshot\ndata: ${event}\n\n`);
          if (response.writableLength > 64 * 1024 * 1024) response.destroy();
        };
        const position = (value: { player_id: string }) => {
          if (value.player_id === id && !response.destroyed) {
            response.write(`event: position\ndata: ${JSON.stringify({ ...value, type: "position", worker_instance: instance, sequence: ++sequence })}\n\n`);
            if (response.writableLength > 64 * 1024 * 1024) response.destroy();
          }
        };
        const heartbeat = setInterval(() => { if (!response.destroyed && !response.write(": heartbeat\n\n")) response.destroy(); }, 15000);
        heartbeat.unref();
        const cleanup = () => { clearInterval(heartbeat); manager.off("snapshot", send); manager.off("position", position); };
        response.once("close", cleanup);
        manager.on("snapshot", send);
        if (id !== null) manager.on("position", position);
        if (id === null) {
          response.write(`event: players\ndata: ${JSON.stringify({ type: "players", players: manager.list(), worker_instance: instance, sequence: ++sequence })}\n\n`);
          if (response.writableLength > 64 * 1024 * 1024) response.destroy();
        } else send(manager.get(id));
        return;
      }
      json(response, 405, { error: "Method not allowed" });
    })().catch((error: unknown) => {
      if (response.headersSent) { response.destroy(); return; }
      const status = error instanceof ServerPlayerError ? error.status : error instanceof ZodError ? 400 : error instanceof PlayerError ? 422 : 502;
      const code = error instanceof ServerPlayerError ? error.code : error instanceof ZodError ? "INVALID_ARGUMENT" : error instanceof PlayerError ? error.code : "PLAYER_OPERATION_FAILED";
      json(response, status, { error: error instanceof ServerPlayerError ? error.message : "Player operation failed", code });
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
