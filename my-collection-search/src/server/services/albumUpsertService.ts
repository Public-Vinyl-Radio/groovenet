import type { PoolClient } from "pg";
import type { Album, DiscogsRelease } from "@/types/track";
import { albumRepository, type AlbumUpsertInput } from "@/server/repositories/albumRepository";
import { friendRepository } from "@/server/repositories/friendRepository";

type Queryable = Pick<PoolClient, "query">;

export type AlbumToUpsert = AlbumUpsertInput;

/**
 * Get or create friend_id for a username
 */
async function getFriendId(username: string): Promise<number> {
  return friendRepository.ensureIdByUsername(username);
}

/**
 * Convert a Discogs release to an AlbumToUpsert object
 */
function stripDiscogsNumbering(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, "").trim();
}

export function discogsReleaseToAlbum(release: DiscogsRelease, friendId: number): AlbumToUpsert {
  const artist = stripDiscogsNumbering(
    release.artists_sort || release.artists?.[0]?.name || "Unknown Artist",
  );

  return {
    release_id: String(release.id),
    friend_id: friendId,
    title: release.title,
    artist,
    year: release.year?.toString(),
    genres: release.genres || [],
    styles: release.styles || [],
    album_thumbnail: release.thumb,
    discogs_url: release.uri,
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
 * Upsert a single album to PostgreSQL
 */
export async function upsertAlbum(
  db: Queryable,
  album: AlbumToUpsert,
  options?: { preserveManualFields?: boolean; preserveSourceTaxonomy?: boolean },
): Promise<Album> {
  return albumRepository.upsertAlbumRecord(db, album, options);
}

/**
 * Upsert multiple albums to PostgreSQL
 */
export async function upsertAlbums(
  db: Queryable,
  albums: AlbumToUpsert[],
  options?: { preserveManualFields?: boolean; preserveSourceTaxonomy?: boolean },
): Promise<Album[]> {
  const upsertedAlbums: Album[] = [];

  for (const album of albums) {
    try {
      const upserted = await upsertAlbum(db, album, options);
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
