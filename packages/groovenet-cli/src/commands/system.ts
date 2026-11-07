import { Command } from "commander";
import { GroovenetClient } from "@groovenet/client";
import type { OrphansResponse } from "@groovenet/client";
import chalk from "chalk";
import { printError } from "../output.js";
import { intOption } from "../options.js";
import { makeClient } from "./fingerprintLibrary.js";
import { formatBytes } from "./sets.js";

export interface SystemIO {
  log: (line: string) => void;
  write: (text: string) => void;
}

export const consoleIO: SystemIO = {
  log: (line) => console.log(line),
  write: (text) => process.stdout.write(text),
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface OrphansOptions {
  scan?: boolean;
  limit?: number;
  pollInterval?: number;
  json?: boolean;
}

/** The orphan report as lines: a summary, then a page of each list. */
export function formatOrphans(result: OrphansResponse): string[] {
  const { last_scan: scan } = result;
  if (!scan) return [chalk.yellow("No orphan scan yet. Run with --scan.")];
  const lines = [
    chalk.bold("Orphans") +
      chalk.gray(` — scanned ${scan.scanned_at}, took ${(scan.duration_ms / 1000).toFixed(1)}s`),
  ];
  if (result.last_error) lines.push(chalk.red(`  last scan failed: ${result.last_error}`));
  lines.push(
    `  Files with no track: ${scan.orphan_file_count} (${formatBytes(scan.orphan_file_bytes)})`,
  );
  for (const file of result.files.items)
    lines.push(`    ${file.path}  ${chalk.gray(formatBytes(file.size_bytes))}`);
  if (result.files.total > result.files.items.length)
    lines.push(chalk.gray(`    … ${result.files.total - result.files.items.length} more`));
  lines.push(`  Tracks pointing at missing files: ${scan.missing_track_count}`);
  for (const track of result.tracks.items)
    lines.push(`    ${track.artist} — ${track.title}  ${chalk.gray(track.local_audio_url)}`);
  if (result.tracks.total > result.tracks.items.length)
    lines.push(chalk.gray(`    … ${result.tracks.total - result.tracks.items.length} more`));
  return lines;
}

export async function runOrphans(
  client: Pick<GroovenetClient, "getStorageOrphans" | "startStorageOrphanScan">,
  opts: OrphansOptions,
  io: SystemIO = consoleIO,
): Promise<number> {
  const query = { limit: opts.limit };
  if (opts.scan) {
    await client.startStorageOrphanScan();
    // Poll until the scan the server is running (ours, or one already going) ends.
    let result = await client.getStorageOrphans(query);
    while (result.running) {
      await sleep(opts.pollInterval ?? 1000);
      result = await client.getStorageOrphans(query);
    }
    return print(result, opts, io);
  }
  return print(await client.getStorageOrphans(query), opts, io);
}

function print(result: OrphansResponse, opts: OrphansOptions, io: SystemIO): number {
  if (opts.json) {
    io.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }
  for (const line of formatOrphans(result)) io.log(line);
  return 0;
}

export function addSystemCommands(program: Command): void {
  const system = program.command("system").description("Server storage and system reports");

  system
    .command("orphans")
    .description("Audio files no track points at, and tracks pointing at missing files (read-only)")
    .option("--scan", "run a new scan first and wait for it")
    .option("--limit <n>", "entries to list per kind", intOption, 10)
    .option("--poll-interval <ms>", "how often to poll a running scan", intOption, 1000)
    .option("--json", "Output as JSON")
    .action(async (opts: OrphansOptions) => {
      try {
        process.exitCode = await runOrphans(makeClient(), opts);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
