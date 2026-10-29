import { Pool } from "pg";
import { z } from "zod";
import { OwnToneBackend } from "../ownToneBackend.js";
import { playerIdSchema } from "@groovenet/contracts";
import { ServerPlayerManager, type PlayerEngine } from "./manager.js";
import type { ServerPlay } from "./store.js";
import { PostgresPlayerStore } from "./store.js";
import { homeAssistantObserver } from "./observer.js";
import { playerHttpServer } from "./http.js";

import type { Server } from "node:http";
import type { EventEmitter } from "node:events";

export async function postServerPlay(appUrl: string, play: ServerPlay): Promise<void> {
  const response = await fetch(new URL("/api/spins", appUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      friend_id: play.friendId,
      release_id: play.releaseId,
      medium: "digital",
      played_at: play.startedAt.toISOString(),
      context_type: "player",
      track_refs: [{ track_id: play.trackId, friend_id: play.friendId }],
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (response.ok) return;
  if (
    response.status === 409 &&
    ((await response.json()) as { error?: string }).error === "Digital play already logged"
  )
    return;
  throw new Error(`Server play API returned ${response.status}`);
}

export async function runPlayerWorker(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: {
    store?: PostgresPlayerStore;
    manager?: ServerPlayerManager;
    server?: Server;
    signals?: EventEmitter;
  } = {},
) {
  const connectionSchema = z
    .object({
      apiUrl: z.url().refine((value) => {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      }),
      libraryRoot: z.string().startsWith("/"),
      password: z.string().optional(),
    })
    .strict();
  const configured = z
    .record(playerIdSchema, connectionSchema)
    .parse(JSON.parse(env.PLAYER_ENGINES_JSON ?? "{}"));
  if (Object.keys(configured).length === 0)
    throw new Error("PLAYER_ENGINES_JSON requires at least one dedicated engine");
  const urls = Object.values(configured).map((engine) =>
    new URL(engine.apiUrl).href.replace(/\/$/, ""),
  );
  if (new Set(urls).size !== urls.length)
    throw new Error("Each player engine must have a different API URL");
  const key = env.PLAYER_API_KEY ?? "";
  if (key.length < 32) throw new Error("PLAYER_API_KEY must contain at least 32 characters");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const ownerFriendId = z.coerce.number().int().positive().parse(env.PLAYER_LIBRARY_FRIEND_ID);
  const appUrl = z.url().parse(env.PLAYER_APP_URL ?? "http://app:3000");
  const engines: Record<string, PlayerEngine> = Object.fromEntries(
    Object.entries(configured).map(([id, options]) => [
      id,
      {
        libraryRoot: options.libraryRoot,
        create: (outputId?: string) =>
          new OwnToneBackend({ apiUrl: options.apiUrl, password: options.password, outputId }),
      },
    ]),
  );
  const entities = z
    .record(z.string(), z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/))
    .parse(JSON.parse(env.PLAYER_HA_ENTITIES_JSON ?? "{}"));
  const senders = z
    .record(
      playerIdSchema,
      z
        .record(z.string().min(1), z.string().min(1))
        .refine((value) => Object.keys(value).length > 0),
    )
    .parse(JSON.parse(env.PLAYER_HA_SENDERS_JSON ?? "{}"));
  for (const engineId of Object.keys(senders))
    if (!configured[engineId]) throw new Error("HA sender must reference a configured engine");
  const store =
    dependencies.store ??
    new PostgresPlayerStore(
      new Pool({
        connectionString: env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
        statement_timeout: 5000,
      }),
    );
  const logPlay = (play: ServerPlay) => postServerPlay(appUrl, play);
  const manager =
    dependencies.manager ??
    new ServerPlayerManager(
      store,
      engines,
      homeAssistantObserver({
        url: env.PLAYER_HA_URL,
        token: env.PLAYER_HA_TOKEN,
        entities,
        senders,
      }),
      { ownerFriendId, logPlay },
    );
  const server = dependencies.server ?? playerHttpServer(manager, key);
  const signals = dependencies.signals ?? process;
  let stopping = false;
  let shutdownPromise: Promise<void> | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let playRetry: NodeJS.Timeout | undefined;
  function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    clearInterval(heartbeat);
    clearInterval(playRetry);
    signals.off("SIGINT", stop);
    signals.off("SIGTERM", stop);
    server.close();
    server.closeAllConnections();
    shutdownPromise = (async () => {
      try {
        await manager.shutdown();
      } finally {
        manager.off("fault", failStop);
        await store.release();
      }
    })();
    return shutdownPromise;
  }
  const stop = () => {
    void shutdown().catch(() => {
      process.exitCode = 1;
    });
  };
  const failStop = () => {
    process.exitCode = 1;
    stop();
  };
  try {
    await store.acquire(failStop);
    manager.on("fault", failStop);
    await manager.initialize();
    if (stopping) throw new Error("Player worker lost its lease during initialization");
    let checking = false;
    heartbeat = setInterval(() => {
      if (checking) return;
      checking = true;
      void store
        .heartbeat()
        .catch(failStop)
        .finally(() => {
          checking = false;
        });
    }, 1000);
    void manager.retryPlays();
    playRetry = setInterval(() => {
      void manager.retryPlays();
    }, 30_000);
    signals.once("SIGINT", stop);
    signals.once("SIGTERM", stop);
    const port = z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PLAYER_WORKER_PORT ?? "13700");
    server.once("error", failStop);
    server.listen(port, "0.0.0.0", () => console.log(`Player worker listening on ${port}`));
    return { manager, server, store, shutdown };
  } catch (error) {
    await shutdown().catch(() => {});
    throw error;
  }
}
