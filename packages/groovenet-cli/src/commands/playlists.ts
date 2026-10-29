import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import {
  GroovenetClient,
  formatDurationHms,
  loadConfig,
  type PlaylistCheck,
} from "@groovenet/client";
import type { LiveSet } from "@groovenet/contracts";
import { printPlaylists, printTracks, printJson, printSuccess, printError } from "../output.js";
import { boundedIntOption } from "../options.js";
import { parseTrackRefs, readTracksSource } from "./playlistTrackRefs.js";

function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({
    baseUrl: cfg.api_base,
    apiKey: cfg.api_key,
    insecureTls: cfg.insecure_tls,
    clientName: "cli",
  });
}

type PlaylistCheckResult = PlaylistCheck & { unresolved_track_ids: string[] };

/** Renders a playlist check as sections; each problem is listed under its heading. */
export function formatPlaylistCheck(check: PlaylistCheckResult): string[] {
  const lines: string[] = [];
  const heading = (text: string, count: number) =>
    lines.push("", count === 0 ? chalk.green(`✓ ${text}`) : chalk.yellow(`⚠ ${text} (${count})`));
  const note = (text: string, positions: number[]) => {
    if (positions.length > 0)
      lines.push(chalk.gray(`  ${text}: ${positions.map((p) => `#${p}`).join(", ")}`));
  };

  lines.push(
    chalk.bold(`${check.track_count} tracks · ${formatDurationHms(check.total_duration_seconds)}`),
  );
  note("no duration (not counted)", check.missing_duration);
  if (check.unresolved_track_ids.length > 0) {
    lines.push(chalk.red(`  Not found, skipped: ${check.unresolved_track_ids.join(", ")}`));
  }

  const jumpAt = new Map(check.bpm.jumps.map((j) => [j.to_position, j.delta]));
  heading(`BPM jumps above ${check.bpm.threshold}`, check.bpm.jumps.length);
  if (check.bpm.curve.length > 0) {
    const table = new Table({
      head: [chalk.cyan("#"), chalk.cyan("Track"), chalk.cyan("BPM"), chalk.cyan("Δ")],
    });
    for (const p of check.bpm.curve) {
      const delta = jumpAt.get(p.position);
      table.push([
        p.position,
        p.track_id,
        p.bpm ?? "-",
        delta === undefined ? "" : chalk.yellow(`${delta > 0 ? "+" : ""}${delta}`),
      ]);
    }
    lines.push(table.toString());
  }
  note("no BPM", check.bpm.missing);

  heading("Key clashes", check.keys.clashes.length);
  for (const c of check.keys.clashes) {
    lines.push(
      `  #${c.from_position} → #${c.to_position}  ${c.from_key} (${c.from_camelot}) → ${c.to_key} (${c.to_camelot})`,
    );
  }
  note("no usable key", check.keys.missing);

  heading("Repeated releases", check.repeated_releases.length);
  for (const r of check.repeated_releases) {
    lines.push(
      `  release ${r.release} at ${r.positions.map((p) => `#${p}`).join(", ")}  (${r.track_ids.join(", ")})`,
    );
  }

  heading("Side-order violations", check.side_order_violations.length);
  for (const v of check.side_order_violations) {
    lines.push(`  #${v.position} ${v.track_id}: ${v.reason}`);
  }
  return lines;
}

export async function showPlaylist(
  client: GroovenetClient,
  id: string,
  json: boolean,
): Promise<void> {
  const { track_refs } = await client.getPlaylistTracks(id);
  if (track_refs.length === 0) {
    console.log("Playlist is empty.");
    return;
  }
  const tracks = await client.batchGetTracks(track_refs);
  if (json) {
    printJson(tracks);
  } else {
    console.log(`Playlist tracks (${tracks.length}):`);
    printTracks(tracks, false);
  }
}

export function addPlaylistsCommands(program: Command): void {
  const playlists = program.command("playlists").description("Manage playlists");
  const sets = playlists.command("set").description("Manage a playlist's optional set record");

  sets
    .command("show <id>")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const set: LiveSet = await makeClient().getLiveSet(id);
        if (opts.json) printJson(set);
        else console.log(`${set.title || "Untitled set"} · ${set.status}`);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
  sets.command("create <id>").action(async (id: string) => {
    try {
      await makeClient().createLiveSet(id);
      printSuccess("Set created.");
    } catch (err: unknown) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
  sets.command("delete <id>").action(async (id: string) => {
    try {
      await makeClient().deleteLiveSet(id);
      printSuccess("Set removed; playlist kept.");
    } catch (err: unknown) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

  playlists
    .command("list")
    .description("List all playlists")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const client = makeClient();
        const result = await client.listPlaylists();
        printPlaylists(result, opts.json ?? false);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  playlists
    .command("show <id>")
    .description("Show tracks in a playlist")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        await showPlaylist(makeClient(), id, opts.json ?? false);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  playlists
    .command("set-tracks <id>")
    .description(
      "Replace a playlist's tracks from a file of refs (track_id or track_id,friend_id per line)",
    )
    .requiredOption("--tracks-file <path>", "File of track refs, one per line; - reads stdin")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { tracksFile: string; json?: boolean }) => {
      try {
        const playlistId = Number(id);
        if (!Number.isInteger(playlistId) || playlistId < 1)
          throw new Error(`Invalid playlist id: ${id}`);
        const refs = parseTrackRefs(
          readTracksSource(opts.tracksFile),
          loadConfig().default_friend_id,
        );
        const client = makeClient();
        await client.setPlaylistTracks(playlistId, refs);
        await showPlaylist(client, id, opts.json ?? false);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  playlists
    .command("check <id>")
    .description(
      "Check a playlist for BPM jumps, key clashes, repeated releases and vinyl side-order mistakes",
    )
    .option(
      "--bpm-threshold <n>",
      "Flag adjacent BPM changes above this many BPM",
      boundedIntOption(0),
      8,
    )
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { bpmThreshold: number; json?: boolean }) => {
      try {
        const check = await makeClient().checkPlaylist(id, { bpmJumpThreshold: opts.bpmThreshold });
        if (opts.json) printJson(check);
        else for (const line of formatPlaylistCheck(check)) console.log(line);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  playlists
    .command("create <name>")
    .description("Create a new playlist")
    .action(async (name: string) => {
      try {
        const client = makeClient();
        await client.createPlaylist(name);
        printSuccess(`✓ Playlist "${name}" created.`);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  playlists
    .command("log-spins <id>")
    .description("Log one spin for each played entry in a playlist")
    .option("--at <timestamp>", "Timestamp to use when there is no live-set performance")
    .option("--performance <id>", "Use a specific live-set performance", boundedIntOption(1))
    .option("--derivation <id>", "Use set-derived offsets and omit entries not played")
    .option("--json", "Output as JSON")
    .action(
      async (
        id: string,
        opts: { at?: string; performance?: number; derivation?: string; json?: boolean },
      ) => {
        try {
          if (opts.at && opts.performance != null) {
            throw new Error("Provide either --at or --performance, not both.");
          }
          const performedAt = opts.at ? new Date(opts.at) : null;
          if (performedAt && Number.isNaN(performedAt.getTime())) {
            throw new Error(`Invalid timestamp: ${opts.at}`);
          }
          const result = await makeClient().logPlaylistSpins(id, {
            ...(performedAt ? { performed_at: performedAt.toISOString() } : {}),
            ...(opts.performance != null ? { performance_id: opts.performance } : {}),
            ...(opts.derivation ? { derivation_id: opts.derivation } : {}),
          });
          if (opts.json) printJson(result);
          else if (result.created === 0)
            printSuccess(`Already logged (${result.skipped} spins skipped).`);
          else
            printSuccess(
              `Logged ${result.created} spins${result.skipped ? `; ${result.skipped} already existed` : ""}.`,
            );
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
        }
      },
    );

  playlists
    .command("generate <id>")
    .description(
      "Generate an optimized playlist from an existing playlist using the genetic algorithm",
    )
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const client = makeClient();
        const { track_refs } = await client.getPlaylistTracks(id);
        if (track_refs.length === 0) {
          printError("Playlist is empty — nothing to generate from.");
          process.exit(1);
        }
        const seedTracks = await client.batchGetTracks(track_refs);
        const optimized = await client.generatePlaylist(seedTracks);
        if (opts.json) {
          printJson(optimized);
        } else {
          console.log(`Optimized playlist (${optimized.length} tracks):`);
          printTracks(optimized, false);
        }
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
