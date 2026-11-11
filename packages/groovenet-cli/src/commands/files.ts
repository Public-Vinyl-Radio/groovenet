import { Command } from "commander";
import type {
  GroovenetClient,
  AudioMetadataBackfillRun,
  EmbeddedTagsBackfillRun,
  IsrcBackfillRun,
} from "@groovenet/client";
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

export type FilesTagsClient = Pick<
  GroovenetClient,
  "startEmbeddedTagsBackfill" | "getEmbeddedTagsBackfillRun"
>;

/** Tracks that have reached a terminal outcome. */
export function tagsSettled(run: EmbeddedTagsBackfillRun): number {
  return run.read + run.skipped + run.missing_files + run.read_failures;
}

/** `reading  120/3653  ██░░░░` — one line, rewritten in place. */
export function formatTagsProgress(run: EmbeddedTagsBackfillRun, width = 24): string {
  const ratio = run.total > 0 ? Math.min(tagsSettled(run) / run.total, 1) : 1;
  const filled = Math.round(ratio * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `  reading  ${tagsSettled(run)}/${run.total}  ${bar}`;
}

/** Outcomes, then how many of the files read carried each tag (empty is normal). */
export function formatTagsReport(run: EmbeddedTagsBackfillRun): string[] {
  return [
    `  ${[
      chalk.green(`✓ ${run.read} read`),
      chalk.gray(`⤼ ${run.skipped} up to date`),
      run.missing_files > 0
        ? chalk.yellow(`– ${run.missing_files} missing files`)
        : chalk.gray("– 0 missing files"),
      run.read_failures > 0
        ? chalk.red(`✗ ${run.read_failures} failures`)
        : chalk.gray("✗ 0 failures"),
    ].join("   ")}`,
    chalk.bold("  Found in the files read"),
    `    composer ${run.with_composer}   genre ${run.with_genre}   lyrics ${run.with_lyrics}`,
    ...(run.queued_embeddings > 0
      ? [
          chalk.gray(
            `  ${run.queued_embeddings} track(s) queued for new embeddings (composer filled)`,
          ),
        ]
      : []),
  ];
}

/** One `files tags` run. Returns the exit code: non-zero when any file failed. */
export async function runFilesTags(
  client: FilesTagsClient,
  opts: FilesBackfillOptions,
  io: FingerprintLibraryIO = consoleIO,
): Promise<number> {
  const started = await client.startEmbeddedTagsBackfill({
    ...(opts.force ? { force: true } : {}),
    ...(opts.friendId !== undefined ? { friend_id: opts.friendId } : {}),
  });

  if (!opts.json) {
    io.log(
      chalk.bold("Reading embedded tags") + chalk.gray(` — ${started.total} with a local file`),
    );
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
    run = await client.getEmbeddedTagsBackfillRun(started.run_id);
    if (opts.json) continue;
    for (const failure of run.errors) {
      if (seen.has(failure)) continue;
      seen.add(failure);
      io.log(chalk.red(`  ✗ ${failure}`));
    }
    io.write(`\r${formatTagsProgress(run)}`);
  }

  if (opts.json) {
    io.write(JSON.stringify(run, null, 2) + "\n");
  } else {
    io.write("\r\x1b[2K");
    for (const line of formatTagsReport(run)) io.log(line);
  }
  return run.read_failures > 0 ? 1 : 0;
}

export type FilesIsrcClient = Pick<GroovenetClient, "startIsrcBackfill" | "getIsrcBackfillRun">;

export interface FilesIsrcOptions extends FilesBackfillOptions {
  limit?: number;
  dryRun?: boolean;
}

/** Tracks that have reached a terminal outcome. */
export function isrcSettled(run: IsrcBackfillRun): number {
  return run.filled + run.skipped + run.no_link + run.not_found + run.failed;
}

/** `resolving  120/3653  ██░░░░` — one line, rewritten in place. */
export function formatIsrcProgress(run: IsrcBackfillRun, width = 24): string {
  const ratio = run.total > 0 ? Math.min(isrcSettled(run) / run.total, 1) : 1;
  const filled = Math.round(ratio * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `  resolving  ${isrcSettled(run)}/${run.total}  ${bar}`;
}

/** How many tracks were filled, have no Apple Music link, returned no ISRC, or failed. */
export function formatIsrcReport(run: IsrcBackfillRun): string[] {
  return [
    `  ${[
      chalk.green(`✓ ${run.filled} ${run.dry_run ? "would be filled" : "filled"}`),
      chalk.gray(`⤼ ${run.skipped} up to date`),
      chalk.gray(`– ${run.no_link} no Apple Music link`),
      run.not_found > 0
        ? chalk.yellow(`? ${run.not_found} no ISRC returned`)
        : chalk.gray("? 0 no ISRC returned"),
      run.failed > 0 ? chalk.red(`✗ ${run.failed} failed`) : chalk.gray("✗ 0 failed"),
    ].join("   ")}`,
    ...(run.dry_run ? [chalk.gray("  Dry run: nothing was stored")] : []),
  ];
}

/** One `files isrc` run. Returns the exit code: non-zero when any lookup failed. */
export async function runFilesIsrc(
  client: FilesIsrcClient,
  opts: FilesIsrcOptions,
  io: FingerprintLibraryIO = consoleIO,
): Promise<number> {
  const started = await client.startIsrcBackfill({
    ...(opts.force ? { force: true } : {}),
    ...(opts.friendId !== undefined ? { friend_id: opts.friendId } : {}),
    ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts.dryRun ? { dry_run: true } : {}),
  });

  if (!opts.json) {
    io.log(chalk.bold("Resolving ISRCs") + chalk.gray(` — ${started.total} tracks in scope`));
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
    run = await client.getIsrcBackfillRun(started.run_id);
    if (opts.json) continue;
    for (const failure of run.errors) {
      if (seen.has(failure)) continue;
      seen.add(failure);
      io.log(chalk.red(`  ✗ ${failure}`));
    }
    io.write(`\r${formatIsrcProgress(run)}`);
  }

  if (opts.json) {
    io.write(JSON.stringify(run, null, 2) + "\n");
  } else {
    io.write("\r\x1b[2K");
    for (const line of formatIsrcReport(run)) io.log(line);
  }
  return run.failed > 0 ? 1 : 0;
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

  files
    .command("tags")
    .description("Read composer, genre and lyrics from audio files already on disk")
    .option("--force", "Read again even when the file is unchanged since the last read")
    .option("--friend-id <n>", "Narrow to one friend's library", intOption)
    .option("--no-wait", "Start the run and exit without waiting")
    .option("--poll-interval <ms>", "How often to poll progress", intOption, 1000)
    .option("--json", "Output as JSON")
    .action(async (opts: FilesBackfillOptions) => {
      try {
        process.exitCode = await runFilesTags(makeClient(), opts);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  files
    .command("isrc")
    .description("Resolve and store the ISRC of every track with an Apple Music link")
    .option("--force", "Ask Apple again even for tracks that already have an ISRC")
    .option("--limit <n>", "Resolve at most this many tracks", intOption)
    .option("--dry-run", "Resolve and report, but store nothing")
    .option("--friend-id <n>", "Narrow to one friend's library", intOption)
    .option("--no-wait", "Start the run and exit without waiting")
    .option("--poll-interval <ms>", "How often to poll progress", intOption, 1000)
    .option("--json", "Output as JSON")
    .action(async (opts: FilesIsrcOptions) => {
      try {
        process.exitCode = await runFilesIsrc(makeClient(), opts);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
