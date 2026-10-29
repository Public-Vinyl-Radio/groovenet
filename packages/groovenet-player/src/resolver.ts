import type { GroovenetClient, Track } from "@groovenet/client";
import type { PlaybackSource } from "./types.js";
import { posix } from "node:path";
import { pathToFileURL } from "node:url";
import { PlayerError } from "./types.js";

export interface ResolverConfig {
  apiBase: string;
  apiKey?: string;
  /** Engine-side read-only library root; selects indexed file delivery. */
  audioLibraryRoot?: string;
}

/** Resolve downloaded audio through the app, or an explicit engine-side library. */
export function audioSource(track: Track, config: ResolverConfig): PlaybackSource | null {
  const filename = track.local_audio_url?.trim();
  if (!filename) return null;
  if (config.audioLibraryRoot !== undefined) {
    if (!posix.isAbsolute(config.audioLibraryRoot))
      throw new PlayerError(
        "INVALID_ARGUMENT",
        "OwnTone library root must be an absolute Linux path",
      );
    let relative = filename;
    if (/^https?:\/\//.test(relative)) {
      try {
        const legacy = new URL(relative);
        relative =
          legacy.searchParams.get("filename") ??
          posix.basename(decodeURIComponent(legacy.pathname));
      } catch {
        return null;
      }
    } else {
      try {
        relative = decodeURIComponent(relative);
      } catch {
        return null;
      }
    }
    relative = relative.replace(/^\/+/, "").replace(/^(?:app\/)?audio\//, "");
    if (
      !relative ||
      relative.includes("\\") ||
      relative.includes("\0") ||
      relative.split("/").some((part) => !part || part === "." || part === "..")
    )
      return null;
    return { url: pathToFileURL(posix.join(config.audioLibraryRoot, relative)).toString() };
  }
  const base = config.apiBase.endsWith("/") ? config.apiBase : `${config.apiBase}/`;
  const url = new URL("audio", base);
  url.searchParams.set("filename", filename);
  return {
    url: url.toString(),
    ...(config.apiKey ? { headers: { Authorization: `Bearer ${config.apiKey}` } } : {}),
  };
}

export class TrackResolver {
  constructor(
    private readonly client: GroovenetClient,
    private readonly config: ResolverConfig,
  ) {}

  async search(query: string, limit = 50): Promise<Track[]> {
    const result = await this.client.searchTracks({ query, limit });
    return result.tracks;
  }

  async playlist(playlistId: number | string): Promise<Track[]> {
    const { track_refs } = await this.client.getPlaylistTracks(playlistId);
    const refs = track_refs.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (!refs.length) return [];
    const tracks = await this.client.batchGetTracks(refs);
    const byRef = new Map(tracks.map((track) => [`${track.friend_id}:${track.track_id}`, track]));
    return refs.flatMap((ref) => {
      const track = byRef.get(`${ref.friend_id}:${ref.track_id}`);
      return track ? [track] : [];
    });
  }

  source(track: Track): PlaybackSource | null {
    return audioSource(track, this.config);
  }
}
