import { writeFile } from "node:fs/promises";
import type { Album, GroovenetClient, Playlist, Track } from "@groovenet/client";

export type EvalExportClient = Pick<GroovenetClient, "searchTracks" | "searchAlbums" | "listPlaylists">;

/** Only the fields used by the identity-text builder and the notes experiment. */
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

/** Read-only API calls. The file is created only after every page has succeeded. */
export async function collectEmbeddingEvalSnapshot(client: EvalExportClient, friendId: number) {
  if (!Number.isSafeInteger(friendId) || friendId < 1) throw new Error("--friend-id must be a positive integer");

  const tracks: ReturnType<typeof evalTrack>[] = [];
  let total = Infinity;
  while (tracks.length < total) {
    const page = await client.searchTracks({ query: "", limit: PAGE_SIZE, offset: tracks.length, filters: { friend_id: friendId } });
    if (!Array.isArray(page.tracks) || !Number.isSafeInteger(page.estimatedTotalHits)) {
      throw new Error("Unexpected track search response; check API base URL and version");
    }
    if (!page.tracks.length && page.estimatedTotalHits > tracks.length) throw new Error("Track search returned an incomplete page");
    total = page.estimatedTotalHits;
    for (const track of page.tracks) {
      if (track.friend_id !== friendId) throw new Error("Track search returned another friend's track");
      tracks.push(evalTrack(track));
    }
  }
  if (tracks.length !== total) throw new Error("Track count changed during export; retry");
  const trackKeys = new Set(tracks.map((t) => t.track_id));
  if (trackKeys.size !== tracks.length) throw new Error("Duplicate tracks in export; retry");

  const albums: ReturnType<typeof evalAlbum>[] = [];
  total = Infinity;
  while (albums.length < total) {
    const page = await client.searchAlbums({ friend_id: friendId, limit: PAGE_SIZE, offset: albums.length });
    if (!Array.isArray(page.hits) || !Number.isSafeInteger(page.estimatedTotalHits)) {
      throw new Error("Unexpected album search response; check API base URL and version");
    }
    if (!page.hits.length && page.estimatedTotalHits > albums.length) throw new Error("Album search returned an incomplete page");
    total = page.estimatedTotalHits;
    for (const album of page.hits) {
      if (album.friend_id !== friendId) throw new Error("Album search returned another friend's album");
      albums.push(evalAlbum(album));
    }
  }
  if (albums.length !== total) throw new Error("Album count changed during export; retry");
  if (new Set(albums.map((a) => a.release_id)).size !== albums.length) throw new Error("Duplicate albums in export; retry");

  const playlistResponse = await client.listPlaylists();
  if (!Array.isArray(playlistResponse)) throw new Error("Unexpected playlist response");
  const playlists = playlistResponse
    .map((p) => evalPlaylist(p, friendId, trackKeys))
    .filter((p) => p.tracks.length > 0);

  return { schema_version: 1, exported_at: new Date().toISOString(), friend_id: friendId, tracks, albums, playlists };
}

export async function exportEmbeddingEvalSnapshot(client: EvalExportClient, friendId: number, output: string) {
  const snapshot = await collectEmbeddingEvalSnapshot(client, friendId);
  // wx refuses overwrite; mode protects notes on multi-user machines. Never print the data to stdout.
  await writeFile(output, JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return { tracks: snapshot.tracks.length, albums: snapshot.albums.length, playlists: snapshot.playlists.length };
}
