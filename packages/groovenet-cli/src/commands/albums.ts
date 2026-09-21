import { Command } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import type { Album } from "@groovenet/client";
import Table from "cli-table3";
import chalk from "chalk";
import { printJson, printSuccess, printError, printTracks } from "../output.js";
import { intOption } from "../options.js";

function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({ baseUrl: cfg.api_base, apiKey: cfg.api_key, insecureTls: cfg.insecure_tls });
}

function defaultFriendId(): number {
  return loadConfig().default_friend_id;
}

function printAlbums(albums: Album[], json: boolean): void {
  if (json) {
    printJson(albums);
    return;
  }
  if (albums.length === 0) {
    console.log(chalk.yellow("No albums found."));
    return;
  }
  const table = new Table({
    head: [
      chalk.cyan("Release ID"),
      chalk.cyan("Title"),
      chalk.cyan("Artist"),
      chalk.cyan("Year"),
      chalk.cyan("Tracks"),
      chalk.cyan("Rating"),
    ],
    colWidths: [12, 34, 24, 6, 7, 7],
    wordWrap: true,
  });
  for (const a of albums) {
    table.push([
      a.release_id,
      a.title,
      a.artist,
      a.year ?? "-",
      a.track_count,
      a.album_rating != null ? `★${a.album_rating}` : "-",
    ]);
  }
  console.log(table.toString());
}

export function addAlbumsCommands(program: Command): void {
  const albums = program.command("albums").description("Browse and manage albums");

  albums
    .command("list")
    .description("Search/list albums")
    .argument("[query]", "Search query", "")
    .option("--sort <s>", "Sort (created_at:desc, date_added:desc, year:desc, title:asc, album_rating:desc)", "created_at:desc")
    .option("--limit <n>", "Number of results", intOption, 20)
    .option("--offset <n>", "Offset", intOption, 0)
    .option("--friend-id <n>", "Friend ID", intOption)
    .option("--json", "Output as JSON")
    .action(
      async (
        query: string,
        opts: {
          sort: string;
          limit: number;
          offset: number;
          friendId?: number;
          json?: boolean;
        }
      ) => {
        try {
          const client = makeClient();
          const result = await client.searchAlbums({
            q: query,
            sort: opts.sort,
            limit: opts.limit,
            offset: opts.offset,
            friend_id: opts.friendId,
          });
          if (opts.json) {
            printJson(result);
          } else {
            console.log(
              `Found ${result.hits.length} album(s)` +
                (result.estimatedTotalHits > result.hits.length
                  ? ` (${result.estimatedTotalHits} total)`
                  : "")
            );
            printAlbums(result.hits, false);
          }
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );

  albums
    .command("show <release-id>")
    .description("Show album details and track list")
    .option("--friend-id <n>", "Friend ID", intOption)
    .option("--json", "Output as JSON")
    .action(
      async (
        releaseId: string,
        opts: { friendId?: number; json?: boolean }
      ) => {
        try {
          const client = makeClient();
          const friendId = opts.friendId ?? defaultFriendId();
          const detail = await client.getAlbum(releaseId, friendId);
          if (opts.json) {
            printJson(detail);
            return;
          }
          const a = detail.album;
          console.log(chalk.bold(a.title) + chalk.gray(` — ${a.artist}`));
          if (a.year) console.log(chalk.gray(`Year: ${a.year}`));
          if (a.genres?.length) console.log(chalk.gray(`Genres: ${a.genres.join(", ")}`));
          if (a.styles?.length) console.log(chalk.gray(`Styles: ${a.styles.join(", ")}`));
          if (a.album_rating != null) console.log(`Rating: ★${a.album_rating}/5`);
          if (a.album_notes) console.log(`Notes: ${a.album_notes}`);
          if (a.condition) console.log(`Condition: ${a.condition}`);
          if (a.purchase_price != null) console.log(`Purchase price: $${a.purchase_price}`);
          if (a.library_identifier) console.log(`Library ID: ${a.library_identifier}`);
          console.log();
          console.log(`Tracks (${detail.tracks.length}):`);
          printTracks(detail.tracks, false);
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );

  albums
    .command("update <release-id>")
    .description("Update album metadata")
    .option("--friend-id <n>", "Friend ID", intOption)
    .option("--rating <n>", "Album rating (0-5)", parseFloat)
    .option("--notes <text>", "Album notes")
    .option("--price <n>", "Purchase price", parseFloat)
    .option("--condition <s>", "Condition (e.g. VG+, NM)")
    .option("--library-id <s>", "Library identifier (e.g. LP001)")
    .action(
      async (
        releaseId: string,
        opts: {
          friendId?: number;
          rating?: number;
          notes?: string;
          price?: number;
          condition?: string;
          libraryId?: string;
        }
      ) => {
        try {
          const client = makeClient();
          const friendId = opts.friendId ?? defaultFriendId();
          const updates: Record<string, string | number | null> = {};
          if (opts.rating != null) updates.album_rating = opts.rating;
          if (opts.notes != null) updates.album_notes = opts.notes;
          if (opts.price != null) updates.purchase_price = opts.price;
          if (opts.condition != null) updates.condition = opts.condition;
          if (opts.libraryId != null) updates.library_identifier = opts.libraryId;

          if (Object.keys(updates).length === 0) {
            printError("No fields to update. Use --rating, --notes, --price, --condition, or --library-id.");
            process.exit(2);
          }

          await client.updateAlbum(releaseId, friendId, updates);
          printSuccess("✓ Album updated.");
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );

  albums
    .command("download <release-id>")
    .description("Queue all missing tracks in an album for download")
    .option("--friend-id <n>", "Friend ID", intOption)
    .action(async (releaseId: string, opts: { friendId?: number }) => {
      try {
        const client = makeClient();
        const friendId = opts.friendId ?? defaultFriendId();
        const result = await client.downloadAlbum(releaseId, friendId);
        if (result.tracksQueued === 0) {
          console.log("No tracks need downloading (all already have audio files).");
        } else {
          printSuccess(`✓ Queued ${result.tracksQueued} track(s) for download.`);
        }
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
