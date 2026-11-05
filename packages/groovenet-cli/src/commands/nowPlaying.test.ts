import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HelperContext } from "@groovenet/player";

const player = vi.hoisted(() => ({ resolveHelper: vi.fn(), findHelper: vi.fn() }));
vi.mock("@groovenet/player", async (importActual) => ({
  ...(await importActual<typeof import("@groovenet/player")>()),
  resolveHelper: player.resolveHelper,
  findHelper: player.findHelper,
}));

import {
  BREW_SERVICE_LABEL,
  LAUNCH_AGENT_LABEL,
  NowPlayingCommandError,
  addNowPlayingCommands,
  defaultNowPlayingEnv,
  disableNowPlaying,
  enableNowPlaying,
  findBrewService,
  launchAgentLogs,
  launchAgentPath,
  nowPlayingStatus,
  renderLaunchAgent,
  type LaunchctlResult,
  type NowPlayingEnv,
} from "./nowPlaying.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "now-playing-cli-"));
  player.resolveHelper.mockReset().mockResolvedValue({ path: "/h/helper", source: "download" });
  player.findHelper.mockReset().mockReturnValue(undefined);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const ok: LaunchctlResult = { code: 0, stdout: "", stderr: "" };

function makeEnv(overrides: Partial<NowPlayingEnv> = {}) {
  // A stateful launchctl: bootstrap loads, bootout unloads (after `lag` more prints).
  const state = { loaded: false, lag: 0 };
  const fake = async (args: string[]): Promise<LaunchctlResult> => {
    if (args[0] === "bootstrap") {
      state.loaded = true;
      return ok;
    }
    if (args[0] === "bootout") {
      if (!state.loaded) return { code: 3, stdout: "", stderr: "" };
      state.loaded = state.lag > 0;
      return ok;
    }
    if (state.loaded && state.lag > 0 && --state.lag === 0) state.loaded = false;
    return state.loaded ? ok : { code: 113, stdout: "", stderr: "" };
  };
  const launchctl = vi.fn(fake);
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const env: NowPlayingEnv = {
    platform: "darwin",
    home: join(dir, "home"),
    uid: 501,
    nodePath: "/opt/node/bin/node",
    binPath: "/opt/lib/@groovenet/player/build/nowPlayingBin.js",
    helper: { version: "1.2.3" } as HelperContext,
    brewPrefixes: [join(dir, "brew")],
    launchctl,
    sleep,
    loadConfig: () => ({}),
    ...overrides,
  };
  return { env, launchctl, sleep, state, fake };
}

function touch(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "");
}

describe("renderLaunchAgent", () => {
  it("uses absolute paths, restarts, throttles and passes no target", () => {
    const { env } = makeEnv();
    const plist = renderLaunchAgent(env);
    expect(plist).toContain(`<string>${LAUNCH_AGENT_LABEL}</string>`);
    expect(plist).toContain(
      "<string>/opt/node/bin/node</string>\n    <string>/opt/lib/@groovenet/player/build/nowPlayingBin.js</string>",
    );
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>ThrottleInterval<\/key>\s*<integer>30<\/integer>/);
    expect(plist).toContain(launchAgentLogs(env.home).stdout);
    expect(plist).toContain(launchAgentLogs(env.home).stderr);
    expect(plist).not.toMatch(/--remote|--socket|now_playing_target/);
    expect(plist.match(/<string>/g)).toHaveLength(6);
  });

  it("escapes XML in paths", () => {
    const { env } = makeEnv({ nodePath: "/a&b/<node>" });
    expect(renderLaunchAgent(env)).toContain("/a&amp;b/&lt;node&gt;");
  });
});

describe("enable", () => {
  it("installs the helper, writes the plist, boots out then bootstraps", async () => {
    const { env, launchctl, state } = makeEnv();
    state.loaded = true;
    const result = await enableNowPlaying(env);
    const plist = launchAgentPath(env.home);
    expect(result).toMatchObject({ plist, helper: "/h/helper", helperSource: "download" });
    expect(readFileSync(plist, "utf8")).toBe(renderLaunchAgent(env));
    expect(player.resolveHelper).toHaveBeenCalledWith(env.helper);
    expect(launchctl.mock.calls.map(([args]) => args)).toEqual([
      ["bootout", `gui/501/${LAUNCH_AGENT_LABEL}`],
      ["print", `gui/501/${LAUNCH_AGENT_LABEL}`],
      ["bootstrap", "gui/501", plist],
    ]);
  });

  it("waits for a running agent to stop before bootstrapping", async () => {
    const { env, launchctl, state, sleep } = makeEnv();
    state.loaded = true;
    state.lag = 3;
    await enableNowPlaying(env);
    const verbs = launchctl.mock.calls.map(([args]) => args[0]);
    expect(verbs.indexOf("bootstrap")).toBeGreaterThan(verbs.lastIndexOf("print"));
    expect(sleep).toHaveBeenCalledWith(100);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up with a clear error if the agent never stops", async () => {
    const { env, launchctl, sleep } = makeEnv();
    launchctl.mockResolvedValue(ok);
    await expect(enableNowPlaying(env)).rejects.toThrow(/did not stop/);
    expect(sleep).toHaveBeenCalledTimes(50);
    expect(launchctl.mock.calls.some(([args]) => args[0] === "bootstrap")).toBe(false);
  });

  it("refuses off macOS", async () => {
    const { env, launchctl } = makeEnv({ platform: "linux" });
    await expect(enableNowPlaying(env)).rejects.toThrow(/only works on macOS/);
    expect(launchctl).not.toHaveBeenCalled();
  });

  it("refuses when the Homebrew service plist is in LaunchAgents", async () => {
    const { env, launchctl } = makeEnv();
    touch(join(env.home, "Library", "LaunchAgents", `${BREW_SERVICE_LABEL}.plist`));
    await expect(enableNowPlaying(env)).rejects.toThrow(/Homebrew service.*brew services/);
    expect(launchctl).not.toHaveBeenCalled();
    expect(player.resolveHelper).not.toHaveBeenCalled();
    expect(existsSync(launchAgentPath(env.home))).toBe(false);
  });

  it("refuses when the Homebrew service plist is under the brew prefix", async () => {
    const { env } = makeEnv();
    const brew = join(dir, "brew", "opt", "groovenet-now-playing", `${BREW_SERVICE_LABEL}.plist`);
    touch(brew);
    expect(findBrewService(env)).toBe(brew);
    await expect(enableNowPlaying(env)).rejects.toThrow(brew);
  });

  it("surfaces a failed download and writes nothing", async () => {
    player.resolveHelper.mockRejectedValueOnce(new Error("No prebuilt helper exists"));
    const { env, launchctl } = makeEnv();
    await expect(enableNowPlaying(env)).rejects.toThrow("No prebuilt helper exists");
    player.resolveHelper.mockRejectedValueOnce("odd");
    await expect(enableNowPlaying(env)).rejects.toThrow("odd");
    expect(launchctl).not.toHaveBeenCalled();
    expect(existsSync(launchAgentPath(env.home))).toBe(false);
  });

  it("reports a bootstrap failure with launchctl's message", async () => {
    const { env, launchctl } = makeEnv();
    const { fake } = makeEnv();
    launchctl.mockImplementation(async (args) =>
      args[0] === "bootstrap"
        ? { code: 5, stdout: "", stderr: "Input/output error\n" }
        : fake(args),
    );
    await expect(enableNowPlaying(env)).rejects.toThrow(/bootstrap failed \(5\): Input\/output/);
  });

  it("says when launchctl printed nothing", async () => {
    const { env, launchctl } = makeEnv();
    const { fake } = makeEnv();
    launchctl.mockImplementation(async (args) =>
      args[0] === "bootstrap" ? { code: 1, stdout: "", stderr: "" } : fake(args),
    );
    await expect(enableNowPlaying(env)).rejects.toThrow(/no output/);
  });
});

describe("disable", () => {
  it("boots out and removes the plist", async () => {
    const { env, launchctl, state } = makeEnv();
    state.loaded = true;
    touch(launchAgentPath(env.home));
    expect(await disableNowPlaying(env)).toMatchObject({ wasLoaded: true, removed: true });
    expect(existsSync(launchAgentPath(env.home))).toBe(false);
    expect(launchctl).toHaveBeenCalledWith(["bootout", `gui/501/${LAUNCH_AGENT_LABEL}`]);
  });

  it("still removes the plist when the agent was not loaded", async () => {
    const { env } = makeEnv();
    touch(launchAgentPath(env.home));
    expect(await disableNowPlaying(env)).toMatchObject({ wasLoaded: false, removed: true });
    expect(existsSync(launchAgentPath(env.home))).toBe(false);
  });

  it("is a no-op when nothing was enabled, and macOS only", async () => {
    const { env } = makeEnv();
    expect(await disableNowPlaying(env)).toMatchObject({ wasLoaded: false, removed: false });
    await expect(disableNowPlaying(makeEnv({ platform: "win32" }).env)).rejects.toThrow(
      NowPlayingCommandError,
    );
  });
});

describe("status", () => {
  it("reports helper, plist, loaded state and a remote target", async () => {
    const { env, launchctl, state } = makeEnv({
      loadConfig: () => ({ now_playing_target: "lounge" }),
    });
    state.loaded = true;
    player.findHelper.mockReturnValue({ path: "/h/helper", source: "cache" });
    touch(launchAgentPath(env.home));
    expect(await nowPlayingStatus(env)).toEqual({
      version: "1.2.3",
      helper: { path: "/h/helper", source: "cache" },
      plist: { path: launchAgentPath(env.home), present: true },
      loaded: true,
      target: "remote lounge",
      homebrew_service: null,
    });
    expect(launchctl).toHaveBeenCalledWith(["print", `gui/501/${LAUNCH_AGENT_LABEL}`]);
  });

  it("reports local, not installed, not loaded", async () => {
    const { env } = makeEnv();
    expect(await nowPlayingStatus(env)).toMatchObject({
      helper: null,
      plist: { present: false },
      loaded: false,
      target: "local",
    });
  });

  it("reports an invalid stored target instead of throwing", async () => {
    const { env } = makeEnv({ loadConfig: () => ({ now_playing_target: "../bad" }) });
    expect((await nowPlayingStatus(env)).target).toMatch(/Invalid now_playing_target/);
  });

  it("describes a non-Error config failure", async () => {
    const { env } = makeEnv({
      loadConfig: () => {
        throw "unreadable";
      },
    });
    expect((await nowPlayingStatus(env)).target).toBe("unreadable");
  });

  it("flags a Homebrew service and is macOS only", async () => {
    const { env } = makeEnv();
    touch(join(env.home, "Library", "LaunchAgents", `${BREW_SERVICE_LABEL}.plist`));
    expect((await nowPlayingStatus(env)).homebrew_service).toContain(BREW_SERVICE_LABEL);
    await expect(nowPlayingStatus(makeEnv({ platform: "linux" }).env)).rejects.toThrow(/macOS/);
  });
});

describe("commands", () => {
  async function run(env: NowPlayingEnv, ...args: string[]) {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => void out.push(String(line)));
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    const err: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const program = new Command().exitOverride();
    addNowPlayingCommands(program, () => env);
    await program.parseAsync(["node", "groovenet", "now-playing", ...args]);
    return { out: out.join("\n"), err: err.join(""), exit };
  }

  it("enable prints the paths and how to change the target", async () => {
    const { out } = await run(makeEnv().env, "enable");
    expect(out).toContain("helper: /h/helper (download)");
    expect(out).toContain("now_playing_target");
    expect(out).toContain("run this command again");
  });

  it("enable --json prints the result", async () => {
    const { out } = await run(makeEnv().env, "enable", "--json");
    expect(JSON.parse(out)).toMatchObject({ helper: "/h/helper" });
  });

  it("exits 1 with the message on a command error", async () => {
    const { err, exit } = await run(makeEnv({ platform: "linux" }).env, "enable");
    expect(err).toMatch(/only works on macOS/);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("rethrows unexpected errors", async () => {
    const { env } = makeEnv();
    env.launchctl = async () => {
      throw new Error("spawn failed");
    };
    await expect(run(env, "status")).rejects.toThrow("spawn failed");
  });

  it("disable says what happened", async () => {
    const { env, state } = makeEnv();
    state.loaded = true;
    expect((await run(env, "disable")).out).toContain(`Disabled ${LAUNCH_AGENT_LABEL}`);
    expect((await run(env, "disable")).out).toContain("was not enabled");
  });

  it("status renders installed and missing helpers", async () => {
    const { env, state } = makeEnv();
    state.loaded = true;
    touch(join(env.home, "Library", "LaunchAgents", `${BREW_SERVICE_LABEL}.plist`));
    let text = (await run(env, "status")).out;
    expect(text).toContain("not installed");
    expect(text).toContain("warning: Homebrew service");
    player.findHelper.mockReturnValue({ path: "/h/helper", source: "build" });
    text = (await run(env, "status")).out;
    expect(text).toContain("/h/helper (build, 1.2.3)");
    expect(text).toContain("loaded:  yes");
    expect(JSON.parse((await run(env, "status", "--json")).out).target).toBe("local");
  });
});

describe("status text", () => {
  it("shows a present plist that is not loaded, then an absent one that is", async () => {
    const { env, state } = makeEnv();
    touch(launchAgentPath(env.home));
    const present = vi.spyOn(console, "log").mockImplementation(() => {});
    const program = new Command().exitOverride();
    addNowPlayingCommands(program, () => env);
    await program.parseAsync(["node", "groovenet", "now-playing", "status"]);
    expect(present.mock.calls[0][0]).toMatch(/plist: {3}present[\s\S]*loaded: {2}no/);
    rmSync(launchAgentPath(env.home));
    state.loaded = true;
    await program.parseAsync(["node", "groovenet", "now-playing", "status"]);
    expect(present.mock.calls[1][0]).toMatch(/plist: {3}absent[\s\S]*loaded: {2}yes/);
  });
});

describe("defaultNowPlayingEnv", () => {
  it("falls back to uid 0 where process.getuid does not exist", () => {
    const original = process.getuid;
    Object.defineProperty(process, "getuid", { value: undefined, configurable: true });
    try {
      expect(defaultNowPlayingEnv().uid).toBe(0);
    } finally {
      Object.defineProperty(process, "getuid", { value: original, configurable: true });
    }
    expect(defaultNowPlayingEnv().uid).toBe(process.getuid?.());
  });

  it("adds HOMEBREW_PREFIX to the prefixes to check, and sleeps for real", async () => {
    vi.stubEnv("HOMEBREW_PREFIX", "/custom/brew");
    const env = defaultNowPlayingEnv();
    expect(env.brewPrefixes[0]).toBe("/custom/brew");
    vi.stubEnv("HOMEBREW_PREFIX", "");
    expect(defaultNowPlayingEnv().brewPrefixes).toEqual(["/opt/homebrew", "/usr/local"]);
    await expect(env.sleep(1)).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("reports a missing launchctl binary as a failure with a message", async () => {
    vi.stubEnv("PATH", "/nonexistent");
    const result = await defaultNowPlayingEnv().launchctl(["print", "x"]);
    vi.unstubAllEnvs();
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/ENOENT/);
  });

  it("uses the running node and the player's bin, and runs launchctl for real", async () => {
    const env = defaultNowPlayingEnv();
    expect(env.nodePath).toBe(process.execPath);
    expect(env.binPath).toMatch(/nowPlayingBin\.js$/);
    expect(env.brewPrefixes).toContain("/opt/homebrew");
    const missing = await env.launchctl(["definitely-not-a-subcommand"]);
    expect(missing.code).not.toBe(0);
    if (process.platform === "darwin") expect((await env.launchctl(["version"])).code).toBe(0);
  });
});
