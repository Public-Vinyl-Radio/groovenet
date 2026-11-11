import { writeFile } from "node:fs/promises";
import type { Album, GroovenetClient, Playlist, Track } from "@groovenet/client";

export type EvalExportClient = Pick<
  GroovenetClient,
  "searchTracks" | "searchAlbums" | "listPlaylists" | "getTrackLyrics"
>;

export interface EvalExportOptions {
  /**
   * Also read each track's owner-only lyrics (#1170) for a local-model
   * summariser. Off by default: lyrics are copyrighted and private, so a
   * snapshot only carries them when asked.
   */
  lyrics?: boolean;
  /** Parallel lyrics requests; one per track. */
  concurrency?: number;
}

/** Only the fields used by the identity-text builder and the notes and file-genre experiments. */
export function evalTrack(track: Track) {
  return {
    track_id: track.track_id,
    friend_id: track.friend_id,
    release_id: track.release_id ?? null,
    title: track.title,
    artist: track.artist,
    album: track.album,
    year: track.year,
    composer: track.composer ?? null,
    audio_file_genre: track.audio_file_genre ?? null,
    genres: track.genres ?? null,
    styles: track.styles ?? null,
    local_tags: track.local_tags ?? null,
    notes: track.notes ?? null,
  };
}

export function evalAlbum(album: Album) {
  return {
    release_id: album.release_id,
    friend_id: album.friend_id,
    country: album.country ?? null,
    label: album.label ?? null,
    genres: album.genres ?? null,
    styles: album.styles ?? null,
  };
}

export function evalPlaylist(playlist: Playlist, friendId: number, trackKeys: Set<string>) {
  if (!Array.isArray(playlist.tracks)) throw new Error(`Playlist ${playlist.id} has no track list`);
  return {
    id: playlist.id,
    name: playlist.name,
    tracks: playlist.tracks
      .filter((ref) => ref.friend_id === friendId && trackKeys.has(ref.track_id))
      .map((ref) => ({ track_id: ref.track_id, friend_id: ref.friend_id, position: ref.position })),
  };
}

const PAGE_SIZE = 250;

/**
 * Lyrics text per track, or null for none. A server without the lyrics route
 * (#1176) answers every request with a 404, which the client also reads as
 * "no lyrics", so a run where no track has any is treated as a failure.
 */
export async function collectLyrics(
  client: Pick<EvalExportClient, "getTrackLyrics">,
  friendId: number,
  trackIds: string[],
  concurrency = 8,
): Promise<Map<string, string | null>> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error("Lyrics concurrency must be a positive integer");
  const lyrics = new Map<string, string | null>();
  let next = 0;
  const worker = async () => {
    while (next < trackIds.length) {
      const id = trackIds[next++];
      const result = await client.getTrackLyrics(id, friendId);
      lyrics.set(id, result?.text?.trim() ? result.text : null);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, trackIds.length) }, worker));
  if (trackIds.length && ![...lyrics.values()].some((text) => text !== null))
    throw new Error(
      "No track returned lyrics; check that the server has the lyrics endpoint (#1176)",
    );
  return lyrics;
}

/** Read-only API calls. The file is created only after every page has succeeded. */
export async function collectEmbeddingEvalSnapshot(
  client: EvalExportClient,
  friendId: number,
  options: EvalExportOptions = {},
) {
  if (!Number.isSafeInteger(friendId) || friendId < 1)
    throw new Error("--friend-id must be a positive integer");

  const tracks: ReturnType<typeof evalTrack>[] = [];
  let total = Infinity;
  while (tracks.length < total) {
    const page = await client.searchTracks({
      query: "",
      limit: PAGE_SIZE,
      offset: tracks.length,
      filters: { friend_id: friendId },
    });
    if (!Array.isArray(page.tracks) || !Number.isSafeInteger(page.estimatedTotalHits)) {
      throw new Error("Unexpected track search response; check API base URL and version");
    }
    if (!page.tracks.length && page.estimatedTotalHits > tracks.length)
      throw new Error("Track search returned an incomplete page");
    total = page.estimatedTotalHits;
    for (const track of page.tracks) {
      if (track.friend_id !== friendId)
        throw new Error("Track search returned another friend's track");
      tracks.push(evalTrack(track));
    }
  }
  if (tracks.length !== total) throw new Error("Track count changed during export; retry");
  const trackKeys = new Set(tracks.map((t) => t.track_id));
  if (trackKeys.size !== tracks.length) throw new Error("Duplicate tracks in export; retry");

  const albums: ReturnType<typeof evalAlbum>[] = [];
  total = Infinity;
  while (albums.length < total) {
    const page = await client.searchAlbums({
      friend_id: friendId,
      limit: PAGE_SIZE,
      offset: albums.length,
    });
    if (!Array.isArray(page.hits) || !Number.isSafeInteger(page.estimatedTotalHits)) {
      throw new Error("Unexpected album search response; check API base URL and version");
    }
    if (!page.hits.length && page.estimatedTotalHits > albums.length)
      throw new Error("Album search returned an incomplete page");
    total = page.estimatedTotalHits;
    for (const album of page.hits) {
      if (album.friend_id !== friendId)
        throw new Error("Album search returned another friend's album");
      albums.push(evalAlbum(album));
    }
  }
  if (albums.length !== total) throw new Error("Album count changed during export; retry");
  if (new Set(albums.map((a) => a.release_id)).size !== albums.length)
    throw new Error("Duplicate albums in export; retry");

  const playlistResponse = await client.listPlaylists();
  if (!Array.isArray(playlistResponse)) throw new Error("Unexpected playlist response");
  const playlists = playlistResponse
    .map((p) => evalPlaylist(p, friendId, trackKeys))
    .filter((p) => p.tracks.length > 0);

  const lyrics = options.lyrics
    ? await collectLyrics(
        client,
        friendId,
        tracks.map((t) => t.track_id),
        options.concurrency,
      )
    : null;

  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    friend_id: friendId,
    lyrics_included: lyrics !== null,
    tracks: lyrics ? tracks.map((t) => ({ ...t, lyrics: lyrics.get(t.track_id) ?? null })) : tracks,
    albums,
    playlists,
  };
}

export async function exportEmbeddingEvalSnapshot(
  client: EvalExportClient,
  friendId: number,
  output: string,
  options: EvalExportOptions = {},
) {
  const snapshot = await collectEmbeddingEvalSnapshot(client, friendId, options);
  // wx refuses overwrite; mode protects notes and lyrics on multi-user machines. Never print the data to stdout.
  await writeFile(output, JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return {
    tracks: snapshot.tracks.length,
    albums: snapshot.albums.length,
    playlists: snapshot.playlists.length,
    ...(snapshot.lyrics_included
      ? {
          with_lyrics: snapshot.tracks.filter((t) => "lyrics" in t && t.lyrics !== null).length,
        }
      : {}),
  };
}
