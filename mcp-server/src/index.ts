#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GroovenetClient, type Track, type RecordActionInput, type RecordCareStatus, type SleeveType, type CleaningMethod, type TrackSearchMode } from "@groovenet/client";
import dotenv from "dotenv";

// Stdio is the MCP protocol channel; dotenv's startup banner must stay off it.
dotenv.config({ quiet: true });

const API_BASE = process.env.API_BASE || "http://localhost:3000/api";
const API_KEY = process.env.API_KEY;
const DEFAULT_FRIEND_ID = process.env.DEFAULT_FRIEND_ID ? parseInt(process.env.DEFAULT_FRIEND_ID, 10) : 1;

const client = new GroovenetClient({ baseUrl: API_BASE, apiKey: API_KEY, clientName: "mcp" });

// Define tool schemas
const tools = [
  {
    name: "search_tracks",
    description: "Search for tracks in your collection by title, artist, album, genre, or tags — or, with mode 'semantic' or 'hybrid', by a natural-language description of the sound (e.g. 'dusty 70s cumbia with brass'). Supports filtering by BPM range, key, and star rating.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (title, artist, album, genre, or tag), or a description of the music for semantic/hybrid mode" },
        mode: {
          type: "string",
          enum: ["lexical", "semantic", "hybrid"],
          description: "lexical (default) matches words; semantic matches meaning; hybrid fuses both, with exact title/artist/album matches first. Semantic and hybrid return at most 50 results.",
        },
        bpm_min: { type: "number", description: "Minimum BPM, inclusive" },
        bpm_max: { type: "number", description: "Maximum BPM, inclusive" },
        key: { type: "string", description: "Exact musical key, case-insensitive (e.g., 'A minor', 'C major')" },
        star_rating: { type: "number", description: "Minimum star rating (0-5)" },
        limit: { type: "number", description: "Number of results to return", default: 10 },
      },
      required: ["query"],
    },
  },
  {
    name: "get_track_details",
    description: "Get detailed information about a specific track including audio analysis (BPM, key, mood scores, danceability)",
    inputSchema: {
      type: "object",
      properties: {
        track_id: { type: "string", description: "The track ID" },
        friend_id: { type: "number", description: "Friend ID (owner of the track, uses default if omitted)" },
      },
      required: ["track_id"],
    },
  },
  {
    name: "update_track",
    description: "Update track metadata (star rating, notes, tags, URLs, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        track_id: { type: "string", description: "Track ID" },
        star_rating: { type: "number", description: "Star rating (0-5)" },
        notes: { type: "string", description: "Track notes" },
        local_tags: { type: "string", description: "Comma-separated tags" },
        apple_music_url: { type: "string", description: "Apple Music URL" },
        spotify_url: { type: "string", description: "Spotify URL" },
        youtube_url: { type: "string", description: "YouTube URL" },
        soundcloud_url: { type: "string", description: "SoundCloud URL" },
      },
      required: ["track_id"],
    },
  },
  {
    name: "get_missing_apple_music",
    description: "Get tracks that are missing Apple Music URLs",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number", default: 1 },
        pageSize: { type: "number", description: "Number of tracks per page", default: 50 },
        username: { type: "string", description: "Username (optional)" },
      },
    },
  },
  {
    name: "search_albums",
    description: "Search or list albums in the collection. Supports sorting by when added to Groovenet, Discogs date, year, title, or album_rating.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (title, artist, genre)" },
        sort: {
          type: "string",
          description: "Sort order: created_at:desc (default), date_added:desc, date_added:asc, year:desc, year:asc, title:asc, album_rating:desc",
        },
        limit: { type: "number", description: "Number of results to return", default: 20 },
        friend_id: { type: "number", description: "Filter by friend ID" },
      },
    },
  },
  {
    name: "get_album",
    description: "Get details about a specific album including its full track list",
    inputSchema: {
      type: "object",
      properties: {
        release_id: { type: "string", description: "The Discogs release ID" },
        friend_id: { type: "number", description: "Friend ID (owner of the album)" },
      },
      required: ["release_id", "friend_id"],
    },
  },
  {
    name: "update_album",
    description: "Update album metadata (rating, notes, purchase price, condition, library identifier)",
    inputSchema: {
      type: "object",
      properties: {
        release_id: { type: "string", description: "The Discogs release ID" },
        friend_id: { type: "number", description: "Friend ID" },
        album_rating: { type: "number", description: "Album rating (0-5)" },
        album_notes: { type: "string", description: "Album notes" },
        purchase_price: { type: "number", description: "Purchase price" },
        condition: { type: "string", description: "Record condition (e.g. VG+, NM)" },
        library_identifier: { type: "string", description: "Library identifier (e.g. LP001)" },
      },
      required: ["release_id", "friend_id"],
    },
  },
  {
    name: "download_album",
    description: "Queue all missing tracks in an album for download via the background worker",
    inputSchema: {
      type: "object",
      properties: {
        release_id: { type: "string", description: "The Discogs release ID" },
        friend_id: { type: "number", description: "Friend ID" },
      },
      required: ["release_id", "friend_id"],
    },
  },
  {
    name: "list_playlists",
    description: "List all playlists in your collection",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_playlist",
    description: "Get details about a specific playlist including all tracks",
    inputSchema: {
      type: "object",
      properties: {
        playlist_id: { type: "string", description: "The playlist ID" },
      },
      required: ["playlist_id"],
    },
  },
  {
    name: "create_playlist",
    description: "Create a new playlist with optional tracks",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Playlist name" },
        tracks: { type: "array", items: { type: "string" }, description: "Array of track IDs to add to playlist" },
      },
      required: ["name"],
    },
  },
  {
    name: "generate_ai_playlist",
    description: "Generate an optimized DJ playlist using genetic algorithm based on seed tracks. Creates smooth transitions based on BPM, key compatibility, and mood progression.",
    inputSchema: {
      type: "object",
      properties: {
        playlist: { type: "array", items: { type: "object" }, description: "Array of seed track objects" },
      },
      required: ["playlist"],
    },
  },
  {
    name: "get_playlist_tracks",
    description: "Get all track IDs in a playlist",
    inputSchema: {
      type: "object",
      properties: {
        playlist_id: { type: "string", description: "The playlist ID" },
      },
      required: ["playlist_id"],
    },
  },
  {
    name: "get_friends",
    description: "List all friends and their shared collections",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "add_friend",
    description: "Add a friend to share collections with",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Friend's username" },
      },
      required: ["username"],
    },
  },
  {
    name: "search_apple_music",
    description: "Search for tracks on Apple Music to enrich track metadata",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Track title" },
        artist: { type: "string", description: "Artist name" },
        album: { type: "string", description: "Album name" },
        isrc: { type: "string", description: "ISRC code" },
      },
    },
  },
  {
    name: "search_youtube",
    description: "Search for tracks on YouTube Music",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Track title" },
        artist: { type: "string", description: "Artist name" },
      },
    },
  },
  {
    name: "get_recommendations",
    description: "Get combined recommendations for a track using both identity (genre/style/era) and audio vibe (BPM/mood/danceability) embeddings. Returns a ranked union of candidates from both indexes — the best tool for finding tracks to play next.",
    inputSchema: {
      type: "object",
      properties: {
        track_id: { type: "string", description: "The source track ID" },
        friend_id: { type: "number", description: "Friend ID (owner of the source track, uses default if omitted)" },
        limit: { type: "number", description: "Number of candidates from each index (default: 20)" },
      },
      required: ["track_id"],
    },
  },
  {
    name: "find_similar_identity",
    description: "Find tracks with similar identity (genre, era, country, style, tags) using vector embeddings. Great for finding stylistically related music.",
    inputSchema: {
      type: "object",
      properties: {
        track_id: { type: "string", description: "The source track ID" },
        friend_id: { type: "number", description: "Friend ID (owner of the source track)" },
        limit: { type: "number", description: "Number of results to return (default: 10)" },
        era: { type: "string", description: "Filter by era (e.g. '1970s', '1980s')" },
        country: { type: "string", description: "Filter by country of origin" },
        tags: { type: "string", description: "Comma-separated tags to filter by" },
      },
      required: ["track_id", "friend_id"],
    },
  },
  {
    name: "find_similar_vibe",
    description: "Find tracks with similar audio vibe (BPM, mood, danceability, key) using audio analysis vectors. Great for building cohesive DJ sets.",
    inputSchema: {
      type: "object",
      properties: {
        track_id: { type: "string", description: "The source track ID" },
        friend_id: { type: "number", description: "Friend ID (owner of the source track)" },
        limit: { type: "number", description: "Number of results to return (default: 10)" },
      },
      required: ["track_id", "friend_id"],
    },
  },
  {
    name: "log_record_action",
    description: "Log a cleaning, sleeve change, inspection or repair for a physical record. Supply either release_id (uses its default copy) or copy_id. Sleeve type is required for sleeved actions; cleaning method applies only to cleaned actions.",
    inputSchema: { type: "object", properties: {
      release_id: { type: "string", description: "Discogs release ID; use this or copy_id" },
      copy_id: { type: "integer", description: "Physical copy ID; use this or release_id" },
      friend_id: { type: "integer", description: "Collection owner (default from server configuration)" },
      action_type: { type: "string", enum: ["cleaned", "sleeved", "inspected", "repaired"] },
      occurred_at: { type: "string", description: "ISO timestamp; defaults to now" },
      notes: { type: "string" },
      sleeve_type: { type: "string", enum: ["original", "paper", "poly-rice-paper-poly", "poly"] },
      method: { type: "string", enum: ["dry-brush", "wet-manual", "vacuum", "ultrasonic", "other"] },
    }, required: ["action_type"] },
  },
  {
    name: "list_record_care",
    description: "Find physical copies never cleaned, overdue for cleaning, or needing a specified inner sleeve. Albums with no logged copy appear as an implicit default copy.",
    inputSchema: { type: "object", properties: {
      friend_id: { type: "integer", description: "Collection owner (default from server configuration)" },
      status: { type: "string", enum: ["never_cleaned", "overdue", "needs_sleeve"] },
      overdue_days: { type: "integer", minimum: 1, description: "Cleaning interval; defaults to server setting" },
      needs_sleeve: { type: "string", enum: ["original", "paper", "poly-rice-paper-poly", "poly"] },
      sleeve_type: { type: "string", enum: ["original", "paper", "poly-rice-paper-poly", "poly", "unknown"], description: "Filter by current sleeve; unknown means none logged" },
      limit: { type: "integer", minimum: 1, maximum: 200 },
      offset: { type: "integer", minimum: 0 },
    } },
  },
  {
    name: "get_record_care_summary",
    description: "Count physical copies never cleaned, overdue, needing a sleeve, and by current sleeve type.",
    inputSchema: { type: "object", properties: {
      friend_id: { type: "integer", description: "Collection owner (default from server configuration)" },
      overdue_days: { type: "integer", minimum: 1 },
      needs_sleeve: { type: "string", enum: ["original", "paper", "poly-rice-paper-poly", "poly"] },
    } },
  },
  {
    name: "get_record_copies",
    description: "List the physical copies of a release and their care histories, including the implicit default copy when no action has been logged.",
    inputSchema: { type: "object", properties: {
      release_id: { type: "string", description: "Discogs release ID" },
      friend_id: { type: "integer", description: "Collection owner (default from server configuration)" },
      include_voided: { type: "boolean", description: "Include voided actions in each history" },
    }, required: ["release_id"] },
  },
  {
    name: "void_record_action",
    description: "Void a mistaken record care action. It remains in history and the copy's care state is recalculated.",
    inputSchema: { type: "object", properties: {
      action_id: { type: "integer", description: "Action to void" },
      friend_id: { type: "integer", description: "Collection owner (default from server configuration)" },
    }, required: ["action_id"] },
  },
];

interface ToolArgs {
  // tracks
  query?: string;
  mode?: TrackSearchMode;
  bpm_min?: number;
  bpm_max?: number;
  key?: string;
  star_rating?: number;
  limit?: number;
  track_id?: string;
  username?: string;
  notes?: string;
  local_tags?: string;
  apple_music_url?: string;
  spotify_url?: string;
  youtube_url?: string;
  soundcloud_url?: string;
  page?: number;
  pageSize?: number;
  // albums
  release_id?: string;
  friend_id?: number;
  sort?: string;
  album_rating?: number;
  album_notes?: string;
  purchase_price?: number;
  condition?: string;
  library_identifier?: string;
  // playlists
  playlist_id?: string;
  name?: string;
  tracks?: string[];
  playlist?: Track[];
  // ai search
  title?: string;
  artist?: string;
  album?: string;
  isrc?: string;
  // similarity
  era?: string;
  country?: string;
  tags?: string;
  // record care
  copy_id?: number;
  action_id?: number;
  action_type?: RecordActionInput["action_type"];
  occurred_at?: string;
  sleeve_type?: SleeveType | "unknown";
  method?: CleaningMethod;
  status?: RecordCareStatus;
  overdue_days?: number;
  needs_sleeve?: SleeveType;
  include_voided?: boolean;
  offset?: number;
}

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

async function recordHistory(copyId: number, friendId: number, includeVoided?: boolean) {
  const history = [];
  const pageSize = 200;
  let offset = 0;
  while (true) {
    const page = await client.listRecordActions(copyId, {
      friend_id: friendId, include_voided: includeVoided, limit: pageSize, offset,
    });
    history.push(...page.items);
    if (page.items.length < pageSize) return history;
    offset += pageSize;
  }
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

async function handleToolCall(name: string, args: ToolArgs) {
  switch (name) {
    case "log_record_action": {
      if ((args.release_id === undefined) === (args.copy_id === undefined)) {
        throw new Error("Supply exactly one of release_id or copy_id");
      }
      if (args.action_type === "sleeved" && !args.sleeve_type) throw new Error("sleeve_type is required for a sleeved action");
      if (args.action_type !== "sleeved" && args.sleeve_type) throw new Error("sleeve_type is only valid for a sleeved action");
      if (args.action_type !== "cleaned" && args.method) throw new Error("method is only valid for a cleaned action");
      const input = {
        friend_id: args.friend_id ?? DEFAULT_FRIEND_ID,
        action_type: args.action_type!,
        ...(args.copy_id !== undefined ? { copy_id: args.copy_id } : { release_id: args.release_id! }),
        ...(args.occurred_at ? { occurred_at: args.occurred_at } : {}),
        ...(args.notes ? { notes: args.notes } : {}),
        ...(args.sleeve_type ? { sleeve_type: args.sleeve_type } : {}),
        ...(args.method ? { details: { method: args.method } } : {}),
      } as RecordActionInput;
      return jsonResult(await client.logRecordAction(input));
    }
    case "list_record_care":
      return jsonResult(await client.listRecordCare({
        friend_id: args.friend_id ?? DEFAULT_FRIEND_ID,
        status: args.status, overdue_days: args.overdue_days, needs_sleeve: args.needs_sleeve,
        sleeve_type: args.sleeve_type, limit: args.limit, offset: args.offset,
      }));
    case "get_record_care_summary":
      return jsonResult(await client.getRecordCareSummary({
        friend_id: args.friend_id ?? DEFAULT_FRIEND_ID,
        overdue_days: args.overdue_days, needs_sleeve: args.needs_sleeve,
      }));
    case "get_record_copies": {
      const owner = args.friend_id ?? DEFAULT_FRIEND_ID;
      const copies = await client.listRecordCopies(owner, args.release_id!);
      return jsonResult(await Promise.all(copies.map(async (copy) => ({
        ...copy,
        history: copy.id === null ? [] : await recordHistory(copy.id, owner, args.include_voided),
      }))));
    }
    case "void_record_action":
      return jsonResult(await client.voidRecordAction(args.action_id!, args.friend_id ?? DEFAULT_FRIEND_ID));
    case "search_tracks": {
      const filters: Record<string, number | string> = {};
      if (args.bpm_min != null) filters.bpm_min = args.bpm_min;
      if (args.bpm_max != null) filters.bpm_max = args.bpm_max;
      if (args.key) filters.key = args.key;
      if (args.star_rating != null) filters.star_rating = args.star_rating;

      const result = await client.searchTracks({
        query: args.query ?? "",
        limit: args.limit ?? 10,
        mode: args.mode,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      });

      if (!result.tracks || result.tracks.length === 0) {
        return {
          content: [{ type: "text", text: `No tracks found matching "${args.query ?? ""}".` }],
        };
      }

      const list = result.tracks
        .map((t) => `• ${t.title} - ${t.artist}${t.bpm ? ` (${t.bpm} BPM)` : ""}${t.key ? `, ${t.key}` : ""}${t.star_rating != null ? ` [★${t.star_rating}]` : ""}`)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `Found ${result.tracks.length} tracks${result.estimatedTotalHits > result.tracks.length ? ` (${result.estimatedTotalHits} total)` : ""}${result.degraded ? " (semantic search unavailable; keyword results only)" : ""}:\n\n${list}`,
        }],
      };
    }

    case "get_track_details": {
      const track = await client.getTrack(
        args.track_id!,
        args.friend_id ?? DEFAULT_FRIEND_ID
      );
      const details = `
**${track.title}** by ${track.artist}
${track.album ? `Album: ${track.album}` : ""}
${track.year ? `Year: ${track.year}` : ""}

**Audio Analysis:**
- BPM: ${track.bpm ?? "Not analyzed"}
- Key: ${track.key ?? "Not analyzed"}
- Danceability: ${track.danceability ?? "N/A"}
- Duration: ${track.duration_seconds ? formatDuration(track.duration_seconds) : (track.duration ?? "N/A")}

**Mood:**
- Happy: ${track.mood_happy ?? 0}
- Sad: ${track.mood_sad ?? 0}
- Aggressive: ${track.mood_aggressive ?? 0}
- Relaxed: ${track.mood_relaxed ?? 0}

**Metadata:**
- Star Rating: ${track.star_rating !== undefined ? `★${track.star_rating}/5` : "Not rated"}
- Genres: ${track.genres?.join(", ") ?? "N/A"}
- Styles: ${track.styles?.join(", ") ?? "N/A"}
- Tags: ${track.local_tags ?? "None"}
${track.notes ? `- Notes: ${track.notes}` : ""}

**Platform URLs:**
${track.discogs_url ? `- Discogs: ${track.discogs_url}` : ""}
${track.spotify_url ? `- Spotify: ${track.spotify_url}` : ""}
${track.apple_music_url ? `- Apple Music: ${track.apple_music_url}` : ""}
${track.youtube_url ? `- YouTube: ${track.youtube_url}` : ""}
${track.soundcloud_url ? `- SoundCloud: ${track.soundcloud_url}` : ""}
      `.trim();
      return { content: [{ type: "text", text: details }] };
    }

    case "update_track": {
      await client.updateTrack(args.track_id!, {
        star_rating: args.star_rating,
        notes: args.notes,
        local_tags: args.local_tags,
        apple_music_url: args.apple_music_url,
        spotify_url: args.spotify_url,
        youtube_url: args.youtube_url,
        soundcloud_url: args.soundcloud_url,
      });
      return { content: [{ type: "text", text: "✓ Track updated successfully!" }] };
    }

    case "get_missing_apple_music": {
      const result = await client.getMissingAppleMusic(
        args.page ?? 1,
        args.pageSize ?? 50,
        args.username
      );

      if (!result.tracks || result.tracks.length === 0) {
        return { content: [{ type: "text", text: "All tracks have Apple Music URLs!" }] };
      }

      const list = result.tracks
        .slice(0, 10)
        .map((t) => `• ${t.title} - ${t.artist}`)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `Tracks missing Apple Music URLs (${result.total} total, showing first 10):\n\n${list}`,
        }],
      };
    }

    case "search_albums": {
      const result = await client.searchAlbums({
        q: args.query ?? "",
        sort: args.sort,
        limit: args.limit ?? 20,
        friend_id: args.friend_id,
      });

      if (!result.hits || result.hits.length === 0) {
        return { content: [{ type: "text", text: "No albums found." }] };
      }

      const list = result.hits
        .map((a) => `• ${a.title} — ${a.artist}${a.year ? ` (${a.year})` : ""} [${a.release_id}]${a.album_rating != null ? ` ★${a.album_rating}` : ""}`)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `Found ${result.hits.length} albums${result.estimatedTotalHits > result.hits.length ? ` (${result.estimatedTotalHits} total)` : ""}:\n\n${list}`,
        }],
      };
    }

    case "get_album": {
      const detail = await client.getAlbum(args.release_id!, args.friend_id!);
      const a = detail.album;

      const albumInfo = [
        `**${a.title}** by ${a.artist}`,
        a.year ? `Year: ${a.year}` : "",
        a.genres?.length ? `Genres: ${a.genres.join(", ")}` : "",
        a.styles?.length ? `Styles: ${a.styles.join(", ")}` : "",
        a.album_rating != null ? `Rating: ★${a.album_rating}/5` : "",
        a.condition ? `Condition: ${a.condition}` : "",
        a.purchase_price != null ? `Purchase price: $${a.purchase_price}` : "",
        a.library_identifier ? `Library ID: ${a.library_identifier}` : "",
        a.album_notes ? `Notes: ${a.album_notes}` : "",
      ].filter(Boolean).join("\n");

      const trackList = detail.tracks
        .map((t, i) => `${i + 1}. ${t.title}${t.bpm ? ` (${t.bpm} BPM)` : ""}${t.local_audio_url ? " ✓" : ""}`)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `${albumInfo}\n\nTracks (${detail.tracks.length}):\n${trackList}`,
        }],
      };
    }

    case "update_album": {
      await client.updateAlbum(args.release_id!, args.friend_id!, {
        album_rating: args.album_rating,
        album_notes: args.album_notes,
        purchase_price: args.purchase_price,
        condition: args.condition,
        library_identifier: args.library_identifier,
      });
      return { content: [{ type: "text", text: "✓ Album updated successfully!" }] };
    }

    case "download_album": {
      const result = await client.downloadAlbum(args.release_id!, args.friend_id!);
      return {
        content: [{
          type: "text",
          text: result.tracksQueued === 0
            ? "No tracks need downloading (all already have audio files)."
            : `✓ Queued ${result.tracksQueued} track(s) for download.`,
        }],
      };
    }

    case "list_playlists": {
      const playlists = await client.listPlaylists();

      if (!playlists || playlists.length === 0) {
        return { content: [{ type: "text", text: "No playlists found." }] };
      }

      return {
        content: [{
          type: "text",
          text: `Your playlists:\n\n${playlists.map((p) => `• ${p.name} (ID: ${p.id})`).join("\n")}`,
        }],
      };
    }

    case "get_playlist": {
      const { track_refs } = await client.getPlaylistTracks(args.playlist_id!);

      if (!track_refs || track_refs.length === 0) {
        return { content: [{ type: "text", text: "Playlist is empty." }] };
      }

      const tracks = await client.batchGetTracks(track_refs);
      const list = tracks
        .map((t, i) => `${i + 1}. ${t.title} - ${t.artist}${t.bpm ? ` (${t.bpm} BPM)` : ""}`)
        .join("\n");

      return {
        content: [{ type: "text", text: `Playlist tracks (${tracks.length} total):\n\n${list}` }],
      };
    }

    case "create_playlist": {
      await client.createPlaylist(args.name!, args.tracks ?? []);
      return {
        content: [{
          type: "text",
          text: `✓ Playlist "${args.name}" created!${args.tracks?.length ? ` Added ${args.tracks.length} tracks.` : ""}`,
        }],
      };
    }

    case "generate_ai_playlist": {
      const tracks = await client.generatePlaylist(args.playlist ?? []);
      const list = tracks
        .map((t, i) => `${i + 1}. ${t.title} - ${t.artist} (${t.bpm ?? "?"} BPM, ${t.key ?? "?"})`)
        .join("\n");

      return {
        content: [{ type: "text", text: `✓ AI-generated playlist (${tracks.length} tracks):\n\n${list}` }],
      };
    }

    case "get_playlist_tracks": {
      const { track_refs } = await client.getPlaylistTracks(args.playlist_id!);
      return {
        content: [{ type: "text", text: `Playlist track IDs:\n${track_refs.map((r) => r.track_id).join("\n")}` }],
      };
    }

    case "get_friends": {
      const friends = await client.getFriends();

      if (friends.length === 0) {
        return { content: [{ type: "text", text: "No friends added yet." }] };
      }

      return {
        content: [{
          type: "text",
          text: `Your friends:\n${friends.map((f) => `• ${f.username} (ID: ${f.id})`).join("\n")}`,
        }],
      };
    }

    case "add_friend": {
      await client.addFriend(args.username!);
      return { content: [{ type: "text", text: `✓ Added ${args.username} as a friend!` }] };
    }

    case "search_apple_music": {
      const result = await client.searchAppleMusic({
        title: args.title,
        artist: args.artist,
        album: args.album,
        isrc: args.isrc,
      });

      if (!result.results || result.results.length === 0) {
        return { content: [{ type: "text", text: "No results found on Apple Music." }] };
      }

      const list = (result.results as Array<Record<string, string>>)
        .slice(0, 5)
        .map((r) => `• ${r.trackName ?? r.title} - ${r.artistName ?? r.artist} (${r.collectionName ?? r.album})`)
        .join("\n");

      return { content: [{ type: "text", text: `Apple Music results:\n\n${list}` }] };
    }

    case "search_youtube": {
      const result = await client.searchYoutube({
        title: args.title,
        artist: args.artist,
      });

      if (!result.results || result.results.length === 0) {
        return { content: [{ type: "text", text: "No results found on YouTube." }] };
      }

      const list = (result.results as Array<Record<string, string>>)
        .slice(0, 5)
        .map((r) => `• ${r.title} - ${r.channel}`)
        .join("\n");

      return { content: [{ type: "text", text: `YouTube results:\n\n${list}` }] };
    }

    case "get_recommendations": {
      const result = await client.getRecommendationCandidates(
        args.track_id!,
        args.friend_id ?? DEFAULT_FRIEND_ID,
        { limit_identity: args.limit ?? 20, limit_audio: args.limit ?? 20 }
      );

      if (!result.candidates || result.candidates.length === 0) {
        return { content: [{ type: "text", text: "No recommendations found." }] };
      }

      const list = result.candidates
        .map((c) => {
          const identity = c.simIdentity != null ? ` id:${c.simIdentity.toFixed(3)}` : "";
          const audio = c.simAudio != null ? ` vibe:${c.simAudio.toFixed(3)}` : "";
          return `• ${c.trackId}  ${c.metadata.title} — ${c.metadata.artist}${c.metadata.bpm ? ` (${c.metadata.bpm} BPM)` : ""}${c.metadata.key ? `, ${c.metadata.key}` : ""}${identity}${audio}`;
        })
        .join("\n");

      const { stats } = result;
      return {
        content: [{
          type: "text",
          text: `Recommendations (${result.candidates.length} candidates, identity:${stats.identityCount} vibe:${stats.audioCount} union:${stats.unionCount}):\n\n${list}`,
        }],
      };
    }

    case "find_similar_identity": {
      const result = await client.findSimilarIdentity(
        args.track_id!,
        args.friend_id ?? DEFAULT_FRIEND_ID,
        { limit: args.limit, era: args.era, country: args.country, tags: args.tags }
      );

      if (!result.tracks || result.tracks.length === 0) {
        return { content: [{ type: "text", text: "No similar tracks found." }] };
      }

      const list = result.tracks
        .map((t) => `• ${t.title} — ${t.artist} (${t.album})${t.bpm ? ` BPM:${t.bpm}` : ""}${t.key ? `, ${t.key}` : ""} [dist: ${Number(t.distance).toFixed(4)}]`)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `Similar identity tracks (${result.count} found):\n\n${list}`,
        }],
      };
    }

    case "find_similar_vibe": {
      const result = await client.findSimilarVibe(
        args.track_id!,
        args.friend_id ?? DEFAULT_FRIEND_ID,
        { limit: args.limit }
      );

      if (!result.tracks || result.tracks.length === 0) {
        return { content: [{ type: "text", text: "No similar tracks found." }] };
      }

      const list = result.tracks
        .map((t) => `• ${t.title} — ${t.artist} (${t.album})${t.bpm ? ` BPM:${t.bpm}` : ""}${t.key ? `, ${t.key}` : ""}${t.danceability ? `, dance:${t.danceability}` : ""} [dist: ${Number(t.distance).toFixed(4)}]`)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `Similar vibe tracks (${result.count} found):\n\n${list}`,
        }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create and start server
const server = new Server(
  { name: "groovenet-dj", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await handleToolCall(
      request.params.name,
      (request.params.arguments ?? {}) as ToolArgs
    );
  } catch (error: unknown) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Groovenet MCP Server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
