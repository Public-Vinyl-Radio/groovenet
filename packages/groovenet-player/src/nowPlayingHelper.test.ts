import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HelperInstallError,
  NOW_PLAYING_APP,
  defaultHelperContext,
  findHelper,
  helperDir,
  helperRoot,
  installHelper,
  readPackageVersion,
  resolveHelper,
  type HelperContext,
} from "./nowPlayingHelper.js";

const VERSION = "1.2.3";
const ZIP = `groovenet-now-playing-${VERSION}-macos-universal.zip`;
const BASE = "https://mirror.test/releases";
const ZIP_URL = `${BASE}/groovenet-player-v${VERSION}/${ZIP}`;
const BYTES = Buffer.from("zip-bytes");
const SHA = createHash("sha256").update(BYTES).digest("hex");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "now-playing-helper-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function executable(app: string): string {
  return join(app, "Contents", "MacOS", "groovenet-now-playing");
}

function touch(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "");
}

function reply(status: number, body: Buffer | string = ""): Response {
  return new Response(body, { status });
}

interface Setup {
  ctx: HelperContext;
  fetch: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
}

function setup({
  zip = reply(200, BYTES) as Response | Error,
  sum = reply(200, `${SHA}  ${ZIP}\n`) as Response | Error,
  unpack = true,
  runFails = "",
} = {}): Setup {
  const fetch = vi.fn(async (url: string | URL | Request) => {
    const result = String(url).endsWith(".sha256") ? sum : zip;
    if (result instanceof Error) throw result;
    return result.clone();
  });
  const run = vi.fn(async (command: string, args: string[]) => {
    if (runFails === command) throw new Error(`${command} exploded`);
    if (command === "ditto" && unpack) touch(executable(join(args[3], NOW_PLAYING_APP)));
  });
  const log = vi.fn();
  const ctx: HelperContext = {
    version: VERSION,
    home: join(dir, "home"),
    macosDir: join(dir, "macos"),
    baseUrl: BASE,
    fetch: fetch as unknown as typeof globalThis.fetch,
    run,
    log,
  };
  return { ctx, fetch, run, log };
}

const cachedExecutable = (ctx: HelperContext) =>
  executable(join(helperDir(ctx.home, ctx.version), NOW_PLAYING_APP));
const builtExecutable = (ctx: HelperContext) =>
  executable(join(ctx.macosDir, ".build", NOW_PLAYING_APP));

describe("resolution order", () => {
  it("prefers a contributor build over a cached download", async () => {
    const { ctx, fetch } = setup();
    touch(builtExecutable(ctx));
    touch(cachedExecutable(ctx));
    expect(findHelper(ctx)).toEqual({ path: builtExecutable(ctx), source: "build" });
    expect(await resolveHelper(ctx)).toEqual({ path: builtExecutable(ctx), source: "build" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the cached download without fetching when there is no build", async () => {
    const { ctx, fetch } = setup();
    touch(cachedExecutable(ctx));
    expect(await resolveHelper(ctx)).toEqual({ path: cachedExecutable(ctx), source: "cache" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("downloads when neither exists", async () => {
    const { ctx } = setup();
    expect(findHelper(ctx)).toBeUndefined();
    expect(await resolveHelper(ctx)).toEqual({ path: cachedExecutable(ctx), source: "download" });
  });

  it("installHelper ignores a contributor build and downloads", async () => {
    const { ctx, fetch } = setup();
    touch(builtExecutable(ctx));
    expect((await installHelper(ctx)).source).toBe("download");
    expect(fetch).toHaveBeenCalled();
  });
});

describe("download", () => {
  it("verifies the checksum, unpacks, verifies the signature and installs atomically", async () => {
    const { ctx, fetch, run, log } = setup();
    await installHelper(ctx);
    expect(fetch).toHaveBeenCalledWith(ZIP_URL);
    expect(fetch).toHaveBeenCalledWith(`${ZIP_URL}.sha256`);
    expect(run).toHaveBeenNthCalledWith(1, "ditto", [
      "-x",
      "-k",
      expect.stringContaining(ZIP),
      expect.stringContaining("unpacked"),
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "codesign", [
      "--verify",
      "--strict",
      expect.stringContaining(NOW_PLAYING_APP),
    ]);
    expect(existsSync(cachedExecutable(ctx))).toBe(true);
    expect(readdirSync(helperRoot(ctx.home))).toEqual([VERSION]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(VERSION));
  });

  it("does not download again once installed", async () => {
    const { ctx, fetch } = setup();
    await installHelper(ctx);
    fetch.mockClear();
    expect((await installHelper(ctx)).source).toBe("cache");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts an upper-case checksum and a trailing-slash base URL", async () => {
    const { ctx, fetch } = setup({ sum: reply(200, SHA.toUpperCase()) });
    ctx.baseUrl = `${BASE}///`;
    await installHelper(ctx);
    expect(fetch).toHaveBeenCalledWith(ZIP_URL);
  });

  it("replaces a damaged install that has no executable", async () => {
    const { ctx } = setup();
    touch(join(helperDir(ctx.home, VERSION), "stale"));
    await installHelper(ctx);
    expect(existsSync(join(helperDir(ctx.home, VERSION), "stale"))).toBe(false);
    expect(existsSync(cachedExecutable(ctx))).toBe(true);
  });

  it("rejects a checksum mismatch, deleting the download", async () => {
    const { ctx, run } = setup({ sum: reply(200, `${"0".repeat(64)}  ${ZIP}\n`) });
    await expect(installHelper(ctx)).rejects.toThrow(/Checksum mismatch.*discarded/);
    expect(run).not.toHaveBeenCalled();
    expect(readdirSync(helperRoot(ctx.home))).toEqual([]);
  });

  it("rejects a malformed checksum file", async () => {
    const { ctx, run } = setup({ sum: reply(200, "not a checksum") });
    await expect(installHelper(ctx)).rejects.toThrow(/malformed/);
    expect(run).not.toHaveBeenCalled();
  });

  it("says a 404 means the version is not released and suggests --build", async () => {
    const { ctx } = setup({ zip: reply(404) });
    const error = await installHelper(ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HelperInstallError);
    expect((error as Error).message).toMatch(/not released yet.*groovenet-now-playing --build/);
    expect(readdirSync(helperRoot(ctx.home))).toEqual([]);
  });

  it("reports other HTTP failures", async () => {
    const { ctx } = setup({ sum: reply(500) });
    await expect(installHelper(ctx)).rejects.toThrow(/HTTP 500.*--build/);
  });

  it("reports a network error and suggests --build", async () => {
    const failure = new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED") });
    const { ctx } = setup({ zip: failure });
    await expect(installHelper(ctx)).rejects.toThrow(/Could not download.*ECONNREFUSED.*--build/);
    expect(existsSync(helperDir(ctx.home, VERSION))).toBe(false);
  });

  it("describes a non-Error rejection", async () => {
    const { ctx } = setup();
    ctx.fetch = (async () => {
      throw "offline";
    }) as unknown as typeof fetch;
    await expect(installHelper(ctx)).rejects.toThrow(/\(offline\)/);
  });

  it("fails when the archive lacks the executable and installs nothing", async () => {
    const { ctx, run } = setup({ unpack: false });
    await expect(installHelper(ctx)).rejects.toThrow(/does not contain/);
    expect(run).toHaveBeenCalledTimes(1);
    expect(readdirSync(helperRoot(ctx.home))).toEqual([]);
  });

  it("does not install when ditto fails", async () => {
    const { ctx } = setup({ runFails: "ditto" });
    await expect(installHelper(ctx)).rejects.toThrow(/Could not unpack.*ditto exploded/);
    expect(readdirSync(helperRoot(ctx.home))).toEqual([]);
  });

  it("does not install when the signature does not verify", async () => {
    const { ctx } = setup({ runFails: "codesign" });
    await expect(installHelper(ctx)).rejects.toThrow(/Could not verify the signature/);
    expect(readdirSync(helperRoot(ctx.home))).toEqual([]);
    expect(findHelper(ctx)).toBeUndefined();
  });

  it("describes a non-Error failure from a command", async () => {
    const { ctx } = setup();
    ctx.run = async () => {
      throw "boom";
    };
    await expect(installHelper(ctx)).rejects.toThrow(/\(boom\)/);
  });
});

describe("half-finished downloads", () => {
  it("does not treat a leftover temporary directory as installed", async () => {
    const { ctx, fetch } = setup();
    touch(executable(join(helperRoot(ctx.home), ".download-abc123", "unpacked", NOW_PLAYING_APP)));
    touch(join(helperDir(ctx.home, VERSION), NOW_PLAYING_APP, "Contents", "Info.plist"));
    expect(findHelper(ctx)).toBeUndefined();
    await resolveHelper(ctx);
    expect(fetch).toHaveBeenCalled();
  });
});

describe("interrupted downloads", () => {
  it("sweeps old temporary directories but leaves recent ones and other files", async () => {
    const { ctx } = setup();
    const root = helperRoot(ctx.home);
    touch(join(root, ".download-old", "partial.zip"));
    touch(join(root, ".download-recent", "partial.zip"));
    touch(join(root, "launchd.out.log"));
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(join(root, ".download-old"), longAgo, longAgo);
    await installHelper(ctx);
    expect(readdirSync(root).sort()).toEqual([".download-recent", VERSION, "launchd.out.log"]);
  });
});

describe("defaults", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the package version and honours the base URL override", () => {
    vi.stubEnv("GROOVENET_NOW_PLAYING_BASE_URL", "https://mirror.test/x");
    const ctx = defaultHelperContext();
    expect(ctx.version).toBe(readPackageVersion());
    expect(ctx.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(ctx.baseUrl).toBe("https://mirror.test/x");
    expect(ctx.macosDir).toMatch(/macos$/);
  });

  it("defaults to the GitHub release URL and lets callers override fields", () => {
    vi.stubEnv("GROOVENET_NOW_PLAYING_BASE_URL", "");
    expect(defaultHelperContext({ version: "9.9.9" })).toMatchObject({
      version: "9.9.9",
      baseUrl: "https://github.com/Public-Vinyl-Radio/groovenet/releases/download",
    });
  });

  it("wires fetch, run and log to the real implementations", async () => {
    const ctx = defaultHelperContext();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    ctx.log("hello");
    expect(error).toHaveBeenCalledWith("hello");
    error.mockRestore();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    expect(await (await ctx.fetch("https://x.test/")).text()).toBe("ok");
    fetchSpy.mockRestore();
    await expect(ctx.run("true", [])).resolves.toBeUndefined();
    await expect(ctx.run("false", [])).rejects.toThrow();
  });
});
