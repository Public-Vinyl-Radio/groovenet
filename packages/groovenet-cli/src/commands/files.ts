import { Command } from "commander";
import type { GroovenetClient, AudioMetadataBackfillRun } from "@groovenet/client";
import chalk from "chalk";
import { printError } from "../output.js";
import { intOption } from "../options.js";
import { consoleIO, makeClient, type FingerprintLibraryIO } from "./fingerprintLibrary.js";

export type FilesBackfillClient = Pick<
  GroovenetClient,
  "startAudioMetadataBackfill" | "getAudioMetadataBackfillRun"
>;

export interface FilesBackfillOptions {
  force?: boolean;
  friendId?: number;
  wait?: boolean;
  pollInterval?: number;
  json?: boolean;
}

/** Tracks that have reached a terminal outcome. */
export function settled(run: AudioMetadataBackfillRun): number {
  return run.probed + run.skipped + run.missing_files + run.probe_failures;
}

/** `probing  120/3653  ██░░░░` — one line, rewritten in place. */
export function formatProgress(run: AudioMetadataBackfillRun, width = 24): string {
  const ratio = run.total > 0 ? Math.min(settled(run) / run.total, 1) : 1;
  const filled = Math.round(ratio * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `  probing  ${settled(run)}/${run.total}  ${bar}`;
}

/** The report: outcomes, then the source of every file probed. */
export function formatReport(run: AudioMetadataBackfillRun): string[] {
  const { sources } = run;
  return [
    `  ${[
      chalk.green(`✓ ${run.probed} probed`),
      chalk.gray(`⤼ ${run.skipped} up to date`),
      run.missing_files > 0
        ? chalk.yellow(`– ${run.missing_files} missing files`)
        : chalk.gray("– 0 missing files"),
      run.probe_failures > 0
        ? chalk.red(`✗ ${run.probe_failures} probe failures`)
        : chalk.gray("✗ 0 probe failures"),
    ].join("   ")}`,
    chalk.bold("  Sources"),
    `    apple_music ${sources.apple_music}   youtube ${sources.youtube}   soundcloud ${sources.soundcloud}   upload ${sources.upload}`,
    `    unknown ${sources.unknown}` +
      chalk.gray(` (${run.weak_youtube_hints} Opus/WebM with no URL: weak YouTube hint)`),
  ];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One `files backfill` run. Returns the exit code: non-zero when any probe failed. */
export async function runFilesBackfill(
  client: FilesBackfillClient,
  opts: FilesBackfillOptions,
  io: FingerprintLibraryIO = consoleIO,
): Promise<number> {
  const started = await client.startAudioMetadataBackfill({
    ...(opts.force ? { force: true } : {}),
    ...(opts.friendId !== undefined ? { friend_id: opts.friendId } : {}),
  });

  if (!opts.json) {
    io.log(chalk.bold("Probing audio files") + chalk.gray(` — ${started.total} with a local file`));
  }
  if (opts.wait === false) {
    if (opts.json) io.write(JSON.stringify(started, null, 2) + "\n");
    else io.log(chalk.gray(`  run ${started.run_id}`));
    return 0;
  }

  const seen = new Set<string>();
  let run = started;
  while (!run.complete) {
    await sleep(opts.pollInterval ?? 1000);
    run = await client.getAudioMetadataBackfillRun(started.run_id);
    if (opts.json) continue;
    for (const failure of run.errors) {
      if (seen.has(failure)) continue;
      seen.add(failure);
      io.log(chalk.red(`  ✗ ${failure}`));
    }
    io.write(`\r${formatProgress(run)}`);
  }

  if (opts.json) {
    io.write(JSON.stringify(run, null, 2) + "\n");
  } else {
    io.write("\r\x1b[2K");
    for (const line of formatReport(run)) io.log(line);
  }
  return run.probe_failures > 0 ? 1 : 0;
}

export function addFilesCommands(program: Command): void {
  const files = program.command("files").description("Local audio files and where they came from");

  files
    .command("backfill")
    .description("Probe existing audio files and record their format and source")
    .option("--force", "Probe again even when the file is unchanged since the last probe")
    .option("--friend-id <n>", "Narrow to one friend's library", intOption)
    .option("--no-wait", "Start the run and exit without waiting")
    .option("--poll-interval <ms>", "How often to poll progress", intOption, 1000)
    .option("--json", "Output as JSON")
    .action(async (opts: FilesBackfillOptions) => {
      try {
        process.exitCode = await runFilesBackfill(makeClient(), opts);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
