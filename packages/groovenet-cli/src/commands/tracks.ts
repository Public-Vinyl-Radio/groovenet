import { Command } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import type { SimilarTrack, RecommendationCandidate } from "@groovenet/client";
import {
  printTracks,
  printTrack,
  printJson,
  printSuccess,
  printError,
} from "../output.js";
import chalk from "chalk";

function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({ baseUrl: cfg.api_base, apiKey: cfg.api_key, insecureTls: cfg.insecure_tls });
}

export function addTracksCommands(program: Command): void {
  const tracks = program.command("tracks").description("Search and manage tracks");

  tracks
    .command("search <query>")
    .description("Search your collection")
    .option("--bpm-min <n>", "Minimum BPM", parseFloat)
    .option("--bpm-max <n>", "Maximum BPM", parseFloat)
    .option("--key <k>", "Musical key (e.g. 'A minor')")
    .option("--rating <n>", "Filter by star rating (0-5)", parseFloat)
    .option("--limit <n>", "Number of results", parseInt, 20)
    .option("--json", "Output as JSON")
    .action(
      async (
        query: string,
        opts: {
          bpmMin?: number;
          bpmMax?: number;
          key?: string;
          rating?: number;
          limit: number;
          json?: boolean;
        }
      ) => {
        try {
          const client = makeClient();
          const filters: Record<string, number | string> = {};
          if (opts.bpmMin != null) filters.bpm_min = opts.bpmMin;
          if (opts.bpmMax != null) filters.bpm_max = opts.bpmMax;
          if (opts.key) filters.key = opts.key;
          if (opts.rating != null) filters.star_rating = opts.rating;

          const result = await client.searchTracks({
            query,
            limit: opts.limit,
            filters: Object.keys(filters).length > 0 ? filters : undefined,
          });

          if (opts.json) {
            printJson(result);
          } else {
            console.log(
              `Found ${result.tracks.length} track(s)` +
                (result.estimatedTotalHits > result.tracks.length
                  ? ` (${result.estimatedTotalHits} total)`
                  : "")
            );
            printTracks(result.tracks, false);
          }
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );

  tracks
    .command("show <id>")
    .description("Show details for a track")
    .option("--friend-id <n>", "Friend ID (defaults to config default_friend_id)", parseInt)
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { friendId?: number; json?: boolean }) => {
      try {
        const cfg = loadConfig();
        const client = makeClient();
        const track = await client.getTrack(id, opts.friendId ?? cfg.default_friend_id);
        printTrack(track, opts.json ?? false);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  tracks
    .command("update <id>")
    .description("Update track metadata")
    .option("--rating <n>", "Star rating (0-5)", parseFloat)
    .option("--notes <text>", "Notes")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--apple-url <url>", "Apple Music URL")
    .option("--spotify-url <url>", "Spotify URL")
    .option("--youtube-url <url>", "YouTube URL")
    .option("--soundcloud-url <url>", "SoundCloud URL")
    .action(
      async (
        id: string,
        opts: {
          rating?: number;
          notes?: string;
          tags?: string;
          appleUrl?: string;
          spotifyUrl?: string;
          youtubeUrl?: string;
          soundcloudUrl?: string;
        }
      ) => {
        try {
          const client = makeClient();
          const updates: Record<string, string | number> = {};
          if (opts.rating != null) updates.star_rating = opts.rating;
          if (opts.notes) updates.notes = opts.notes;
          if (opts.tags) updates.local_tags = opts.tags;
          if (opts.appleUrl) updates.apple_music_url = opts.appleUrl;
          if (opts.spotifyUrl) updates.spotify_url = opts.spotifyUrl;
          if (opts.youtubeUrl) updates.youtube_url = opts.youtubeUrl;
          if (opts.soundcloudUrl) updates.soundcloud_url = opts.soundcloudUrl;

          if (Object.keys(updates).length === 0) {
            printError("No fields to update. Use --rating, --notes, --tags, etc.");
            process.exit(2);
          }

          await client.updateTrack(id, updates, loadConfig().default_friend_id);
          printSuccess("✓ Track updated.");
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );

  tracks
    .command("missing-apple-music")
    .description("List tracks missing Apple Music URLs")
    .option("--page <n>", "Page number", parseInt, 1)
    .option("--page-size <n>", "Results per page", parseInt, 50)
    .option("--username <u>", "Username")
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        page: number;
        pageSize: number;
        username?: string;
        json?: boolean;
      }) => {
        try {
          const client = makeClient();
          const result = await client.getMissingAppleMusic(
            opts.page,
            opts.pageSize,
            opts.username
          );
          if (opts.json) {
            printJson(result);
          } else {
            console.log(
              `Tracks missing Apple Music URLs: ${result.total} total`
            );
            printTracks(result.tracks, false);
          }
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );

  tracks
    .command("deleted")
    .description("List soft-deleted tracks")
    .option("--friend-id <n>", "Filter by friend ID", parseInt)
    .option("--limit <n>", "Max results", parseInt, 100)
    .option("--offset <n>", "Offset", parseInt, 0)
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        friendId?: number;
        limit: number;
        offset: number;
        json?: boolean;
      }) => {
        try {
          const client = makeClient();
          const result = await client.listDeletedTracks(opts.friendId, {
            limit: opts.limit,
            offset: opts.offset,
          });
          if (opts.json) {
            printJson(result);
          } else {
            console.log(`Deleted tracks: ${result.total} total`);
            printTracks(result.tracks, false);
          }
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );

  tracks
    .command("restore <id>")
    .description("Restore a soft-deleted track")
    .option("--friend-id <n>", "Friend ID (defaults to config default_friend_id)", parseInt)
    .action(async (id: string, opts: { friendId?: number }) => {
      try {
        const cfg = loadConfig();
        const client = makeClient();
        const friendId = opts.friendId ?? cfg.default_friend_id;
        await client.restoreTrack(id, friendId);
        printSuccess(`✓ Track ${id} restored.`);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  tracks
    .command("recommend <id>")
    .description("Get combined recommendations using both identity and audio vibe embeddings")
    .option("--limit <n>", "Number of candidates to return", parseInt, 20)
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { limit: number; json?: boolean }) => {
      try {
        const cfg = loadConfig();
        const client = makeClient();
        const result = await client.getRecommendationCandidates(id, cfg.default_friend_id, {
          limit_identity: opts.limit,
          limit_audio: opts.limit,
        });
        if (opts.json) {
          printJson(result);
        } else {
          console.log(
            `Recommendations for ${chalk.cyan(id)} — ${result.candidates.length} candidates` +
            chalk.dim(` (identity:${result.stats.identityCount} vibe:${result.stats.audioCount} union:${result.stats.unionCount})`)
          );
          printRecommendationCandidates(result.candidates);
        }
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  tracks
    .command("similar-identity <id>")
    .description("Find tracks with similar identity (genre, era, style, tags)")
    .option("--limit <n>", "Number of results", parseInt, 10)
    .option("--era <era>", "Filter by era (e.g. '1970s')")
    .option("--country <country>", "Filter by country")
    .option("--tags <tags>", "Comma-separated tags to filter by")
    .option("--json", "Output as JSON")
    .action(
      async (
        id: string,
        opts: {
          limit: number;
          era?: string;
          country?: string;
          tags?: string;
          json?: boolean;
        }
      ) => {
        try {
          const cfg = loadConfig();
          const client = makeClient();
          const result = await client.findSimilarIdentity(id, cfg.default_friend_id, {
            limit: opts.limit,
            era: opts.era,
            country: opts.country,
            tags: opts.tags,
          });
          if (opts.json) {
            printJson(result);
          } else {
            console.log(
              `Similar identity tracks for ${chalk.cyan(id)} (${result.count} results):`
            );
            printSimilarTracks(result.tracks);
          }
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );

  tracks
    .command("similar-vibe <id>")
    .description("Find tracks with similar audio vibe (BPM, mood, danceability)")
    .option("--limit <n>", "Number of results", parseInt, 10)
    .option("--json", "Output as JSON")
    .action(
      async (
        id: string,
        opts: {
          limit: number;
          json?: boolean;
        }
      ) => {
        try {
          const cfg = loadConfig();
          const client = makeClient();
          const result = await client.findSimilarVibe(id, cfg.default_friend_id, {
            limit: opts.limit,
          });
          if (opts.json) {
            printJson(result);
          } else {
            console.log(
              `Similar vibe tracks for ${chalk.cyan(id)} (${result.count} results):`
            );
            printSimilarTracks(result.tracks);
          }
        } catch (err: unknown) {
          printError(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    );
}

function printRecommendationCandidates(candidates: RecommendationCandidate[]): void {
  for (const c of candidates) {
    const bpm = c.metadata.bpm ? chalk.dim(` BPM:${c.metadata.bpm}`) : "";
    const key = c.metadata.key ? chalk.dim(` Key:${c.metadata.key}`) : "";
    const identity = c.simIdentity != null ? chalk.green(` id:${c.simIdentity.toFixed(3)}`) : "";
    const audio = c.simAudio != null ? chalk.blue(` vibe:${c.simAudio.toFixed(3)}`) : "";
    console.log(
      `  ${chalk.cyan(c.trackId)}  ${chalk.bold(c.metadata.title)} ${chalk.dim("—")} ${c.metadata.artist} ${chalk.dim("(" + c.metadata.album + ")")}${bpm}${key}${identity}${audio}`
    );
  }
}

function printSimilarTracks(tracks: SimilarTrack[]): void {
  for (const t of tracks) {
    const bpm = t.bpm ? chalk.dim(` BPM:${t.bpm}`) : "";
    const key = t.key ? chalk.dim(` Key:${t.key}`) : "";
    const dist = chalk.yellow(` [dist: ${Number(t.distance).toFixed(4)}]`);
    console.log(
      `  ${chalk.cyan(t.track_id)}  ${chalk.bold(t.title)} ${chalk.dim("—")} ${t.artist} ${chalk.dim("(" + t.album + ")")}${bpm}${key}${dist}`
    );
  }
}
