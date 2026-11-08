import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { EventEmitter, once } from "node:events";
import { createServer, request } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = process.cwd();
const require = createRequire(join(root, "package.json"));
const { Pool } = require("pg");
const { PostgresPlayerStore } = await import(
  pathToFileURL(join(root, "packages/groovenet-player/build/server/store.js"))
);
const { ServerPlayerManager } = await import(
  pathToFileURL(join(root, "packages/groovenet-player/build/server/manager.js"))
);
const { playerHttpServer } = await import(
  pathToFileURL(join(root, "packages/groovenet-player/build/server/http.js"))
);
const name = `brick-1098-smoke-${process.pid}`;
const password = randomBytes(32).toString("hex");
const key = randomBytes(32).toString("hex");
const directory = mkdtempSync(join(tmpdir(), "brick-1098-"));
let store, manager, worker, proxy, pool;
let containerStarted = false;
class Backend extends EventEmitter {
  constructor() {
    super();
    this.position = 0;
    this.paused = false;
  }
  async load() {
    this.timer = setInterval(() => {
      if (!this.paused) this.emit("position", ++this.position, 120);
    }, 200);
  }
  async pause(value) {
    this.paused = value;
  }
  async seek(value) {
    this.position = value;
  }
  async setVolume() {}
  async outputConnection() {
    return "connected";
  }
  async listDevices() {
    return [{ id: "dummy", name: "Silent development output" }];
  }
  async close() {
    clearInterval(this.timer);
  }
}
try {
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--name",
      name,
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-p",
      "127.0.0.1::5432",
      "postgres:17-alpine",
    ],
    { stdio: "pipe" },
  );
  containerStarted = true;
  const port = execFileSync(
    "docker",
    ["inspect", "-f", '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', name],
    { encoding: "utf8" },
  ).trim();
  pool = new Pool({
    connectionString: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`,
  });
  for (let i = 0; ; i++) {
    try {
      await pool.query("SELECT 1");
      break;
    } catch (e) {
      if (i > 60) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  for (const migration of [
    "1792900000000_add-server-players.js",
    "1793000000000_add-player-availability-policy.js",
  ]) {
    const mod = await import(
      pathToFileURL(join(root, "my-collection-search/migrations", migration))
    );
    let sql;
    mod.up({
      sql(value) {
        sql = value;
      },
    });
    await pool.query(sql);
  }
  await pool.query(`CREATE TABLE tracks(track_id text, friend_id integer, title text, artist text, album text, local_audio_url text, album_thumbnail text);
    INSERT INTO tracks VALUES ('one',1,'Première chanson','Björk','Smoke album','one.wav',NULL),('two',1,'Second track','Artist','Smoke album','two.wav',NULL)`);
  store = new PostgresPlayerStore(pool);
  await store.acquire(() => {
    throw new Error("Development lease lost");
  });
  manager = new ServerPlayerManager(
    store,
    { development: { libraryRoot: "/silent", create: () => new Backend() } },
    async () => ({
      availability: "free",
      source: "unconfigured",
      observed_at: new Date().toISOString(),
      entity_id: null,
      sender_identity: "unknown",
      sender_engine_id: null,
    }),
  );
  await manager.initialize();
  await manager.create({
    id: "brick-smoke",
    name: "Disposable development player",
    engine_id: "development",
  });
  const command = (value) =>
    manager.command("brick-smoke", {
      ...value,
      expected_revision: manager.get("brick-smoke").revision,
    });
  await command({ type: "output.select", output_id: "dummy" });
  await command({
    type: "queue.add",
    tracks: [
      { track_id: "one", friend_id: 1 },
      { track_id: "two", friend_id: 1 },
    ],
  });
  await command({ type: "play" });
  worker = playerHttpServer(manager, key);
  worker.listen(0, "127.0.0.1");
  await once(worker, "listening");
  proxy = createServer(async (req, res) => {
    if (req.url === "/api/tracks/batch") {
      let bytes = "";
      for await (const part of req) bytes += part;
      const tracks = await Promise.all(JSON.parse(bytes).tracks.map((ref) => store.resolve(ref)));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tracks));
      return;
    }
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: worker.address().port,
        path: req.url.replace(/^\/api/, ""),
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => res.destroy());
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const native = spawn(join(root, "apps/groovenet-brick/build/brick-tests"), ["development"], {
    stdio: "inherit",
    env: {
      ...process.env,
      BRICK_URL: `http://127.0.0.1:${proxy.address().port}`,
      BRICK_PLAYER_KEY: key,
      BRICK_COLLECTION_KEY: key,
      BRICK_CA_FILE: "",
      BRICK_INSECURE_TLS: "0",
      BRICK_TEST_DIRECTORY: directory,
    },
  });
  const [code] = await once(native, "exit");
  if (code !== 0) throw new Error("Native development smoke failed");
  const persisted = await pool.query("SELECT state FROM server_players WHERE id=$1", [
    "brick-smoke",
  ]);
  if (persisted.rows[0].state.queue.length !== 2 || persisted.rows[0].state.status !== "playing")
    throw new Error("Exit changed the server queue");
  console.log(
    "Production manager + PostgreSQL + native REST/SSE smoke passed (silent backend; no physical speakers).",
  );
} finally {
  proxy?.close();
  proxy?.closeAllConnections();
  worker?.close();
  worker?.closeAllConnections();
  await manager?.shutdown();
  if (store) await store.release();
  else await pool?.end();
  if (containerStarted) execFileSync("docker", ["rm", "-f", name], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
}
