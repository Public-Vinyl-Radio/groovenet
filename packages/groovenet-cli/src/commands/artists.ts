import { addArtistsBrowseCommands } from "./artistsBrowse.js";
import { addArtistsReviewCommand } from "./artistsReview.js";
import { Command } from "commander";
import type { ArtistReconcileResponse, GroovenetClient } from "@groovenet/client";
import chalk from "chalk";
import Table from "cli-table3";
import { printError } from "../output.js";
import { boundedIntOption } from "../options.js";
import { consoleIO, makeClient, type FingerprintLibraryIO } from "./fingerprintLibrary.js";
import { resolveFriendId, type FriendScopeOptions } from "./genres.js";

/**
 * `groovenet artists` (epic #700). `list`, `show` and `albums` browse them
 * (#710); `reconcile` is the one-off backfill that links existing albums and
 * tracks to artists (#705); reviewing the queue it prints is #706.
 */

export type ArtistsIO = FingerprintLibraryIO;

export interface ArtistReconcileOptions extends FriendScopeOptions {
  dryRun?: boolean;
  json?: boolean;
}

const n = (value: number) => value.toLocaleString("en-US");

/** The report as lines: counts first, then the review queue in full. */
export function formatArtistReconcile(result: ArtistReconcileResponse): string[] {
  const { baseline: b, albums, tracks, credits, artists } = result;
  const scope = result.friend_id == null ? "all friends" : `friend ${result.friend_id}`;
  const lines = [
    chalk.bold(`Artist reconcile${result.dry_run ? " (dry run)" : ""}`) + chalk.gray(` — ${scope}`),
    `  Album artists: ${n(b.albums)} albums, ${n(b.distinct_strings)} distinct strings, ` +
      `${n(b.spelling_groups)} spelling groups, ${n(b.inversions)} inversions, ` +
      `${n(b.various)} Various, ${n(b.unknown_artist)} Unknown Artist`,
  ];
  const linkLine = (label: string, c: ArtistReconcileResponse["albums"]) =>
    result.dry_run
      ? `  ${label}: ${n(c.pending)} to link`
      : `  ${label}: ${n(c.linked)} linked of ${n(c.pending)}` +
        (c.failed ? chalk.red(`, ${n(c.failed)} failed`) : "");
  lines.push(linkLine("Albums", albums), linkLine("Tracks", tracks));
  lines.push(
    `  Credits: ${n(credits.discogs)} from Discogs, ${n(credits.legacy)} from the artist string`,
    `  Artists: ${n(artists.matched_by_discogs_id)} matched by Discogs id, ` +
      `${n(artists.matched_by_name)} by name or alias, ${n(artists.created)} new`,
  );

  lines.push(
    result.dry_run
      ? `  Sort names: ${n(result.sort_names.pending)} to file as "X, The"`
      : `  Sort names: ${n(result.sort_names.updated)} filed as "X, The" of ${n(result.sort_names.pending)}`,
  );

  if (result.review_queue.length === 0) {
    lines.push(chalk.green("  Review queue: empty"));
  } else {
    lines.push(
      chalk.bold(`  Review queue: ${n(result.review_queue.length)}`) +
        chalk.gray(" — string-only credits with a separator, kept whole"),
    );
    const table = new Table({
      head: ["Credited as", "Albums", "Tracks"].map((h) => chalk.cyan(h)),
    });
    for (const item of result.review_queue)
      table.push([item.credited_as, String(item.albums), String(item.tracks)]);
    lines.push(table.toString());
  }
  for (const error of result.errors)
    lines.push(chalk.red(`  ${error.kind} ${error.id}: ${error.message}`));
  if (result.dry_run) lines.push(chalk.gray("Nothing written. Run without --dry-run to link."));
  else if (albums.pending + tracks.pending === 0) lines.push(chalk.gray("Nothing to do."));
  return lines;
}

export async function runArtistReconcile(
  client: Pick<GroovenetClient, "reconcileArtists">,
  opts: ArtistReconcileOptions,
  io: ArtistsIO = consoleIO,
): Promise<number> {
  const friendId = resolveFriendId(opts);
  const result = await client.reconcileArtists({
    ...(opts.dryRun ? { dry_run: true } : {}),
    ...(friendId !== undefined ? { friend_id: friendId } : {}),
  });
  if (opts.json) io.write(JSON.stringify(result, null, 2) + "\n");
  else for (const line of formatArtistReconcile(result)) io.log(line);
  return result.albums.failed + result.tracks.failed > 0 ? 1 : 0;
}

export function addArtistsCommands(program: Command): void {
  const artists = program.command("artists").description("Artists shared across collections");

  addArtistsBrowseCommands(artists);
  addArtistsReviewCommand(artists);

  artists
    .command("reconcile")
    .description("Link existing albums and tracks to artists (idempotent; review queue printed)")
    .option("--dry-run", "Print the counts and review queue without writing")
    .option(
      "--friend-id <n>",
      "Only this friend's albums and tracks (defaults to config default_friend_id)",
      boundedIntOption(1),
    )
    .option("--all-friends", "Every friend's albums and tracks")
    .option("--json", "Output as JSON")
    .action(async (opts: ArtistReconcileOptions) => {
      try {
        process.exitCode = await runArtistReconcile(makeClient(), opts);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
