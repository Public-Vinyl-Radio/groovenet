import { Command } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import type {
  DetectionWindow,
  IngestPipelineStats,
  IngestRecord,
  SpinAggregateResult,
} from "@groovenet/client";
import chalk from "chalk";
import Table from "cli-table3";
import { printJson, printError } from "../output.js";
import { intOption } from "../options.js";

export function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({
    baseUrl: cfg.api_base,
    apiKey: cfg.api_key,
    insecureTls: cfg.insecure_tls,
  });
}

function clock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString();
}

/** `47.2s` → `0:47`, which is how anyone thinks about a position in a track. */
export function formatOffset(seconds: number | null): string {
  if (seconds === null) return "—";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * One window as a line.
 *
 * A no-match is rendered plainly rather than as an error: it is the expected
 * state between tracks, and colouring it red would train you to ignore red.
 */
export function formatDetection(d: DetectionWindow): string[] {
  if (!d.matched) {
    return [clock(d.window_start_at), chalk.gray("no match"), "—", "—"];
  }
  const confidence = d.confidence ?? 0;
  const paint = confidence >= 0.85 ? chalk.green : chalk.yellow;
  return [
    clock(d.window_start_at),
    `${d.artist ?? "?"} — ${d.title ?? "?"}`,
    paint(confidence.toFixed(3)),
    formatOffset(d.offset_seconds),
  ];
}

/**
 * The health summary.
 *
 * Leads with the index because an empty one is the failure that looks like
 * success: chunks arrive, decode, and are reported `processed`, every one of
 * them matching nothing.
 */
export function formatStats(s: IngestPipelineStats): string {
  const lines: string[] = [];

  // First, because when this is false nothing else can even begin: uploads
  // fail with EACCES, the route answers 500, and a well-behaved device
  // retries forever while every other number looks perfectly healthy.
  if (s.ingest_writable === false) {
    lines.push(
      chalk.red("✗ ingest volume is NOT writable") +
        chalk.gray(" — every upload will fail; check ownership of AUDIO_INGEST_DIR")
    );
  }

  if (!s.index.engine_registered) {
    lines.push(
      chalk.red("✗ no fingerprint engine registered") +
        chalk.gray(" — is fingerprint-service running?")
    );
  } else if (s.index.empty) {
    lines.push(
      chalk.red("✗ reference index is EMPTY") +
        chalk.gray(" — nothing can match; run `groovenet fingerprint-library`")
    );
  } else {
    lines.push(
      chalk.green(`✓ index: ${s.index.indexed_tracks} tracks`) +
        chalk.gray(` (${s.index.fingerprint_type} ${s.index.fingerprint_version})`)
    );
  }

  // A gap here is silent otherwise: everything else can look healthy while
  // recently-downloaded audio sits unfingerprinted, invisible to play
  // tracking until someone happens to notice (#303).
  if (s.index.missing_fingerprint_tracks > 0) {
    lines.push(
      chalk.yellow(
        `⚠ ${s.index.missing_fingerprint_tracks} track(s) have audio but no fingerprint`
      )
    );
  }

  const q = s.queue_depth;
  lines.push(
    q === null
      ? chalk.yellow("? queue depth unavailable (redis unreachable)")
      : chalk.gray(`  queue depth: ${q}`)
  );

  const st = s.ingests.by_status;
  const counts = Object.entries(st)
    .map(([k, v]) => `${k} ${v}`)
    .join("  ");
  lines.push(chalk.gray(`  ingests (${s.window_minutes}m): ${counts || "none"}`));

  for (const f of s.ingests.failures) {
    lines.push(chalk.red(`    ✗ ${f.count}× ${f.error}`));
  }

  const d = s.detections;
  if (d.windows === 0) {
    lines.push(chalk.gray("  detections: none in this window"));
  } else {
    const rate = d.match_rate === null ? "—" : `${(d.match_rate * 100).toFixed(1)}%`;
    lines.push(
      chalk.gray(
        `  detections: ${d.windows} windows, ${d.matched} matched, ` +
          `${d.no_match} no-match (${rate})`
      )
    );
    for (const b of d.confidence_bands) {
      lines.push(chalk.gray(`    ${b.band}  ${b.count}`));
    }
  }

  // Detections pile up here when nothing ever turns them into a spin — the
  // failure #304 fixed, where the aggregation logic existed but nothing
  // called it. Null (redis/query failure) is worth a different flag than a
  // real, nonzero backlog.
  if (s.spins.pending === null) {
    lines.push(chalk.yellow("? spin aggregation backlog unavailable"));
  } else if (s.spins.pending > 0) {
    lines.push(
      chalk.yellow(`⚠ ${s.spins.pending} detection(s) awaiting a spin session`)
    );
  }

  if (s.ingests.oldest_in_flight) {
    const o = s.ingests.oldest_in_flight;
    lines.push(
      chalk.yellow(
        `  oldest in flight: ${o.status} since ${clock(o.received_at)}`
      )
    );
  }

  return lines.join("\n");
}

/**
 * The backfill result (#304).
 *
 * Both automatic triggers only look back `PLAY_AGGREGATION_LOOKBACK_MINUTES`
 * (default 60), so this is what confirms a manual `--since` actually reached
 * older detections.
 */
export function formatAggregateResult(result: SpinAggregateResult): string {
  const lines: string[] = [];

  if (result.sources.length === 0) {
    lines.push(chalk.yellow(`no active source since ${result.since}`));
    return lines.join("\n");
  }

  lines.push(
    chalk.green(`✓ created ${result.created}`) +
      chalk.gray(`, skipped ${result.skipped} (already aggregated)`)
  );
  for (const s of result.sources) {
    lines.push(chalk.gray(`  ${s.source_id}: created ${s.created}, skipped ${s.skipped}`));
  }

  return lines.join("\n");
}

function printDetections(rows: DetectionWindow[]): void {
  if (rows.length === 0) {
    console.log(chalk.yellow("No detections yet."));
    return;
  }
  const table = new Table({
    head: [chalk.cyan("Time"), chalk.cyan("Track"), chalk.cyan("Conf"), chalk.cyan("At")],
    colWidths: [12, 52, 8, 8],
    wordWrap: true,
  });
  for (const row of rows) table.push(formatDetection(row));
  console.log(table.toString());
}

function printIngests(rows: IngestRecord[]): void {
  if (rows.length === 0) {
    console.log(chalk.yellow("No ingests yet — is the listener posting?"));
    return;
  }
  const table = new Table({
    head: [
      chalk.cyan("Received"),
      chalk.cyan("Source"),
      chalk.cyan("Seq"),
      chalk.cyan("Status"),
      chalk.cyan("Dur"),
      chalk.cyan("Error"),
    ],
    colWidths: [12, 20, 7, 12, 7, 34],
    wordWrap: true,
  });
  for (const r of rows) {
    const paint =
      r.status === "failed"
        ? chalk.red
        : r.status === "processed"
          ? chalk.green
          : chalk.yellow;
    table.push([
      clock(r.received_at),
      r.source_id,
      r.sequence ?? "—",
      paint(r.status),
      r.duration_seconds ? `${r.duration_seconds.toFixed(0)}s` : "—",
      r.error ?? "",
    ]);
  }
  console.log(table.toString());
}

export function addVinylCommands(program: Command): void {
  const vinyl = program
    .command("vinyl")
    .description("Inspect the automatic vinyl play tracking pipeline");

  vinyl
    .command("status")
    .description("Is the pipeline working? Index, queue, ingests, match rate")
    .option("--minutes <n>", "Window to summarise", intOption, 60)
    .option("--source <id>", "Limit to one listener source")
    .option("--json", "Output as JSON")
    .action(async (opts: { minutes: number; source?: string; json?: boolean }) => {
      try {
        const stats = await makeClient().getIngestStats({
          minutes: opts.minutes,
          source_id: opts.source,
        });
        if (opts.json) printJson(stats);
        else console.log(formatStats(stats));
        // A pipeline that cannot match is a failure worth an exit code, so
        // this composes in a health check.
        if (
          stats.ingest_writable === false ||
          !stats.index.engine_registered ||
          stats.index.empty
        ) {
          process.exitCode = 1;
        }
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  vinyl
    .command("detections")
    .description("Recent matcher windows, including the no-match ones")
    .option("--source <id>", "Limit to one listener source")
    .option("--session <id>", "Limit to one listening session")
    .option("--matched", "Only windows that matched something")
    .option("--no-match", "Only windows that matched nothing")
    .option("--limit <n>", "How many", intOption, 30)
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        source?: string;
        session?: string;
        matched?: boolean;
        match?: boolean;
        limit: number;
        json?: boolean;
      }) => {
        try {
          // commander turns --no-match into `match: false`.
          const matched =
            opts.match === false ? false : opts.matched ? true : undefined;
          const result = await makeClient().listDetections({
            source_id: opts.source,
            session_id: opts.session,
            matched,
            limit: opts.limit,
          });
          if (opts.json) printJson(result);
          else printDetections(result.detections);
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );

  vinyl
    .command("ingests")
    .description("Recent audio chunks and what became of them")
    .option("--source <id>", "Limit to one listener source")
    .option("--status <s>", "received | processing | processed | failed")
    .option("--limit <n>", "How many", intOption, 30)
    .option("--json", "Output as JSON")
    .action(
      async (opts: { source?: string; status?: string; limit: number; json?: boolean }) => {
        try {
          const result = await makeClient().listIngests({
            source_id: opts.source,
            status: opts.status,
            limit: opts.limit,
          });
          if (opts.json) printJson(result);
          else printIngests(result.ingests);
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );

  vinyl
    .command("aggregate")
    .description(
      "Backfill: aggregate detections into spins from a date the automatic passes never reach (#304)"
    )
    .requiredOption(
      "--since <date>",
      "Aggregate detections at or after this date/time (anything Date can parse)"
    )
    .option("--source <id>", "Limit to one listener source")
    .option("--json", "Output as JSON")
    .action(async (opts: { since: string; source?: string; json?: boolean }) => {
      try {
        const since = new Date(opts.since);
        if (Number.isNaN(since.getTime())) {
          printError(`--since is not a date I can parse: ${opts.since}`);
          process.exit(1);
          return;
        }
        const result = await makeClient().aggregateSpins({
          since: since.toISOString(),
          source_id: opts.source,
        });
        if (opts.json) printJson(result);
        else console.log(formatAggregateResult(result));
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
