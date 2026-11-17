import type { Pool, PoolClient } from "pg";
import { withDbTransaction } from "@/lib/serverDb";
import type { DiscogsRelease } from "@groovenet/contracts";
import type { Album } from "@/types/track";
import { albumRepository, type AlbumUpsertInput } from "@/server/repositories/albumRepository";
import { friendRepository } from "@/server/repositories/friendRepository";

import {
  artistNames,
  importArtistCredits,
  type ImportArtistCredit,
} from "@/lib/artists/importCredits";
import { artistImportRepository } from "@/server/repositories/artistImportRepository";

type Queryable = Pick<PoolClient, "query">;

export type AlbumToUpsert = AlbumUpsertInput & { artist_credits?: ImportArtistCredit[] };

/**
 * Get or create friend_id for a username
 */
async function getFriendId(username: string): Promise<number> {
  return friendRepository.ensureIdByUsername(username);
}

/**
 * Convert a Discogs release to an AlbumToUpsert object
 */
export function discogsReleaseToAlbum(release: DiscogsRelease, friendId: number): AlbumToUpsert {
  const artist = artistNames(
    release.artists_sort || release.artists?.[0]?.name || "Unknown Artist",
  ).name;

  return {
    release_id: String(release.id),
    friend_id: friendId,
    title: release.title,
    artist,
    artist_credits: importArtistCredits(release.artists, artist),
    year: release.year?.toString(),
    genres: release.genres || [],
    styles: release.styles || [],
    album_thumbnail: release.thumb ?? undefined,
    discogs_url: release.uri ?? undefined,
    date_added: release.date_added,
    date_changed: release.date_changed,
    track_count: release.tracklist?.length || 0,
    label: release.labels?.[0]?.name ?? undefined,
    catalog_number: release.labels?.[0]?.catno,
    country: release.country,
    format: Array.isArray(release.formats) ? (release.formats?.[0]?.name ?? undefined) : undefined,
  };
}

/**
 * Upsert a single album to PostgreSQL. `db` must be the caller's transaction
 * client: the credit import runs on it too, never on a second connection (#1223).
 */
export async function upsertAlbum(
  db: PoolClient,
  album: AlbumToUpsert,
  options?: { preserveManualFields?: boolean; preserveSourceTaxonomy?: boolean },
): Promise<Album> {
  const row = await albumRepository.upsertAlbumRecord(db, album, options);
  await artistImportRepository.importAlbumCredits(
    album.release_id,
    album.friend_id,
    album.artist_credits ?? importArtistCredits(undefined, album.artist),
    db,
  );
  return row;
}

/**
 * Upsert multiple albums to PostgreSQL. Given a pool, each album gets its own
 * transaction (row and credits commit together); given a client, it is used as is.
 */
export async function upsertAlbums(
  db: Queryable | Pool,
  albums: AlbumToUpsert[],
  options?: { preserveManualFields?: boolean; preserveSourceTaxonomy?: boolean },
): Promise<Album[]> {
  const upsertedAlbums: Album[] = [];

  for (const album of albums) {
    try {
      const upserted =
        typeof (db as Pool).connect === "function"
          ? await withDbTransaction((client) => upsertAlbum(client, album, options))
          : await upsertAlbum(db as PoolClient, album, options);
      upsertedAlbums.push(upserted);
    } catch (error) {
      console.error(
        `Error upserting album ${album.release_id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return upsertedAlbums;
}

/**
 * Get all albums from manifest files and convert to AlbumToUpsert format
 */
export async function getAllAlbumsFromManifests(): Promise<AlbumToUpsert[]> {
  const { getManifestFiles, parseManifestFile, getReleasePath, loadAlbum } =
    await import("@/server/services/discogsManifestService");

  const manifestFiles = getManifestFiles();
  const albums: AlbumToUpsert[] = [];

  for (const manifestFile of manifestFiles) {
    const { manifest, username } = parseManifestFile(manifestFile);
    const friendId = await getFriendId(username);
    const releaseIds: string[] = (manifest.releaseIds || []).map((id: unknown) => String(id));

    for (const releaseId of releaseIds) {
      const releasePath = getReleasePath(username, releaseId);
      if (!releasePath) continue;

      const release = loadAlbum(releasePath);
      if (!release) continue;

      albums.push(discogsReleaseToAlbum(release, friendId));
    }
  }

  return albums;
}

export async function getAlbumsFromManifestReleases(
  username: string,
  releaseIds: string[],
): Promise<AlbumToUpsert[]> {
  const { getReleasePath, loadAlbum } = await import("@/server/services/discogsManifestService");

  const friendId = await getFriendId(username);
  const albums: AlbumToUpsert[] = [];

  for (const releaseId of releaseIds) {
    const releasePath = getReleasePath(username, String(releaseId));
    if (!releasePath) continue;

    const release = loadAlbum(releasePath);
    if (!release) continue;

    albums.push(discogsReleaseToAlbum(release, friendId));
  }

  return albums;
}
