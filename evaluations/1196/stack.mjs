/**
 * The worktree stack this evaluation runs against (#1196), and nothing else.
 * The app URL must be a loopback address and the database is reached through
 * `docker compose exec` on this worktree's own Compose project, so neither the
 * API calls nor the SQL can reach production.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Throws unless `url` is http(s) on a loopback host. */
export function assertLocalUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Not a URL: ${url}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !LOOPBACK.has(parsed.hostname))
    throw new Error(`Refusing ${url}: #1196 runs against a local worktree stack only`);
  return parsed.origin;
}

/** `KEY=value` lines; comments and blanks skipped, surrounding quotes dropped. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** This worktree's env file (`.worktree/<slug>.env`): project name and app port. */
export function worktreeEnv(root) {
  const dir = join(root, ".worktree");
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".env"));
  } catch {
    files = [];
  }
  if (files.length !== 1)
    throw new Error(`Expected one env file in ${dir}; run \`just worktree-up\` first`);
  const env = parseEnv(readFileSync(join(dir, files[0]), "utf8"));
  if (!env.COMPOSE_PROJECT_NAME || !env.APP_PORT)
    throw new Error(`${files[0]} has no COMPOSE_PROJECT_NAME or APP_PORT`);
  return { project: env.COMPOSE_PROJECT_NAME, appUrl: `http://127.0.0.1:${env.APP_PORT}` };
}

/**
 * Run one SQL statement that returns a single JSON value, in this worktree's
 * db container, and parse it. Read-only by convention: callers pass SELECTs.
 */
export function psqlJson(project, sql, run = execFileSync) {
  const out = run(
    "docker",
    [
      "compose",
      "-p",
      project,
      "exec",
      "-T",
      "db",
      "sh",
      "-c",
      'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -f -',
    ],
    { input: `BEGIN READ ONLY;\n${sql};\nCOMMIT;\n`, maxBuffer: 1 << 30, encoding: "utf8" },
  );
  const text = String(out).trim();
  return text ? JSON.parse(text) : null;
}

/** JSON over HTTP against the local app; a non-2xx is an error naming the path. */
export async function api(base, path, body, { method, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${base}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
