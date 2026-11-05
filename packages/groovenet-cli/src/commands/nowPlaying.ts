import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { loadConfig, type GroovenetConfig } from "@groovenet/client";
import {
  NOW_PLAYING_BIN,
  defaultHelperContext,
  findHelper,
  helperRoot,
  resolveHelper,
  resolveNowPlayingTarget,
  type HelperContext,
  type HelperSource,
} from "@groovenet/player";
import { printError, printJson } from "../output.js";

// `groovenet now-playing enable|disable|status`: a LaunchAgent that starts the
// macOS Now Playing helper at login, for npm users. Homebrew users get the same
// from `brew services` (a different label), and the two must not both run.

export const LAUNCH_AGENT_LABEL = "radio.publicvinyl.groovenet.nowplaying";
export const BREW_SERVICE_LABEL = "homebrew.mxcl.groovenet-now-playing";
const BREW_FORMULA = "groovenet-now-playing";
/** Seconds launchd waits between restarts, so a dead daemon doesn't spin. */
const THROTTLE_INTERVAL = 30;
const UNLOAD_ATTEMPTS = 50;
const UNLOAD_POLL_MS = 100;

export class NowPlayingCommandError extends Error {}

export interface LaunchctlResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface NowPlayingEnv {
  platform: NodeJS.Platform;
  home: string;
  uid: number;
  /** Absolute `node`: launchd's PATH finds neither it nor the npm bin. */
  nodePath: string;
  binPath: string;
  helper: HelperContext;
  brewPrefixes: string[];
  launchctl: (args: string[]) => Promise<LaunchctlResult>;
  sleep: (ms: number) => Promise<void>;
  loadConfig: () => Pick<GroovenetConfig, "now_playing_target">;
}

export function defaultNowPlayingEnv(): NowPlayingEnv {
  const helper = defaultHelperContext();
  return {
    platform: process.platform,
    home: helper.home,
    uid: process.getuid?.() ?? 0,
    nodePath: process.execPath,
    binPath: NOW_PLAYING_BIN,
    helper,
    brewPrefixes: [process.env.HOMEBREW_PREFIX, "/opt/homebrew", "/usr/local"].filter(
      (prefix): prefix is string => Boolean(prefix),
    ),
    launchctl: (args) =>
      new Promise((resolve) => {
        execFile("launchctl", args, (error, stdout, stderr) => {
          const code = !error ? 0 : typeof error.code === "number" ? error.code : 1;
          resolve({ code, stdout, stderr: stderr || error?.message || "" });
        });
      }),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    loadConfig,
  };
}

export const launchAgentPath = (home: string) =>
  join(home, "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);

export const launchAgentLogs = (home: string) => ({
  stdout: join(helperRoot(home), "launchd.out.log"),
  stderr: join(helperRoot(home), "launchd.err.log"),
});

const xml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The login item runs `node nowPlayingBin.js` with no arguments. The target is
 * deliberately not in here: the helper reads `now_playing_target` itself, so
 * changing the config and restarting is enough.
 */
export function renderLaunchAgent(env: NowPlayingEnv): string {
  const logs = launchAgentLogs(env.home);
  const args = [env.nodePath, env.binPath].map((arg) => `    <string>${xml(arg)}</string>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.join("\n")}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>${THROTTLE_INTERVAL}</integer>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>StandardOutPath</key>
  <string>${xml(logs.stdout)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logs.stderr)}</string>
</dict>
</plist>
`;
}

function requireMac(env: NowPlayingEnv): void {
  if (env.platform !== "darwin")
    throw new NowPlayingCommandError(
      "groovenet now-playing manages a macOS login item and only works on macOS.",
    );
}

/** The Homebrew service's plist, if `brew services` has set it up. */
export function findBrewService(env: NowPlayingEnv): string | undefined {
  return [
    join(env.home, "Library", "LaunchAgents", `${BREW_SERVICE_LABEL}.plist`),
    ...env.brewPrefixes.map((prefix) =>
      join(prefix, "opt", BREW_FORMULA, `${BREW_SERVICE_LABEL}.plist`),
    ),
  ].find((path) => existsSync(path));
}

const service = (env: NowPlayingEnv) => `gui/${env.uid}/${LAUNCH_AGENT_LABEL}`;

async function isLoaded(env: NowPlayingEnv): Promise<boolean> {
  return (await env.launchctl(["print", service(env)])).code === 0;
}

/**
 * `launchctl bootout` returns before the old process has exited, and a
 * bootstrap in that window fails with an unhelpful "Input/output error". Wait
 * for the service to be gone. Returns whether anything was loaded.
 */
async function unload(env: NowPlayingEnv): Promise<boolean> {
  if ((await env.launchctl(["bootout", service(env)])).code !== 0) return false;
  for (let attempt = 0; attempt < UNLOAD_ATTEMPTS; attempt++) {
    if (!(await isLoaded(env))) return true;
    await env.sleep(UNLOAD_POLL_MS);
  }
  throw new NowPlayingCommandError(
    `${LAUNCH_AGENT_LABEL} did not stop after launchctl bootout. Try again in a moment.`,
  );
}

export interface EnableResult {
  plist: string;
  helper: string;
  helperSource: HelperSource;
  logs: { stdout: string; stderr: string };
}

export async function enableNowPlaying(env: NowPlayingEnv): Promise<EnableResult> {
  requireMac(env);
  const brew = findBrewService(env);
  if (brew)
    throw new NowPlayingCommandError(
      `The Homebrew service is already set up (${brew}). Running both would start two helpers: use "brew services" instead, or run "brew services stop ${BREW_FORMULA}" first.`,
    );
  let helper;
  try {
    helper = await resolveHelper(env.helper);
  } catch (error) {
    throw new NowPlayingCommandError(error instanceof Error ? error.message : String(error));
  }
  const plist = launchAgentPath(env.home);
  const logs = launchAgentLogs(env.home);
  await mkdir(join(env.home, "Library", "LaunchAgents"), { recursive: true });
  await mkdir(helperRoot(env.home), { recursive: true });
  // Unload a previous copy first so re-running picks up a new node or package path.
  await unload(env);
  await writeFile(plist, renderLaunchAgent(env), { mode: 0o644 });
  const result = await env.launchctl(["bootstrap", `gui/${env.uid}`, plist]);
  if (result.code !== 0)
    throw new NowPlayingCommandError(
      `launchctl bootstrap failed (${result.code}): ${result.stderr.trim() || "no output"}. The plist is at ${plist}.`,
    );
  return { plist, helper: helper.path, helperSource: helper.source, logs };
}

export interface DisableResult {
  plist: string;
  wasLoaded: boolean;
  removed: boolean;
}

export async function disableNowPlaying(env: NowPlayingEnv): Promise<DisableResult> {
  requireMac(env);
  const plist = launchAgentPath(env.home);
  const wasLoaded = await unload(env);
  const removed = existsSync(plist);
  await rm(plist, { force: true });
  return { plist, wasLoaded, removed };
}

export interface StatusResult {
  version: string;
  helper: { path: string; source: HelperSource } | null;
  plist: { path: string; present: boolean };
  loaded: boolean;
  /** `local`, `remote <id>`, or why the stored value is unusable. */
  target: string;
  homebrew_service: string | null;
}

export async function nowPlayingStatus(env: NowPlayingEnv): Promise<StatusResult> {
  requireMac(env);
  const helper = findHelper(env.helper);
  const plist = launchAgentPath(env.home);
  let target: string;
  try {
    const resolved = resolveNowPlayingTarget([], env.loadConfig());
    target = resolved.mode === "remote" ? `remote ${resolved.playerId}` : "local";
  } catch (error) {
    target = error instanceof Error ? error.message : String(error);
  }
  return {
    version: env.helper.version,
    helper: helper ? { path: helper.path, source: helper.source } : null,
    plist: { path: plist, present: existsSync(plist) },
    loaded: await isLoaded(env),
    target,
    homebrew_service: findBrewService(env) ?? null,
  };
}

async function run<T>(json: boolean | undefined, action: () => Promise<T>, text: (r: T) => string) {
  try {
    const result = await action();
    if (json) printJson(result);
    else console.log(text(result));
  } catch (error) {
    if (!(error instanceof NowPlayingCommandError)) throw error;
    printError(error.message);
    process.exit(1);
  }
}

export function addNowPlayingCommands(
  program: Command,
  makeEnv: () => NowPlayingEnv = defaultNowPlayingEnv,
): void {
  const group = program
    .command("now-playing")
    .description("Start the macOS Now Playing helper at login (macOS only)");

  group
    .command("enable")
    .description("Install the helper if needed and load a LaunchAgent that starts it at login")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) =>
      run(
        opts.json,
        () => enableNowPlaying(makeEnv()),
        (r) =>
          [
            `Enabled ${LAUNCH_AGENT_LABEL}: Groovenet Now Playing starts at login and restarts if it exits.`,
            `  helper: ${r.helper} (${r.helperSource})`,
            `  plist:  ${r.plist}`,
            `  logs:   ${r.logs.stdout}, ${r.logs.stderr}`,
            "It follows now_playing_target from the CLI config. After changing it with",
            "`groovenet config set now_playing_target <player-id|local>`, run this command again to restart it.",
          ].join("\n"),
      ),
    );

  group
    .command("disable")
    .description("Stop the LaunchAgent and remove its plist")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) =>
      run(
        opts.json,
        () => disableNowPlaying(makeEnv()),
        (r) =>
          r.wasLoaded || r.removed
            ? `Disabled ${LAUNCH_AGENT_LABEL}.`
            : `${LAUNCH_AGENT_LABEL} was not enabled.`,
      ),
    );

  group
    .command("status")
    .description("Show the installed helper, the LaunchAgent and the target it follows")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) =>
      run(
        opts.json,
        () => nowPlayingStatus(makeEnv()),
        (r) =>
          [
            `helper:  ${r.helper ? `${r.helper.path} (${r.helper.source}, ${r.version})` : `not installed (run groovenet-now-playing --install; wants ${r.version})`}`,
            `plist:   ${r.plist.present ? "present" : "absent"} (${r.plist.path})`,
            `loaded:  ${r.loaded ? "yes" : "no"}`,
            `target:  ${r.target}`,
            ...(r.homebrew_service
              ? [`warning: Homebrew service found at ${r.homebrew_service}`]
              : []),
          ].join("\n"),
      ),
    );
}
