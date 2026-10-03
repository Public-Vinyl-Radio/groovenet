import { Command } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import { printPlaylists, printTracks, printJson, printSuccess, printError } from "../output.js";
import { boundedIntOption } from "../options.js";

function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({ baseUrl: cfg.api_base, apiKey: cfg.api_key, insecureTls: cfg.insecure_tls, clientName: "cli" });
}

export function addPlaylistsCommands(program: Command): void {
  const playlists = program.command("playlists").description("Manage playlists");
  const sets = playlists.command("set").description("Manage a playlist's optional set record");

  sets.command("show <id>").option("--json", "Output as JSON").action(async (id: string, opts: { json?: boolean }) => {
    try { const set = await makeClient().getLiveSet(id); opts.json ? printJson(set) : console.log(`${set.title || "Untitled set"} · ${set.status}`); }
    catch (err: unknown) { printError(err instanceof Error ? err.message : String(err)); process.exit(1); }
  });
  sets.command("create <id>").action(async (id: string) => {
    try { await makeClient().createLiveSet(id); printSuccess("Set created."); }
    catch (err: unknown) { printError(err instanceof Error ? err.message : String(err)); process.exit(1); }
  });
  sets.command("delete <id>").action(async (id: string) => {
    try { await makeClient().deleteLiveSet(id); printSuccess("Set removed; playlist kept."); }
    catch (err: unknown) { printError(err instanceof Error ? err.message : String(err)); process.exit(1); }
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
        const client = makeClient();
        const { track_refs } = await client.getPlaylistTracks(id);
        if (track_refs.length === 0) {
          console.log("Playlist is empty.");
          return;
        }
        const tracks = await client.batchGetTracks(track_refs);
        if (opts.json) {
          printJson(tracks);
        } else {
          console.log(`Playlist tracks (${tracks.length}):`);
          printTracks(tracks, false);
        }
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
    .action(async (id: string, opts: { at?: string; performance?: number; derivation?: string; json?: boolean }) => {
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
        else if (result.created === 0) printSuccess(`Already logged (${result.skipped} spins skipped).`);
        else printSuccess(`Logged ${result.created} spins${result.skipped ? `; ${result.skipped} already existed` : ""}.`);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  playlists
    .command("generate <id>")
    .description("Generate an optimized playlist from an existing playlist using the genetic algorithm")
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
