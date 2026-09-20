import { Command } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import type { FingerprintIndexRequest, FingerprintIndexRun } from "@groovenet/client";
import chalk from "chalk";
import { printError } from "../output.js";

export function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({
    baseUrl: cfg.api_base,
    apiKey: cfg.api_key,
    insecureTls: cfg.insecure_tls,
  });
}

/** Just enough of the client for one run, so a test can pass two functions. */
export type FingerprintLibraryClient = Pick<
  GroovenetClient,
  "startFingerprintIndex" | "getFingerprintIndexRun"
>;

/**
 * Where the command's output goes.
 *
 * Injected rather than reaching for `console` and `process.stdout` directly, so
 * the whole run — header, per-failure lines, the rewritten progress line and
 * the summary — can be asserted without a terminal.
 */
export interface FingerprintLibraryIO {
  /** A whole line, newline appended. */
  log: (line: string) => void;
  /** Raw, no newline — the progress line rewrites itself with \r. */
  write: (text: string) => void;
}

export const consoleIO: FingerprintLibraryIO = {
  log: (line) => console.log(line),
  write: (text) => process.stdout.write(text),
};

export interface FingerprintLibraryOptions {
  missing?: boolean;
  changed?: boolean;
  all?: boolean;
  track?: string;
  release?: string;
  friendId?: number;
  force?: boolean;
  wait?: boolean;
  pollInterval?: number;
  json?: boolean;
}

/**
 * Turn the scope flags into one request.
 *
 * Exactly one scope, so `--missing --all` is refused rather than silently
 * resolved to whichever the parser happened to see last. With no scope flag at
 * all it is `--missing`: the cheap, common case, since the alternatives re-read
 * and re-hash every already-indexed file.
 */
export function resolveScope(
  opts: FingerprintLibraryOptions
): FingerprintIndexRequest {
  const chosen = [
    opts.missing ? "missing" : null,
    opts.changed ? "changed" : null,
    opts.all ? "all" : null,
    opts.track ? "track" : null,
    opts.release ? "release" : null,
  ].filter((scope): scope is string => scope !== null);

  if (chosen.length > 1) {
    throw new Error(
      `Choose one scope, not ${chosen.length}: ${chosen.map((s) => `--${s}`).join(" ")}`
    );
  }

  const scope = (chosen[0] ?? "missing") as FingerprintIndexRequest["scope"];
  const request: FingerprintIndexRequest = { scope };

  if (scope === "track") request.track_id = opts.track;
  if (scope === "release") request.release_id = opts.release;
  if (opts.friendId !== undefined) request.friend_id = opts.friendId;
  if (opts.force) request.force = true;

  return request;
}

/** How many of the queued tracks have reached a terminal state. */
export function settledCount(run: FingerprintIndexRun): number {
  return run.indexed + run.skipped + run.failed;
}

/** `indexing 3412/3653 ██████████░░` — one line, rewritten in place. */
export function formatProgress(run: FingerprintIndexRun, width = 24): string {
  const done = settledCount(run);
  const ratio = run.queued > 0 ? Math.min(done / run.queued, 1) : 1;
  const filled = Math.round(ratio * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `  indexing  ${done}/${run.queued}  ${bar}`;
}

/**
 * The four counters the run reports.
 *
 * `unindexable` is listed apart from `failed` on purpose: a track with no
 * `local_audio_url` has no reference audio to fingerprint, which is a fact
 * about how much of the library has been downloaded, not a failure of the run.
 */
export function formatSummary(run: FingerprintIndexRun): string {
  const parts = [
    chalk.green(`✓ ${run.indexed} indexed`),
    chalk.gray(`⤼ ${run.skipped} skipped`),
    run.failed > 0 ? chalk.red(`✗ ${run.failed} failed`) : chalk.gray("✗ 0 failed"),
    chalk.gray(`– ${run.unindexable} no audio`),
  ];
  return `  ${parts.join("   ")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until every queued track has settled.
 *
 * `onProgress` is called with each poll so the caller owns the rendering — the
 * loop itself stays testable without a terminal.
 */
export async function waitForRun(
  client: Pick<GroovenetClient, "getFingerprintIndexRun">,
  runId: string,
  opts: { pollIntervalMs: number; onProgress?: (run: FingerprintIndexRun) => void }
): Promise<FingerprintIndexRun> {
  for (;;) {
    const run = await client.getFingerprintIndexRun(runId);
    opts.onProgress?.(run);
    if (run.complete) return run;
    await sleep(opts.pollIntervalMs);
  }
}

/**
 * One `fingerprint-library` run, start to finish. Returns the process exit
 * code: non-zero when any track failed, so the command composes in a script.
 *
 * Separate from the commander wiring because everything interesting happens
 * here — scope resolution, the two output modes, the polling and the exit code
 * — and a commander action is not callable from a test.
 */
export async function runFingerprintLibrary(
  client: FingerprintLibraryClient,
  opts: FingerprintLibraryOptions,
  io: FingerprintLibraryIO = consoleIO
): Promise<number> {
  const request = resolveScope(opts);
  const started = await client.startFingerprintIndex(request);

  if (!opts.json) {
    io.log(
      chalk.bold(`Indexing ${started.scope}`) +
        chalk.gray(` — ${started.fingerprint_type} ${started.fingerprint_version}`)
    );
    io.log(
      chalk.gray(
        `  ${started.queued} queued, ${started.unindexable} without reference audio`
      )
    );
  }

  if (!opts.wait) {
    if (opts.json) io.write(JSON.stringify(started, null, 2) + "\n");
    else io.log(chalk.gray(`  run ${started.run_id}`));
    return 0;
  }

  const seen = new Set<string>();
  const finished = await waitForRun(client, started.run_id, {
    pollIntervalMs: opts.pollInterval ?? 1000,
    onProgress: (run) => {
      if (opts.json) return;
      // Failures scroll above the progress line as they happen, so a long run
      // does not hide them until the very end.
      for (const failure of run.errors) {
        if (seen.has(failure)) continue;
        seen.add(failure);
        io.log(chalk.red(`  ✗ ${failure}`));
      }
      io.write(`\r${formatProgress(run)}`);
    },
  });

  if (opts.json) {
    io.write(JSON.stringify(finished, null, 2) + "\n");
    return finished.failed > 0 ? 1 : 0;
  }

  io.write("\r\x1b[2K");
  io.log(formatSummary(finished));
  return finished.failed > 0 ? 1 : 0;
}

export function addFingerprintLibraryCommand(program: Command): void {
  program
    .command("fingerprint-library")
    .description(
      "Build the reference fingerprint index the live vinyl matcher searches"
    )
    .option("--missing", "Only tracks with no fingerprint yet (default)")
    .option("--changed", "Only tracks already indexed, re-checked for edits")
    .option("--all", "Every track with reference audio")
    .option("--track <id>", "One track")
    .option("--release <id>", "Every track on one release")
    .option("--friend-id <n>", "Narrow to one friend's library", parseInt)
    .option("--force", "Re-fingerprint even when the audio is unchanged")
    .option("--no-wait", "Queue the run and exit without waiting")
    .option("--poll-interval <ms>", "How often to poll progress", parseInt, 1000)
    .option("--json", "Output as JSON")
    .action(async (opts: FingerprintLibraryOptions) => {
      try {
        process.exitCode = await runFingerprintLibrary(makeClient(), opts);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
