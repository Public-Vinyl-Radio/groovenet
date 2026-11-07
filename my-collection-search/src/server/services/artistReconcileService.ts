import type { ArtistReconcileRequest, ArtistReconcileResponse } from "@groovenet/contracts";
import { importArtistCredits, type ImportArtistCredit } from "@/lib/artists/importCredits";
import { albumArtistBaseline, ArtistResolutionTally, ReviewQueue } from "@/lib/artists/reconcile";
import { artistImportRepository } from "@/server/repositories/artistImportRepository";
import { artistReconcileRepository } from "@/server/repositories/artistReconcileRepository";
import { discogsReleaseToAlbum } from "@/server/services/albumUpsertService";
import {
  extractTracksFromAlbum,
  getReleasePath,
  loadAlbum,
} from "@/server/services/discogsManifestService";

const MAX_ERRORS = 20;

type ReleaseCredits = { album: ImportArtistCredit[]; tracks: Map<string, ImportArtistCredit[]> };

/** Credits from the stored Discogs payload, the same ones an import would write. */
function releaseCredits(
  cache: Map<string, ReleaseCredits | null>,
  username: string,
  friendId: number,
  releaseId: string,
): ReleaseCredits | null {
  const key = `${friendId}:${releaseId}`;
  if (!cache.has(key)) {
    const path = getReleasePath(username, releaseId);
    const release = path ? loadAlbum(path) : null;
    cache.set(
      key,
      release
        ? {
            album: discogsReleaseToAlbum(release, friendId).artist_credits!,
            tracks: new Map(
              extractTracksFromAlbum(release, username).map((t) => [t.track_id, t.artist_credits!]),
            ),
          }
        : null,
    );
  }
  return cache.get(key)!;
}

/**
 * Links existing albums and tracks to artists (#705). Only rows with no
 * credits are touched, so a second run does no work. Credits come from the
 * Discogs payload where one is stored, else the artist string, never split.
 */
export async function reconcileArtists(
  request: ArtistReconcileRequest = {},
): Promise<ArtistReconcileResponse> {
  const dryRun = request.dry_run ?? false;
  const friendId = request.friend_id ?? null;
  const repo = artistReconcileRepository;

  const [albumArtists, albums, tracks, known] = await Promise.all([
    repo.listAlbumArtists(friendId),
    repo.listUncreditedAlbums(friendId),
    repo.listUncreditedTracks(friendId),
    repo.listKnownArtists(),
  ]);

  const review = new ReviewQueue();
  for (const row of await repo.countLegacyCredits("album_artists", friendId))
    review.add(row.credited_as, "album", row.count);
  for (const row of await repo.countLegacyCredits("track_artists", friendId))
    review.add(row.credited_as, "track", row.count);

  const tally = new ArtistResolutionTally(known);
  const credits = { discogs: 0, legacy: 0 };
  const releases = new Map<string, ReleaseCredits | null>();
  const plan = (list: ImportArtistCredit[], kind: "album" | "track") => {
    for (const credit of list) {
      credits[credit.source]++;
      tally.add(credit);
      if (credit.source === "legacy") review.add(credit.credited_as, kind);
    }
    return list;
  };

  const albumPlans = albums.map((album) => {
    const fromRelease = releaseCredits(releases, album.username, album.friend_id, album.release_id);
    const list = fromRelease?.album.length
      ? fromRelease.album
      : importArtistCredits(undefined, album.artist);
    return { album, credits: plan(list, "album") };
  });
  const trackPlans = tracks.map((track) => {
    const fromRelease = releaseCredits(releases, track.username, track.friend_id, track.release_id);
    const list = fromRelease?.tracks.get(track.track_id)?.length
      ? fromRelease.tracks.get(track.track_id)!
      : importArtistCredits(undefined, track.artist);
    return { track, credits: plan(list, "track") };
  });

  const result: ArtistReconcileResponse = {
    dry_run: dryRun,
    friend_id: friendId,
    baseline: albumArtistBaseline(albumArtists),
    albums: { pending: albums.length, linked: 0, failed: 0 },
    tracks: { pending: tracks.length, linked: 0, failed: 0 },
    credits,
    artists: tally.counts,
    review_queue: review.list(),
    errors: [],
  };
  if (dryRun) return result;

  const fail = (kind: "album" | "track", id: string, error: unknown) => {
    result[kind === "album" ? "albums" : "tracks"].failed++;
    if (result.errors.length < MAX_ERRORS)
      result.errors.push({
        kind,
        id,
        message: error instanceof Error ? error.message : String(error),
      });
  };
  for (const { album, credits: list } of albumPlans) {
    try {
      await artistImportRepository.importAlbumCredits(album.release_id, album.friend_id, list);
      result.albums.linked++;
    } catch (error) {
      fail("album", `${album.friend_id}:${album.release_id}`, error);
    }
  }
  for (const { track, credits: list } of trackPlans) {
    try {
      await artistImportRepository.importTrackCredits(track.track_id, track.friend_id, list);
      result.tracks.linked++;
    } catch (error) {
      fail("track", `${track.friend_id}:${track.track_id}`, error);
    }
  }
  return result;
}
