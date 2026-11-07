import type { Command } from "commander";
import type { ArtistListResponse, ArtistPageResponse, GroovenetClient } from "@groovenet/client";
import chalk from "chalk";
import Table from "cli-table3";
import { printError } from "../output.js";
import { boundedIntOption } from "../options.js";
import { consoleIO, makeClient, type FingerprintLibraryIO } from "./fingerprintLibrary.js";
import { resolveFriendId, type FriendScopeOptions } from "./genres.js";

/** `groovenet artists list | show | albums` (#710): browse artists and what a collection holds. */

export type ArtistsBrowseIO = FingerprintLibraryIO;

export interface ArtistListOptions extends FriendScopeOptions {
  limit?: number;
  offset?: number;
  placeholders?: boolean;
  json?: boolean;
}

export interface ArtistShowOptions extends FriendScopeOptions {
  json?: boolean;
}

const n = (value: number) => value.toLocaleString("en-US");
const plural = (count: number, word: string) => `${n(count)} ${word}${count === 1 ? "" : "s"}`;

export function formatArtistList(result: ArtistListResponse): string[] {
  if (result.items.length === 0) return [chalk.yellow("No artists found.")];
  const table = new Table({
    head: ["Slug", "Name", "Albums", "Tracks"].map((h) => chalk.cyan(h)),
  });
  for (const a of result.items) {
    table.push([
      a.slug,
      a.is_placeholder ? `${a.name} ${chalk.gray("(placeholder)")}` : a.name,
      String(a.album_count),
      String(a.track_count),
    ]);
  }
  const last = result.offset + result.items.length;
  return [
    table.toString(),
    chalk.gray(`${n(result.offset + 1)}–${n(last)} of ${plural(result.total, "artist")}`),
  ];
}

function header(page: ArtistPageResponse): string[] {
  const { artist, counts } = page;
  const years =
    counts.year_min == null
      ? ""
      : counts.year_min === counts.year_max
        ? ` · ${counts.year_min}`
        : ` · ${counts.year_min}–${counts.year_max}`;
  const lines = [chalk.bold(artist.name) + chalk.gray(`  ${artist.slug}`)];
  if (artist.is_placeholder) {
    lines.push(chalk.yellow("  A placeholder credit (such as Various): it has no artist page."));
    return lines;
  }
  lines.push(
    `  ${plural(counts.albums, "album")}, appears on ${n(counts.appears_on)}, ` +
      `${plural(counts.tracks, "track")}, ${plural(counts.spins, "spin")}${years}`,
  );
  if (artist.discogs_artist_id)
    lines.push(chalk.gray(`  Discogs artist ${artist.discogs_artist_id}`));
  if (page.aliases.length) lines.push(chalk.gray(`  Also credited as: ${page.aliases.join(", ")}`));
  return lines;
}

export function formatArtistAlbums(page: ArtistPageResponse): string[] {
  if (page.albums.length === 0) return [chalk.yellow("No albums in this collection.")];
  const table = new Table({
    head: ["Release ID", "Title", "Year", "Credit", "Plays"].map((h) => chalk.cyan(h)),
  });
  for (const a of page.albums) {
    const credit =
      a.appears_on_tracks > 0
        ? `appears on ${a.appears_on_positions.filter(Boolean).join(", ") || plural(a.appears_on_tracks, "track")}`
        : "album";
    table.push([a.release_id, a.title, String(a.year ?? "-"), credit, String(a.play_count)]);
  }
  return [table.toString()];
}

export function formatArtistShow(page: ArtistPageResponse, topTracks = 10): string[] {
  const lines = header(page);
  if (page.artist.is_placeholder) return lines;
  if (page.genres.length) {
    lines.push(`  Genres: ${page.genres.map((g) => `${g.name} (${g.track_count})`).join(", ")}`);
  }
  if (page.collaborators.length) {
    lines.push(
      `  With: ${page.collaborators.map((c) => `${c.name} (${c.shared_credits})`).join(", ")}`,
    );
  }
  lines.push("", chalk.bold("Albums"), ...formatArtistAlbums(page));
  if (page.top_tracks.length) {
    const by = page.top_tracks_by === "spins" ? "most played" : "in album order";
    lines.push("", chalk.bold("Top tracks") + chalk.gray(` — ${by}`));
    const table = new Table({
      head: ["Track ID", "Title", "Album", "Pos", "Plays"].map((h) => chalk.cyan(h)),
    });
    for (const t of page.top_tracks.slice(0, topTracks)) {
      table.push([
        t.track_id,
        t.title,
        t.album ?? "",
        String(t.position ?? ""),
        String(t.play_count),
      ]);
    }
    lines.push(table.toString());
  }
  return lines;
}

export async function runArtistList(
  client: Pick<GroovenetClient, "searchArtists">,
  query: string,
  opts: ArtistListOptions,
  io: ArtistsBrowseIO = consoleIO,
): Promise<number> {
  const friendId = resolveFriendId(opts);
  const result = await client.searchArtists({
    ...(query ? { q: query } : {}),
    ...(friendId !== undefined ? { friend_id: friendId } : {}),
    ...(opts.placeholders ? { include_placeholders: true } : {}),
    ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    ...(opts.offset !== undefined ? { offset: opts.offset } : {}),
  });
  if (opts.json) io.write(JSON.stringify(result, null, 2) + "\n");
  else for (const line of formatArtistList(result)) io.log(line);
  return 0;
}

export async function runArtistShow(
  client: Pick<GroovenetClient, "getArtist">,
  slug: string,
  opts: ArtistShowOptions,
  view: "show" | "albums",
  io: ArtistsBrowseIO = consoleIO,
): Promise<number> {
  const page = await client.getArtist(slug, resolveFriendId(opts));
  if (opts.json) {
    io.write(JSON.stringify(view === "albums" ? page.albums : page, null, 2) + "\n");
    return 0;
  }
  const lines =
    view === "show"
      ? formatArtistShow(page)
      : page.artist.is_placeholder
        ? header(page)
        : [...header(page), "", ...formatArtistAlbums(page)];
  for (const line of lines) io.log(line);
  return 0;
}

const friendOptions = (command: Command) =>
  command
    .option(
      "--friend-id <n>",
      "Only this friend's collection (defaults to config default_friend_id)",
      boundedIntOption(1),
    )
    .option("--all-friends", "Every friend's collection")
    .option("--json", "Output as JSON");

function action<A extends unknown[]>(run: (...args: A) => Promise<number>) {
  return async (...args: A) => {
    try {
      process.exitCode = await run(...args);
    } catch (err: unknown) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  };
}

export function addArtistsBrowseCommands(artists: Command): void {
  friendOptions(
    artists
      .command("list")
      .description("Search artists by name or alias, with album and track counts")
      .argument("[query]", "Name or alias to match", "")
      .option("--limit <n>", "Number of results (1 to 200)", boundedIntOption(1), 50)
      .option("--offset <n>", "Offset", boundedIntOption(0), 0)
      .option("--placeholders", "Include Various and Unknown Artist"),
  ).action(
    action((query: string, opts: ArtistListOptions) => runArtistList(makeClient(), query, opts)),
  );

  friendOptions(
    artists
      .command("show")
      .description("One artist: counts, aliases, genres, collaborators, albums and top tracks")
      .argument("<slug>", "Artist slug (see `groovenet artists list`)"),
  ).action(
    action((slug: string, opts: ArtistShowOptions) =>
      runArtistShow(makeClient(), slug, opts, "show"),
    ),
  );

  friendOptions(
    artists
      .command("albums")
      .description("Albums by an artist: credited albums first, then appearances")
      .argument("<slug>", "Artist slug (see `groovenet artists list`)"),
  ).action(
    action((slug: string, opts: ArtistShowOptions) =>
      runArtistShow(makeClient(), slug, opts, "albums"),
    ),
  );
}
