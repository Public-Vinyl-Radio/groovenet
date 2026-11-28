import chalk from "chalk";
import Table from "cli-table3";
import type { Track, Playlist, Friend } from "@groovenet/client";
import { hasPlayableAudio } from "@groovenet/player";

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function printError(msg: string): void {
  process.stderr.write(chalk.red(`Error: ${msg}`) + "\n");
}

export function printSuccess(msg: string): void {
  process.stdout.write(chalk.green(msg) + "\n");
}

/** `yes` when the player can play the track, `no` when it would fail NO_AUDIO. */
export function audioLabel(track: Pick<Track, "local_audio_url">): string {
  return hasPlayableAudio(track) ? chalk.green("yes") : chalk.dim("no");
}

export function printTracks(tracks: Track[], json: boolean): void {
  if (json) {
    printJson(tracks);
    return;
  }
  if (tracks.length === 0) {
    console.log(chalk.yellow("No tracks found."));
    return;
  }
  const table = new Table({
    head: [
      chalk.cyan("ID"),
      chalk.cyan("Title"),
      chalk.cyan("Artist"),
      chalk.cyan("BPM"),
      chalk.cyan("Key"),
      chalk.cyan("Rating"),
      chalk.cyan("Friend"),
      chalk.cyan("Audio"),
    ],
    colWidths: [36, 32, 24, 6, 12, 7, 8, 7],
    wordWrap: true,
  });
  for (const t of tracks) {
    table.push([
      t.track_id,
      t.title,
      t.artist,
      t.bpm ?? "-",
      t.key ?? "-",
      t.star_rating != null ? `★${t.star_rating}` : "-",
      t.friend_id ?? "-",
      audioLabel(t),
    ]);
  }
  console.log(table.toString());
}

export function printTrack(track: Track, json: boolean): void {
  if (json) {
    printJson(track);
    return;
  }
  console.log(chalk.bold(`${track.title}`) + chalk.gray(` — ${track.artist}`));
  console.log(chalk.gray(`Album: ${track.album}${track.year ? ` (${track.year})` : ""}`));
  console.log();

  const fields: [string, string | number | undefined | null][] = [
    ["Track ID", track.track_id],
    ["BPM", track.bpm],
    ["Key", track.key],
    ["Danceability", track.danceability],
    ["Duration", track.duration_seconds ? formatDuration(track.duration_seconds) : track.duration],
    ["Star Rating", track.star_rating != null ? `★${track.star_rating}/5` : undefined],
    [
      "Others' Ratings",
      track.other_ratings?.length
        ? track.other_ratings.map((o) => `${o.name} ★${o.rating}`).join(", ")
        : undefined,
    ],
    ["Genres", track.genres?.join(", ")],
    ["Styles", track.styles?.join(", ")],
    ["Tags", track.local_tags],
    ["Notes", track.notes],
    ["Mood — Happy", track.mood_happy],
    ["Mood — Sad", track.mood_sad],
    ["Mood — Relaxed", track.mood_relaxed],
    ["Mood — Aggressive", track.mood_aggressive],
    ["Apple Music", track.apple_music_url],
    ["Spotify", track.spotify_url],
    ["YouTube", track.youtube_url],
    ["SoundCloud", track.soundcloud_url],
    ["Discogs", track.discogs_url],
  ];

  for (const [label, value] of fields) {
    if (value != null && value !== "" && value !== "-") {
      console.log(`  ${chalk.gray(label + ":")} ${value}`);
    }
  }
}

/** The owning profile (#1284), marked when private; "-" from a server without owners. */
export function playlistOwner(p: Pick<Playlist, "owner_name" | "visibility">): string {
  const name = p.owner_name ?? "-";
  return p.visibility === "private" ? `${name} (private)` : name;
}

export function printPlaylists(playlists: Playlist[], json: boolean): void {
  if (json) {
    printJson(playlists);
    return;
  }
  if (playlists.length === 0) {
    console.log(chalk.yellow("No playlists found."));
    return;
  }
  const table = new Table({
    head: [
      chalk.cyan("ID"),
      chalk.cyan("Name"),
      chalk.cyan("Owner"),
      chalk.cyan("Tracks"),
      chalk.cyan("Created"),
    ],
    colWidths: [6, 40, 18, 8, 22],
  });
  for (const p of playlists) {
    table.push([
      p.id,
      p.name,
      playlistOwner(p),
      p.tracks?.length ?? 0,
      p.created_at ? new Date(p.created_at).toLocaleDateString() : "-",
    ]);
  }
  console.log(table.toString());
}

export function printFriends(friends: Friend[], json: boolean): void {
  if (json) {
    printJson(friends);
    return;
  }
  if (friends.length === 0) {
    console.log(chalk.yellow("No friends added yet."));
    return;
  }
  const table = new Table({
    head: [chalk.cyan("ID"), chalk.cyan("Username")],
    colWidths: [6, 40],
  });
  for (const f of friends) {
    table.push([f.id, f.username]);
  }
  console.log(table.toString());
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}
