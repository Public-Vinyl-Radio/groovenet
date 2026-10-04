import { Command } from "commander";
import { GroovenetClient } from "@groovenet/client";
import type {
  EmbeddingBackfillDryRun,
  EmbeddingBackfillRequest,
  EmbeddingBackfillRun,
  EmbeddingJobKind,
  EmbeddingStatus,
} from "@groovenet/client";
import chalk from "chalk";
import { printError } from "../output.js";
import { intOption } from "../options.js";
import { makeClient } from "./fingerprintLibrary.js";
import { exportEmbeddingEvalSnapshot } from "./embeddingEvalExport.js";

/** Same IO-injection shape as `fingerprintLibrary.ts`, so output is assertable without a terminal. */
export interface EmbeddingsIO {
  log: (line: string) => void;
  write: (text: string) => void;
}

export const consoleIO: EmbeddingsIO = {
  log: (line) => console.log(line),
  write: (text) => process.stdout.write(text),
};

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── backfill ───────────────────────────────────────────────────────────────

export interface EmbeddingsBackfillOptions {
  missing?: boolean;
  all?: boolean;
  release?: string;
  track?: string;
  type?: string;
  friendId?: number;
  force?: boolean;
  dryRun?: boolean;
  wait?: boolean;
  pollInterval?: number;
  json?: boolean;
}

/** Just enough of the client for one run, so a test can pass two functions. */
export type EmbeddingsBackfillClient = Pick<
  GroovenetClient,
  "startEmbeddingBackfill" | "getEmbeddingBackfillRun"
>;

/**
 * Turn the scope flags into one request, same shape as
 * `fingerprintLibrary.ts`'s `resolveScope`: exactly one scope, defaulting to
 * `missing` — the cheap, common case — rather than silently picking
 * whichever flag the parser saw last.
 */
export function resolveBackfillRequest(
  opts: EmbeddingsBackfillOptions
): EmbeddingBackfillRequest {
  const chosen = [
    opts.missing ? "missing" : null,
    opts.all ? "all" : null,
    opts.track ? "track" : null,
    opts.release ? "release" : null,
  ].filter((scope): scope is string => scope !== null);

  if (chosen.length > 1) {
    throw new Error(
      `Choose one scope, not ${chosen.length}: ${chosen.map((s) => `--${s}`).join(" ")}`
    );
  }

  const scope = (chosen[0] ?? "missing") as EmbeddingBackfillRequest["scope"];
  const request: EmbeddingBackfillRequest = { scope };

  if (scope === "track") request.track_ids = splitCsv(opts.track!);
  if (scope === "release") request.release_id = opts.release;
  if (opts.friendId !== undefined) request.friend_id = opts.friendId;
  if (opts.type) request.types = splitCsv(opts.type) as EmbeddingJobKind[];
  if (opts.force) request.force = true;
  if (opts.dryRun) request.dry_run = true;

  return request;
}

function isDryRun(
  result: EmbeddingBackfillRun | EmbeddingBackfillDryRun
): result is EmbeddingBackfillDryRun {
  return "dry_run" in result;
}

/** How many of the queued jobs have reached a terminal state. */
export function settledCount(run: EmbeddingBackfillRun): number {
  return run.success + run.skipped + run.failed;
}

/** `embedding 7/10 ██████████░░` — one line, rewritten in place. */
export function formatProgress(run: EmbeddingBackfillRun, width = 24): string {
  const done = settledCount(run);
  const ratio = run.queued > 0 ? Math.min(done / run.queued, 1) : 1;
  const filled = Math.round(ratio * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `  embedding  ${done}/${run.queued}  ${bar}`;
}

export function formatSummary(run: EmbeddingBackfillRun): string {
  const parts = [
    chalk.green(`✓ ${run.success} generated`),
    chalk.gray(`⤼ ${run.skipped} unchanged`),
    run.failed > 0 ? chalk.red(`✗ ${run.failed} failed`) : chalk.gray("✗ 0 failed"),
  ];
  return `  ${parts.join("   ")}`;
}

/** Poll until every queued job has settled. */
export async function waitForBackfillRun(
  client: Pick<EmbeddingsBackfillClient, "getEmbeddingBackfillRun">,
  runId: string,
  opts: { pollIntervalMs: number; onProgress?: (run: EmbeddingBackfillRun) => void }
): Promise<EmbeddingBackfillRun> {
  for (;;) {
    const run = await client.getEmbeddingBackfillRun(runId);
    opts.onProgress?.(run);
    if (run.complete) return run;
    await sleep(opts.pollIntervalMs);
  }
}

/**
 * One `embeddings backfill` run, start to finish. Returns the process exit
 * code: non-zero when any track failed, so the command composes in a script.
 *
 * Separate from the commander wiring so it's callable from a test without a
 * terminal, same split as `runFingerprintLibrary`.
 */
export async function runEmbeddingsBackfill(
  client: EmbeddingsBackfillClient,
  opts: EmbeddingsBackfillOptions,
  io: EmbeddingsIO = consoleIO
): Promise<number> {
  const request = resolveBackfillRequest(opts);
  const started = await client.startEmbeddingBackfill(request);

  if (isDryRun(started)) {
    if (opts.json) {
      io.write(JSON.stringify(started, null, 2) + "\n");
    } else {
      io.log(chalk.bold(`Dry run — ${started.total} track(s) would be queued`));
      for (const [type, count] of Object.entries(started.by_type)) {
        io.log(chalk.gray(`  ${type}: ${count}`));
      }
    }
    return 0;
  }

  if (!opts.json) {
    io.log(chalk.bold(`Backfilling embeddings (${request.scope})`));
    io.log(chalk.gray(`  ${started.queued} queued`));
  }

  if (!opts.wait) {
    if (opts.json) io.write(JSON.stringify(started, null, 2) + "\n");
    else io.log(chalk.gray(`  run ${started.run_id}`));
    return 0;
  }

  const seen = new Set<string>();
  const finished = await waitForBackfillRun(client, started.run_id, {
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

// ─── status ─────────────────────────────────────────────────────────────────

export interface EmbeddingsStatusOptions {
  friendId?: number;
  json?: boolean;
}

export function formatStatus(status: EmbeddingStatus): string[] {
  const lines = [chalk.bold(`Embeddings — ${status.total_tracks} track(s)`)];
  for (const [type, count] of Object.entries(status.missing)) {
    const label = count > 0 ? chalk.yellow(`${count} missing`) : chalk.green("complete");
    lines.push(`  ${type.padEnd(12)} ${label}`);
  }
  return lines;
}

export async function runEmbeddingsStatus(
  client: Pick<GroovenetClient, "getEmbeddingStatus">,
  opts: EmbeddingsStatusOptions,
  io: EmbeddingsIO = consoleIO
): Promise<number> {
  const status = await client.getEmbeddingStatus(opts.friendId);

  if (opts.json) {
    io.write(JSON.stringify(status, null, 2) + "\n");
    return 0;
  }

  for (const line of formatStatus(status)) io.log(line);
  return 0;
}

// ─── wiring ─────────────────────────────────────────────────────────────────

export function addEmbeddingsCommands(program: Command): void {
  const embeddings = program
    .command("embeddings")
    .description("Embedding backfill, status and offline evaluation export");

  embeddings
    .command("export-eval")
    .description("Export a read-only snapshot for offline embedding evaluation (#379)")
    .requiredOption("--friend-id <n>", "Friend whose collection to export", intOption)
    .requiredOption("--output <path>", "New JSON file (never overwrites)")
    .option("--json", "Output summary as JSON")
    .action(async (opts: { friendId: number; output: string; json?: boolean }) => {
      try {
        const counts = await exportEmbeddingEvalSnapshot(makeClient(), opts.friendId, opts.output);
        const summary = { output: opts.output, ...counts };
        if (opts.json) console.log(JSON.stringify(summary));
        else console.log(`Exported ${counts.tracks} tracks, ${counts.albums} albums and ${counts.playlists} playlists to ${opts.output}`);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  embeddings
    .command("backfill")
    .description("Queue missing embeddings for background generation")
    .option("--missing", "Only tracks with no embedding yet (default)")
    .option("--all", "Every track, regenerating even what's already embedded")
    .option("--release <id>", "Every track on one release")
    .option("--track <ids>", "One or more track ids, comma-separated")
    .option(
      "--type <kinds>",
      "identity, audio_vibe — comma-separated (default: both)"
    )
    .option("--friend-id <n>", "Narrow to one friend's library", intOption)
    .option("--force", "Regenerate even when the source data is unchanged")
    .option("--dry-run", "Report counts only; queue nothing")
    .option("--no-wait", "Queue the run and exit without waiting")
    .option("--poll-interval <ms>", "How often to poll progress", intOption, 1000)
    .option("--json", "Output as JSON")
    .action(async (opts: EmbeddingsBackfillOptions) => {
      try {
        process.exitCode = await runEmbeddingsBackfill(makeClient(), opts);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  embeddings
    .command("status")
    .description("Counts of tracks missing each embedding type")
    .option("--friend-id <n>", "Narrow to one friend's library", intOption)
    .option("--json", "Output as JSON")
    .action(async (opts: EmbeddingsStatusOptions) => {
      try {
        process.exitCode = await runEmbeddingsStatus(makeClient(), opts);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
