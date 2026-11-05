import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const NOW_PLAYING_APP = "Groovenet Now Playing.app";
const EXECUTABLE = join("Contents", "MacOS", "groovenet-now-playing");
const DEFAULT_BASE_URL = "https://github.com/Public-Vinyl-Radio/groovenet/releases/download";
/** A download directory this old belongs to a process that was killed mid-download. */
const STALE_DOWNLOAD_MS = 60 * 60 * 1000;
const BUILD_HINT = "Build it from a checkout instead: groovenet-now-playing --build";

/** The compiled `nowPlayingBin.js`, which a login item runs under an absolute `node`. */
export const NOW_PLAYING_BIN = fileURLToPath(new URL("./nowPlayingBin.js", import.meta.url));

export class HelperInstallError extends Error {}

export interface HelperContext {
  /** The `@groovenet/player` version, which names the release asset. */
  version: string;
  home: string;
  /** The package's `macos/` directory, where `--build` leaves a contributor build. */
  macosDir: string;
  /** Up to `/releases/download`; `<base>/groovenet-player-v<version>/<asset>` follows. */
  baseUrl: string;
  fetch: typeof fetch;
  /** Runs `ditto` and `codesign`; rejects when the command fails. */
  run: (command: string, args: string[]) => Promise<void>;
  log: (line: string) => void;
}

export type HelperSource = "build" | "cache" | "download";
export interface ResolvedHelper {
  path: string;
  source: HelperSource;
}

export function readPackageVersion(): string {
  const manifest = new URL("../package.json", import.meta.url);
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
}

export function defaultHelperContext(overrides: Partial<HelperContext> = {}): HelperContext {
  return {
    version: readPackageVersion(),
    home: homedir(),
    macosDir: fileURLToPath(new URL("../macos", import.meta.url)),
    baseUrl: process.env.GROOVENET_NOW_PLAYING_BASE_URL || DEFAULT_BASE_URL,
    fetch: (input, init) => fetch(input, init),
    run: async (command, args) => {
      // promisified here, not at import: the player index is imported by code
      // that mocks node:child_process.
      await promisify(execFile)(command, args);
    },
    log: (line) => console.error(line),
    ...overrides,
  };
}

/** `~/.groovenet/now-playing`: downloads, plus the login item's logs. */
export function helperRoot(home: string): string {
  return join(home, ".groovenet", "now-playing");
}

export function helperDir(home: string, version: string): string {
  return join(helperRoot(home), version);
}

function executableIn(app: string): string {
  return join(app, EXECUTABLE);
}

/**
 * A helper that is already on disk: a contributor build from `--build` first,
 * then a downloaded copy. Only the final `<version>/` directory counts, so the
 * temporary directory of an interrupted download is never mistaken for one.
 */
export function findHelper(ctx: HelperContext): ResolvedHelper | undefined {
  const built = executableIn(join(ctx.macosDir, ".build", NOW_PLAYING_APP));
  if (existsSync(built)) return { path: built, source: "build" };
  const cached = executableIn(join(helperDir(ctx.home, ctx.version), NOW_PLAYING_APP));
  if (existsSync(cached)) return { path: cached, source: "cache" };
  return undefined;
}

/** Makes sure a downloaded copy exists (never a contributor build), fetching it if not. */
export async function installHelper(ctx: HelperContext): Promise<ResolvedHelper> {
  const cached = executableIn(join(helperDir(ctx.home, ctx.version), NOW_PLAYING_APP));
  if (existsSync(cached)) return { path: cached, source: "cache" };
  await download(ctx);
  return { path: cached, source: "download" };
}

/** The helper to run: whatever is on disk, else a fresh download. */
export async function resolveHelper(ctx: HelperContext): Promise<ResolvedHelper> {
  return findHelper(ctx) ?? (await installHelper(ctx));
}

/** A loop, not /\/+$/, which CodeQL flags as polynomial on a long run of slashes. */
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

async function fetchBytes(ctx: HelperContext, url: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await ctx.fetch(url);
  } catch (error) {
    // undici reports "fetch failed" and keeps the real reason (ECONNREFUSED, ENOTFOUND) in cause.
    const cause = error instanceof Error ? error.cause : undefined;
    const reason = cause instanceof Error ? cause.message : String(cause ?? error);
    throw new HelperInstallError(`Could not download ${url} (${reason}). ${BUILD_HINT}`);
  }
  if (response.status === 404)
    throw new HelperInstallError(
      `No prebuilt helper exists for @groovenet/player ${ctx.version} (${url} returned 404). A version that is not released yet has none. ${BUILD_HINT}`,
    );
  if (!response.ok)
    throw new HelperInstallError(
      `Downloading ${url} failed with HTTP ${response.status}. ${BUILD_HINT}`,
    );
  return Buffer.from(await response.arrayBuffer());
}

async function runStep(ctx: HelperContext, what: string, command: string, args: string[]) {
  try {
    await ctx.run(command, args);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new HelperInstallError(`Could not ${what} the downloaded helper (${reason}).`);
  }
}

/** Removes temporary directories left by an interrupted download (SIGTERM, power loss). */
async function sweepStaleDownloads(root: string): Promise<void> {
  for (const name of await readdir(root)) {
    if (!name.startsWith(".download-")) continue;
    const path = join(root, name);
    const age = Date.now() - (await stat(path)).mtimeMs;
    if (age > STALE_DOWNLOAD_MS) await rm(path, { recursive: true, force: true });
  }
}

async function download(ctx: HelperContext): Promise<void> {
  const name = `groovenet-now-playing-${ctx.version}-macos-universal.zip`;
  const base = `${trimTrailingSlashes(ctx.baseUrl)}/groovenet-player-v${ctx.version}`;
  ctx.log(`Downloading Groovenet Now Playing ${ctx.version} (first run only)...`);
  const root = helperRoot(ctx.home);
  await mkdir(root, { recursive: true });
  await sweepStaleDownloads(root);
  // Everything happens in a sibling of the final directory and is renamed into
  // place last, so a half-finished download never looks installed.
  const work = await mkdtemp(join(root, ".download-"));
  try {
    const zip = join(work, name);
    await writeFile(zip, await fetchBytes(ctx, `${base}/${name}`));
    const checksum = (await fetchBytes(ctx, `${base}/${name}.sha256`)).toString("utf8");
    const expected = /^([0-9a-f]{64})(?:\s|$)/i.exec(checksum.trim())?.[1]?.toLowerCase();
    if (!expected)
      throw new HelperInstallError(`The checksum for ${name} is malformed. ${BUILD_HINT}`);
    const actual = createHash("sha256")
      .update(await readFile(zip))
      .digest("hex");
    if (actual !== expected) {
      await rm(zip, { force: true });
      throw new HelperInstallError(
        `Checksum mismatch for ${name}: expected ${expected}, got ${actual}. The download was discarded.`,
      );
    }
    const unpacked = join(work, "unpacked");
    await runStep(ctx, "unpack", "ditto", ["-x", "-k", zip, unpacked]);
    const app = join(unpacked, NOW_PLAYING_APP);
    if (!existsSync(executableIn(app)))
      throw new HelperInstallError(
        `${name} does not contain ${NOW_PLAYING_APP}/${EXECUTABLE}. ${BUILD_HINT}`,
      );
    // An ad-hoc signature does not depend on the path, so checking before the
    // rename is the same check and keeps a bad bundle from ever being installed.
    await runStep(ctx, "verify the signature of", "codesign", ["--verify", "--strict", app]);
    const target = helperDir(ctx.home, ctx.version);
    await rm(target, { recursive: true, force: true });
    await rename(unpacked, target);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
