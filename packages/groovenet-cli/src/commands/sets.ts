import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import type {
  DerivedPlay,
  SetDerivation,
  SetDerivationView,
  SetTrackRef,
} from "@groovenet/client";
import chalk from "chalk";
import { printError } from "../output.js";
import { intOption } from "../options.js";

/**
 * `groovenet sets` — a corrected tracklist from a recording of a set (#282).
 *
 * The CLI does the one thing the server cannot: it has the file. It hashes the
 * recording locally, uploads it only if the server does not already hold it,
 * and starts a derivation. `fingerprint-set-worker` matches every window; the
 * app groups them into plays and diffs them against the planned playlist.
 */

export function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({
    baseUrl: cfg.api_base,
    apiKey: cfg.api_key,
    insecureTls: cfg.insecure_tls,
  });
}

export type SetsClient = Pick<
  GroovenetClient,
  "hasSetRecording" | "uploadSetRecording" | "createSetDerivation" | "getSetDerivation"
>;

/** Where output goes; injected so a whole run can be asserted without a terminal. */
export interface SetsIO {
  log: (line: string) => void;
  /** Raw, no newline — progress lines rewrite themselves with \r. */
  write: (text: string) => void;
}

export const consoleIO: SetsIO = {
  log: (line) => console.log(line),
  write: (text) => process.stdout.write(text),
};

export interface PlanOptions {
  playlist?: number;
  liveSet?: number;
}

export interface DeriveOptions extends PlanOptions {
  window?: number;
  step?: number;
  force?: boolean;
  wait?: boolean;
  pollInterval?: number;
  json?: boolean;
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** Seconds as `h:mm:ss` — how a position in a three-hour set is read. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** A length of time as `2m30s`. */
export function formatSpan(seconds: number): string {
  const whole = Math.round(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function formatBar(done: number, total: number, width = 24): string {
  const ratio = total > 0 ? Math.min(done / total, 1) : 1;
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function describeTrack(track: SetTrackRef | null, fallbackId: string): string {
  if (!track) return `${fallbackId} ${chalk.gray("(no longer in the library)")}`;
  const name = [track.artist, track.title].filter(Boolean).join(" — ");
  return `${name || track.track_id} ${chalk.gray(`[${track.track_id}]`)}`;
}

type Mark = { symbol: string; note: string };

/**
 * How each play relates to the plan, keyed by its index in the tracklist.
 * Plays the diff does not mention have no mark — there was no plan.
 */
export function marksFor(view: SetDerivationView): Map<number, Mark> {
  const marks = new Map<number, Mark>();
  const diff = view.diff;
  if (!diff) return marks;
  for (const item of diff.played_as_planned) {
    marks.set(
      item.play,
      item.out_of_order
        ? { symbol: chalk.yellow("↕"), note: chalk.yellow("out of order") }
        : { symbol: chalk.green("✓"), note: "" }
    );
  }
  for (const item of diff.played_instead_of) {
    const planned = [item.planned.position, item.planned.title].filter(Boolean).join(" ");
    marks.set(item.play, {
      symbol: chalk.magenta("⇄"),
      note: chalk.magenta(`instead of ${planned || item.planned.track_id}`),
    });
  }
  for (const item of diff.played_not_planned) {
    marks.set(item.play, { symbol: chalk.cyan("+"), note: chalk.cyan("not planned") });
  }
  return marks;
}

/**
 * The derived tracklist as lines: plays and unidentified stretches in time
 * order, each play marked against the plan, then the diff's summary and the
 * two lists a DJ actually acts on.
 */
export function renderView(view: SetDerivationView): string[] {
  const { derivation, recording, summary } = view;
  const name = recording.original_filename ?? recording.file_path;
  const lines: string[] = [];

  if (derivation.status === "failed") {
    return [chalk.red(`✗ Derivation of ${name} failed: ${derivation.error ?? "no reason given"}`)];
  }
  if (!summary) {
    return [chalk.gray(`${name}: ${derivation.status}…`)];
  }

  const duration = summary.duration_seconds;
  const identified =
    summary.identified_fraction != null ? `${(summary.identified_fraction * 100).toFixed(1)}%` : "?";
  lines.push(
    chalk.bold(`${name}`) +
      chalk.gray(
        ` — ${summary.plays} plays, ${identified} of ${duration != null ? formatClock(duration) : "?"} identified` +
          ` (${derivation.fingerprint_type} ${derivation.fingerprint_version})`
      )
  );
  lines.push("");

  const marks = marksFor(view);
  type Row = { at: number; line: string };
  const rows: Row[] = view.tracklist.map((play: DerivedPlay, i) => {
    const mark = marks.get(i);
    const times = `${formatClock(play.start_seconds)}  ${formatClock(play.end_seconds)}`;
    return {
      at: play.start_seconds,
      line: `  ${mark ? mark.symbol : " "} ${times}  ${describeTrack(play.track, play.track_id)}${mark?.note ? `  ${mark.note}` : ""}`,
    };
  });
  for (const region of view.unidentified) {
    const span = formatSpan(region.end_seconds - region.start_seconds);
    const times = `${formatClock(region.start_seconds)}  ${formatClock(region.end_seconds)}`;
    const hint = region.unindexed_neighbours.length
      ? chalk.gray(
          ` — not indexed on the records either side: ${region.unindexed_neighbours
            .map((t) => `${t.track_id}${t.title ? ` ${t.title}` : ""}`)
            .join(", ")}`
        )
      : "";
    rows.push({ at: region.start_seconds, line: chalk.gray(`  ? ${times}  unidentified (${span})`) + hint });
  }
  rows.sort((a, b) => a.at - b.at);
  lines.push(...rows.map((r) => r.line));

  const diff = view.diff;
  if (diff) {
    const outOfOrder = diff.played_as_planned.filter((m) => m.out_of_order).length;
    lines.push("");
    lines.push(chalk.bold(`Against playlist ${diff.playlist_id}`));
    lines.push(
      `  ${diff.played_as_planned.length} as planned` +
        (outOfOrder ? ` (${outOfOrder} out of order)` : "") +
        ` · ${diff.played_instead_of.length} played instead` +
        ` · ${diff.played_not_planned.length} not planned` +
        ` · ${diff.planned_not_played.length} planned but not played`
    );
    if (diff.played_instead_of.length) {
      lines.push("", chalk.bold("  Played instead of the plan"));
      for (const { play, planned } of diff.played_instead_of) {
        const played = view.tracklist[play];
        lines.push(
          `    ${formatClock(played.start_seconds)}  ${describeTrack(played.track, played.track_id)}` +
            chalk.gray(`  instead of  `) +
            describeTrack(planned, planned.track_id)
        );
      }
    }
    if (diff.planned_not_played.length) {
      lines.push("", chalk.bold("  Planned but not played"));
      for (const entry of diff.planned_not_played) {
        lines.push(
          `    ${describeTrack(entry, entry.track_id)}` +
            (entry.fingerprinted ? "" : chalk.yellow("  (not fingerprinted — may have been played)"))
        );
      }
    }
  }
  return lines;
}

// ── Work ─────────────────────────────────────────────────────────────────────

/** sha256 of a file, streamed; `onProgress` gets bytes read so far. */
export async function hashFile(file: string, onProgress?: (read: number) => void): Promise<string> {
  const hash = createHash("sha256");
  let read = 0;
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk as Buffer);
    read += (chunk as Buffer).length;
    onProgress?.(read);
  }
  return hash.digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TERMINAL = new Set(["processed", "failed"]);

/** Poll until the run is processed or failed. */
export async function waitForDerivation(
  client: Pick<SetsClient, "getSetDerivation">,
  id: string,
  opts: { pollIntervalMs: number; onProgress?: (derivation: SetDerivation) => void }
): Promise<void> {
  for (;;) {
    const { derivation } = await client.getSetDerivation(id);
    opts.onProgress?.(derivation);
    if (TERMINAL.has(derivation.status)) return;
    await sleep(opts.pollIntervalMs);
  }
}

function planQuery(opts: PlanOptions) {
  if (opts.playlist !== undefined && opts.liveSet !== undefined) {
    throw new Error("Choose --playlist or --live-set, not both");
  }
  return { playlist_id: opts.playlist, live_set_id: opts.liveSet };
}

/**
 * One `sets derive`, start to finish. Returns the exit code: 1 when the run
 * failed, so it composes in a script.
 */
export async function runDerive(
  client: SetsClient,
  file: string,
  opts: DeriveOptions,
  io: SetsIO = consoleIO
): Promise<number> {
  const query = planQuery(opts);
  const size = fs.statSync(file).size;
  const filename = path.basename(file);
  const quiet = Boolean(opts.json);
  const say = (line: string) => !quiet && io.log(line);
  const rewrite = (text: string) => !quiet && io.write(`\r\x1b[2K${text}`);

  say(chalk.bold(filename) + chalk.gray(` — ${formatBytes(size)}`));

  const sha256 = await hashFile(file, (read) =>
    rewrite(`  hashing    ${formatBar(read, size)}  ${formatBytes(read)}`)
  );
  rewrite("");

  if (await client.hasSetRecording(sha256)) {
    say(chalk.gray("  already on the server — not uploading"));
  } else {
    const started = Date.now();
    await client.uploadSetRecording(sha256, fs.createReadStream(file), {
      size,
      filename,
      onProgress: (sent) => {
        const seconds = Math.max((Date.now() - started) / 1000, 0.001);
        rewrite(
          `  uploading  ${formatBar(sent, size)}  ${formatBytes(sent)}/${formatBytes(size)}` +
            `  ${formatBytes(sent / seconds)}/s`
        );
      },
    });
    rewrite("");
    say(chalk.gray(`  uploaded ${formatBytes(size)}`));
  }

  const derivation = await client.createSetDerivation({
    recording_sha256: sha256,
    window_seconds: opts.window,
    step_seconds: opts.step,
    force: opts.force || undefined,
    live_set_id: opts.liveSet,
  });
  say(
    chalk.gray(
      derivation.reused
        ? `  derivation ${derivation.id} (reusing an earlier run — --force for a fresh one)`
        : `  derivation ${derivation.id} queued`
    )
  );

  if (opts.wait === false) {
    if (quiet) io.write(JSON.stringify(derivation, null, 2) + "\n");
    return 0;
  }

  await waitForDerivation(client, derivation.id, {
    pollIntervalMs: opts.pollInterval ?? 2000,
    onProgress: (d) => rewrite(`  matching   ${d.status}…`),
  });
  rewrite("");
  say("");

  const view = await client.getSetDerivation(derivation.id, query);
  if (quiet) io.write(JSON.stringify(view, null, 2) + "\n");
  else renderView(view).forEach((line) => io.log(line));
  return view.derivation.status === "failed" ? 1 : 0;
}

/** `sets show` — read an existing run back, optionally against a plan. */
export async function runShow(
  client: Pick<SetsClient, "getSetDerivation">,
  id: string,
  opts: PlanOptions & { json?: boolean },
  io: SetsIO = consoleIO
): Promise<number> {
  const view = await client.getSetDerivation(id, planQuery(opts));
  if (opts.json) io.write(JSON.stringify(view, null, 2) + "\n");
  else renderView(view).forEach((line) => io.log(line));
  return view.derivation.status === "failed" ? 1 : 0;
}

export function addSetsCommands(program: Command): void {
  const sets = program
    .command("sets")
    .description("Derive a corrected tracklist from a recording of a set");

  sets
    .command("derive <file>")
    .description("Upload a set recording, match it against the library, and diff it against the plan")
    .option("--playlist <id>", "Diff against this playlist", intOption)
    .option("--live-set <id>", "Diff against this live set, and list the recording in its media", intOption)
    .option("--window <seconds>", "Window length (default 15)", intOption)
    .option("--step <seconds>", "Step between windows (default 15)", intOption)
    .option("--force", "Start a fresh run even if an equivalent one exists")
    .option("--no-wait", "Start the run and exit without waiting")
    .option("--poll-interval <ms>", "How often to poll while matching", intOption, 2000)
    .option("--json", "Output as JSON")
    .action(async (file: string, opts: DeriveOptions) => {
      try {
        process.exitCode = await runDerive(makeClient(), file, opts);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  sets
    .command("show <id>")
    .description("Show a derived tracklist, optionally against a plan")
    .option("--playlist <id>", "Diff against this playlist", intOption)
    .option("--live-set <id>", "Diff against this live set", intOption)
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: PlanOptions & { json?: boolean }) => {
      try {
        process.exitCode = await runShow(makeClient(), id, opts);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
