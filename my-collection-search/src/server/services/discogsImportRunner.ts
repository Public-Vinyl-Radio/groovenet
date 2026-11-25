/**
 * One Discogs import of one collection: list it, repair and clean up what is
 * already imported, fetch the new releases (~1.2 s apart for Discogs' rate
 * limit), checkpoint them into the manifest and ingest them a batch at a time.
 *
 * This was the body of the streaming `GET /api/discogs` until #1274 made the
 * import a background job (`discogsImportWorker`). It reports through a
 * `DiscogsImportReporter`: `send` writes the progress text the route has
 * always streamed (the worker keeps it in `discogs_import_log`), `progress`
 * the structured counters the UI reads. A rerun resumes: releases in the
 * manifest are skipped and ones already on disk are ingested without a fetch.
 */
import fs from "fs";
import { analytics } from "@/lib/analytics/server";
import { dbPool } from "@/lib/serverDb";
import type { DiscogsImportProgress } from "@/server/repositories/discogsImportRepository";
import { getCollectionPage, getReleaseDetails } from "@/server/services/discogsApiClient";
import { cleanupDiscogsReleases } from "@/server/services/discogsCleanupService";
import { repairDiscogsCollectionFields } from "@/server/services/discogsCollectionRepairService";
import {
  createExportsDir,
  deleteRelease,
  getManifestPath,
  getManifestReleaseIds,
  getReleaseWritePath,
  getTracksFromManifestReleases,
  hasDownloadedRelease,
  saveManifest,
} from "@/server/services/discogsManifestService";
import type { TrackUpsertFailure } from "@/server/services/trackUpsertService";

/**
 * New releases are fetched, checkpointed into the manifest and ingested this
 * many at a time, so an interrupted sync keeps everything before its last
 * batch (#1182).
 */
export const RELEASE_BATCH_SIZE = 25;
/** The wait between release fetches, for Discogs' rate limit. */
export const RELEASE_DELAY_MS = 1200;

export type DiscogsImportReporter = {
  /** Progress text, as `GET /api/discogs` streams it. */
  send(text: string): void;
  progress(progress: DiscogsImportProgress): void;
  /** Throws when the import must stop now (the worker lost its lease). Called between releases. */
  ensureActive(): void;
};

export type DiscogsImportOutcome = {
  added: number;
  removed: number;
  failedReleases: { releaseId: string; error: string }[];
  trackFailures: number;
  /** Set when a batch's ingest threw: what it said. */
  ingestError: string | null;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runDiscogsImport(
  username: string,
  reporter: DiscogsImportReporter,
  options: { releaseDelayMs?: number } = {},
): Promise<DiscogsImportOutcome> {
  const { send, progress, ensureActive } = reporter;
  const releaseDelayMs = options.releaseDelayMs ?? RELEASE_DELAY_MS;
  const syncStartedAt = Date.now();
  // Set once the collection is listed: writes the manifest as it stands now.
  // Called after every batch and, if anything is unsaved, in `finally`.
  let checkpoint: (() => void) | null = null;
  let unsaved = false;
  try {
    createExportsDir();

    let page = 1;
    const perPage = 100;
    const allIds: string[] = [];
    const newReleases: string[] = [];
    const errors: { releaseId: string; error: string }[] = [];
    const trackErrors: TrackUpsertFailure[] = [];
    let ingestError: string | null = null;
    const dateAddedMap: Map<string, string> = new Map(); // Store date_added from collection

    // Use a manifest per username
    const manifestIds = getManifestReleaseIds(username);
    console.log(`[Discogs Sync] Loaded manifest IDs for ${username}:`, manifestIds.length);
    send(`Loaded manifest IDs for ${username}: ${manifestIds.length}\n\n`);
    progress({ phase: "listing" });

    analytics.track("discogs_sync_started", { manifest_ids_count: manifestIds.length });

    // Step 1: Collect all collection release IDs
    while (true) {
      ensureActive();
      console.log(`[Discogs Sync] Fetching collection page ${page} for user ${username}...`);
      send(`Fetching collection page ${page} for user ${username}:\n\n`);
      const collectionPage = await getCollectionPage(username, page, perPage);
      const releases = collectionPage.releases || [];
      console.log(`[Discogs Sync] Page ${page} - releases found: ${releases.length}`);
      send(`data:  Page ${page} - releases found: ${releases.length}:\n\n`);
      if (releases.length === 0) break;

      for (const release of releases) {
        const releaseId = String(release.basic_information.id);
        allIds.push(releaseId);

        // Capture date_added from collection response. A release can be
        // in the collection more than once; the album is the first copy.
        const seen = dateAddedMap.get(releaseId);
        if (release.date_added && (!seen || Date.parse(release.date_added) < Date.parse(seen))) {
          dateAddedMap.set(releaseId, release.date_added);
        }

        send(`Found release ID: ${releaseId}\n\n`);
      }
      progress({ found: allIds.length });

      if (collectionPage.pagination.page < collectionPage.pagination.pages) {
        page += 1;
      } else {
        break;
      }
    }

    // Step 2: Determine new IDs not in manifest. One whose file an
    // interrupted sync already wrote is resumed from disk, not fetched.
    const manifestSet = new Set(manifestIds);
    const newIds = allIds.filter((id) => !manifestSet.has(id));
    const onDisk = new Set(newIds.filter((id) => hasDownloadedRelease(username, id)));
    const toFetchCount = newIds.length - onDisk.size;
    if (onDisk.size > 0) {
      console.log(`[Discogs Sync] New IDs already on disk: ${onDisk.size}`);
      send(`Resuming ${onDisk.size} new releases already on disk\n\n`);
    }
    console.log(`[Discogs Sync] New IDs to fetch: ${toFetchCount}`);
    send(`New IDs to fetch: ${toFetchCount}\n\n`);
    let fetched = 0;
    progress({ phase: "fetching", total: toFetchCount, fetched });

    // Step 2.25: Repair releases already imported from what the listing
    // just returned — no release fetches, so no rate-limit wait (#847).
    const newIdSet = new Set(newIds);
    try {
      const repaired = await repairDiscogsCollectionFields(
        username,
        allIds.filter((id) => !newIdSet.has(id)),
        dateAddedMap,
      );
      send(
        `Repaired ${repaired.albums.length} albums and ${repaired.tracks} tracks from collection dates\n\n`,
      );
    } catch (repairError) {
      send(`⚠️  Collection date repair error: ${message(repairError)}\n\n`);
      console.error("[Discogs Sync] Repair error:", repairError);
    }

    // Step 2.5: Detect and delete removed IDs (in manifest but not in current collection)
    const allIdSet = new Set(allIds);
    const removedIds = manifestIds.filter((id) => !allIdSet.has(id));
    const removedSet = new Set(removedIds);
    const keptIds = manifestIds.filter((id) => !removedSet.has(id));
    const manifestPath = getManifestPath(username);
    const manifestIdsNow = () => [...keptIds, ...newReleases];
    checkpoint = () => {
      saveManifest(manifestPath, manifestIdsNow());
      unsaved = false;
    };
    unsaved = removedIds.length > 0;
    if (removedIds.length > 0) {
      console.log(`[Discogs Sync] Removed IDs detected: ${removedIds.length}`);
      send(`⚠️  Detected ${removedIds.length} releases removed from Discogs collection\n\n`);

      // Delete local files first, then clean DB in one shared service
      try {
        let deletedFiles = 0;
        for (const releaseId of removedIds) {
          if (deleteRelease(username, releaseId)) {
            deletedFiles += 1;
          }
          if (deletedFiles > 0 && deletedFiles % 10 === 0) {
            send(`Deleted local files ${deletedFiles}/${removedIds.length}...\n\n`);
          }
        }

        const cleanup = await cleanupDiscogsReleases(username, removedIds);
        if (!cleanup.friendId) {
          send(`⚠️  Could not find friend_id for ${username}, skipped DB/search deletion\n\n`);
        } else {
          send(
            `✅ Deleted ${cleanup.deletedTracksCount} tracks and ${cleanup.deletedAlbumsCount} albums for removed releases\n\n`,
          );
        }
        progress({ removed: removedIds.length });
      } catch (deleteError) {
        send(`⚠️  Error deleting releases: ${message(deleteError)}\n\n`);
        console.error("[Discogs Sync] Delete error:", deleteError);
      }
    } else {
      send(`No releases removed from collection\n\n`);
    }

    // Fetch the batch's releases that aren't on disk yet; returns every
    // release in the batch that is now downloaded.
    const downloadBatch = async (batch: string[]) => {
      const downloaded: string[] = [];
      for (const releaseId of batch) {
        ensureActive();
        if (onDisk.has(releaseId)) {
          send(`Already downloaded release ID: ${releaseId}\n\n`);
          downloaded.push(releaseId);
          newReleases.push(releaseId);
          unsaved = true;
          continue;
        }

        send(`Fetching details for release ID: ${releaseId}\n\n`);
        try {
          const details = await getReleaseDetails(releaseId);

          // Merge collection date_added if available
          const collectionDateAdded = dateAddedMap.get(releaseId);
          if (collectionDateAdded) {
            details.date_added = collectionDateAdded;
          }

          const filePath = getReleaseWritePath(username, releaseId);
          fs.writeFileSync(filePath, JSON.stringify(details, null, 2));
          downloaded.push(releaseId);
          newReleases.push(releaseId);
          unsaved = true;
          send(`Saved release ID: ${releaseId}\n\n`);
        } catch (e) {
          const errorMessage = message(e);
          errors.push({ releaseId, error: errorMessage });
          console.log(`[Discogs Sync] Error for release ID ${releaseId}: ${errorMessage}`);
          send(`Error for release ID ${releaseId}: ${errorMessage}\n\n`);
        }
        fetched += 1;
        progress({ fetched, failed_releases: errors.length });

        // Wait to avoid hitting rate limits
        await new Promise((r) => setTimeout(r, releaseDelayMs));
      }
      return downloaded;
    };

    // Upsert one batch's tracks and albums, then queue its embeddings.
    const ingestBatch = async (releaseIds: string[]) => {
      try {
        const { upsertTracks } = await import("@/server/services/trackUpsertService");

        send(`Loading tracks from new releases...\n\n`);
        const batchTracks = getTracksFromManifestReleases(username, releaseIds);
        send(`Loaded ${batchTracks.length} tracks\n\n`);

        send(`Upserting tracks to Postgres...\n\n`);
        const { upserted, errors: upsertErrors } = await upsertTracks(batchTracks);
        trackErrors.push(...upsertErrors);
        console.log(`[Discogs Sync] Upserted ${upserted.length} tracks`);
        send(`Upserted ${upserted.length} tracks to Postgres\n\n`);

        const failuresByRelease = new Map<string, TrackUpsertFailure[]>();
        for (const failure of upsertErrors) {
          const releaseId = failure.releaseId ?? "unknown";
          const failures = failuresByRelease.get(releaseId) ?? [];
          failures.push(failure);
          failuresByRelease.set(releaseId, failures);
        }
        for (const [releaseId, failures] of failuresByRelease) {
          send(`Release ${releaseId} fetched with track upsert failures (${failures.length}):\n`);
          for (const failure of failures) {
            send(`  - Track ${failure.trackId}@${failure.username}: ${failure.error}\n`);
          }
          send("\n");
        }

        // Ingest albums
        send(`\n--- Ingesting Albums ---\n\n`);

        try {
          const { getAlbumsFromManifestReleases, upsertAlbums } =
            await import("@/server/services/albumUpsertService");

          send(`Loading albums from new releases...\n`);
          const batchAlbums = await getAlbumsFromManifestReleases(username, releaseIds);
          send(`Loaded ${batchAlbums.length} albums\n\n`);

          send(`Upserting albums to Postgres...\n`);
          const upsertedAlbums = await upsertAlbums(dbPool, batchAlbums, {
            preserveManualFields: true,
          });
          console.log(`[Discogs Sync] Upserted ${upsertedAlbums.length} albums`);
          send(`Upserted ${upsertedAlbums.length} albums to Postgres\n\n`);

          send(`✅ Album ingest complete!\n\n`);
        } catch (albumError) {
          send(`⚠️  Album ingest error: ${message(albumError)}\n\n`);
          console.error("[Album Ingest Error]", albumError);
          // Continue even if album ingest fails
        }

        // Embeddings. Identity embeddings read album metadata, so they
        // run after the album upsert, never at track upsert. Enqueued,
        // not generated here (#385) — a provider outage no longer makes a
        // sync wait on OpenAI; check About → status for embedding health
        // instead of a per-sync error line.
        try {
          const { syncIdentityEmbeddings } =
            await import("@/server/services/trackEmbeddingSyncService");
          const embedded = await syncIdentityEmbeddings(upserted);
          send(`Embeddings: ${embedded.queued} queued for background generation\n\n`);
        } catch (embeddingError) {
          console.error("[Embedding Sync Error]", embeddingError);
          send(`⚠️  Failed to queue embeddings: ${message(embeddingError)}\n\n`);
        }
      } catch (e) {
        ingestError = message(e);
        send(`\n❌ Auto-ingest error: ${ingestError}\n\n`);
        console.error("[Auto-ingest Error]", e);
      }
    };

    // Step 3: Fetch, checkpoint and ingest new IDs a batch at a time.
    // The last batch is ingested after the summary, under the
    // "Starting Auto-Ingest" heading the progress reader waits for.
    const batches: string[][] = [];
    for (let i = 0; i < newIds.length; i += RELEASE_BATCH_SIZE) {
      batches.push(newIds.slice(i, i + RELEASE_BATCH_SIZE));
    }
    let lastBatch: string[] = [];
    for (const [index, batch] of batches.entries()) {
      const downloaded = await downloadBatch(batch);
      checkpoint();
      progress({ added: newReleases.length });
      console.log(
        `[Discogs Sync] Checkpoint ${index + 1}/${batches.length}: manifest has ${manifestIdsNow().length} IDs`,
      );
      if (index === batches.length - 1) {
        lastBatch = downloaded;
      } else if (downloaded.length > 0) {
        send(`\n--- Ingesting batch ${index + 1} of ${batches.length} ---\n\n`);
        await ingestBatch(downloaded);
      }
    }

    // Step 4: Save the manifest (removed IDs out, only downloaded new
    // releases in) and summarise.
    checkpoint();
    const updatedManifestIds = manifestIdsNow();
    console.log(
      `[Discogs Sync] Manifest updated for ${username}. Total IDs: ${updatedManifestIds.length} (removed: ${removedIds.length}, added: ${newReleases.length})`,
    );
    send(
      `Manifest updated for ${username}. Total IDs: ${updatedManifestIds.length} (added: ${newReleases.length}, failed: ${errors.length})\n\n`,
    );

    // Report failed downloads
    if (errors.length > 0) {
      send(`\n⚠️  ${errors.length} releases failed to download and were NOT added to manifest:\n`);
      for (const error of errors) {
        send(`  - Release ${error.releaseId}: ${error.error}\n`);
      }
      send("\n");
    }

    send(`Sync complete for ${username}. New releases downloaded: ${newReleases.length}\n\n`);

    // Step 5: Auto-ingest the last batch into Postgres
    if (newReleases.length > 0) {
      progress({ phase: "ingesting" });
      send(`\n--- Starting Auto-Ingest ---\n\n`);
      if (lastBatch.length > 0) await ingestBatch(lastBatch);
      if (!ingestError) {
        send(
          trackErrors.length > 0
            ? `\nAuto-ingest incomplete. Track upsert failures: ${trackErrors.length}.\n\n`
            : `\n✅ Auto-ingest complete!\n\n`,
        );
      }
    } else {
      send(`\nNo new releases to ingest. Skipping auto-ingest.\n\n`);
    }

    analytics.track("discogs_sync_completed", {
      new_releases: newReleases.length,
      removed_releases: removedIds.length,
      error_count: errors.length + trackErrors.length,
      duration_ms: Date.now() - syncStartedAt,
    });

    console.log(`[Discogs Sync] All operations complete for ${username}`);
    send(
      trackErrors.length > 0
        ? `\nAll operations complete with track upsert failures. Failed tracks: ${trackErrors.length}; affected releases: ${new Set(trackErrors.map((error) => error.releaseId)).size}.\n\n`
        : `\n🎉 All operations complete!\n\n`,
    );
    return {
      added: newReleases.length,
      removed: removedIds.length,
      failedReleases: errors,
      trackFailures: trackErrors.length,
      ingestError,
    };
  } finally {
    // Keep whatever this run downloaded, however it ended.
    if (checkpoint && unsaved) {
      try {
        checkpoint();
        console.log(`[Discogs Sync] Manifest saved for ${username} after an early exit`);
      } catch (saveError) {
        console.error("[Discogs Sync] Could not save manifest:", saveError);
      }
    }
  }
}
