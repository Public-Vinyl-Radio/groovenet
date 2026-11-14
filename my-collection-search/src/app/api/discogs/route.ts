// pages/api/discogs/sync.js
// Next.js API route to sync Discogs collection, only downloading new releases

import {
  saveManifest,
  getReleaseWritePath,
  createExportsDir,
  getManifestReleaseIds,
  getManifestPath,
  hasDownloadedRelease,
} from "@/server/services/discogsManifestService";
import fs from "fs";
import { NextRequest } from "next/server";
import { getCollectionPage, getReleaseDetails } from "@/server/services/discogsApiClient";
import { analytics } from "@/lib/analytics/server";
import { dbPool } from "@/lib/serverDb";
import { cleanupDiscogsReleases } from "@/server/services/discogsCleanupService";
import { repairDiscogsCollectionFields } from "@/server/services/discogsCollectionRepairService";
import type { TrackUpsertFailure } from "@/server/services/trackUpsertService";

/**
 * New releases are fetched, checkpointed into the manifest and ingested this
 * many at a time, so an interrupted sync keeps everything before its last
 * batch (#1182).
 */
const RELEASE_BATCH_SIZE = 25;

const DISCOGS_USER_TOKEN = process.env.DISCOGS_USER_TOKEN;
// Username can be passed as a param or defaults to env
function getUsernameFromRequest(request: NextRequest) {
  const url = new URL(request.url);
  const params = url.searchParams;
  return params.get("username") || process.env.DISCOGS_USERNAME;
}

export async function GET(request: NextRequest) {
  const username = getUsernameFromRequest(request);
  if (!DISCOGS_USER_TOKEN || !username) {
    return new Response(JSON.stringify({ error: "Discogs credentials not set in environment" }), {
      status: 500,
    });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // False once the client has gone or the stream is closed: the sync
      // carries on and only stops reporting (#1182). Progress still reaches
      // the log. A write to a cancelled or errored stream throws, which is how
      // a disconnect is noticed.
      let streamOpen = true;
      const write = (action: () => void) => {
        if (!streamOpen) return;
        try {
          action();
        } catch {
          streamOpen = false;
          console.log(`[Discogs Sync] Client disconnected; sync for ${username} continues`);
        }
      };
      const send = (text: string) => write(() => controller.enqueue(encoder.encode(text)));
      const close = () => {
        write(() => controller.close());
        streamOpen = false;
      };

      const syncStartedAt = Date.now();
      // Set once the collection is listed: writes the manifest as it stands
      // now. Called after every batch and, if anything is unsaved, in `finally`.
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
        let ingestFailed = false;
        const dateAddedMap: Map<string, string> = new Map(); // Store date_added from collection

        // Use a manifest per username
        const manifestIds = getManifestReleaseIds(username);
        console.log(`[Discogs Sync] Loaded manifest IDs for ${username}:`, manifestIds.length);
        send(`Loaded manifest IDs for ${username}: ${manifestIds.length}\n\n`);

        analytics.track(
          "discogs_sync_started",
          { manifest_ids_count: manifestIds.length },
          { request },
        );

        // Step 1: Collect all collection release IDs
        while (true) {
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
            if (
              release.date_added &&
              (!seen || Date.parse(release.date_added) < Date.parse(seen))
            ) {
              dateAddedMap.set(releaseId, release.date_added);
            }

            console.log(`[Discogs Sync] Found release ID: ${releaseId}`);
            send(`Found release ID: ${releaseId}\n\n`);
          }

          if (collectionPage.pagination.page < collectionPage.pagination.pages) {
            page += 1;
          } else {
            break;
          }
        }

        // Step 2: Determine new IDs not in manifest. One whose file an
        // interrupted sync already wrote is resumed from disk, not fetched.
        const newIds = allIds.filter((id) => !manifestIds.includes(id));
        const onDisk = new Set(newIds.filter((id) => hasDownloadedRelease(username, id)));
        const toFetchCount = newIds.length - onDisk.size;
        if (onDisk.size > 0) {
          console.log(`[Discogs Sync] New IDs already on disk: ${onDisk.size}`);
          send(`Resuming ${onDisk.size} new releases already on disk\n\n`);
        }
        console.log(`[Discogs Sync] New IDs to fetch: ${toFetchCount}`);
        send(`New IDs to fetch: ${toFetchCount}\n\n`);

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
          const errorMessage =
            repairError instanceof Error ? repairError.message : String(repairError);
          send(`⚠️  Collection date repair error: ${errorMessage}\n\n`);
          console.error("[Discogs Sync] Repair error:", repairError);
        }

        // Step 2.5: Detect and delete removed IDs (in manifest but not in current collection)
        const removedIds = manifestIds.filter((id) => !allIds.includes(id));
        const keptIds = manifestIds.filter((id) => !removedIds.includes(id));
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
            const { deleteRelease } = await import("@/server/services/discogsManifestService");

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
          } catch (deleteError) {
            const errorMessage =
              deleteError instanceof Error ? deleteError.message : String(deleteError);
            send(`⚠️  Error deleting releases: ${errorMessage}\n\n`);
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
            if (onDisk.has(releaseId)) {
              console.log(`[Discogs Sync] Already downloaded release ID: ${releaseId}`);
              send(`Already downloaded release ID: ${releaseId}\n\n`);
              downloaded.push(releaseId);
              newReleases.push(releaseId);
              unsaved = true;
              continue;
            }

            console.log(`[Discogs Sync] Fetching details for release ID: ${releaseId}`);
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
              console.log(`[Discogs Sync] Saved release ID: ${releaseId}`);
            } catch (e) {
              const errorMessage = e instanceof Error ? e.message : String(e);
              errors.push({ releaseId, error: errorMessage });
              console.log(`[Discogs Sync] Error for release ID ${releaseId}: ${errorMessage}`);
              send(`Error for release ID ${releaseId}: ${errorMessage}\n\n`);
            }

            // Wait to avoid hitting rate limits
            await new Promise((r) => setTimeout(r, 1200));
          }
          return downloaded;
        };

        // Upsert one batch's tracks and albums, then queue its embeddings.
        const ingestBatch = async (releaseIds: string[]) => {
          try {
            const { getTracksFromManifestReleases } =
              await import("@/server/services/discogsManifestService");
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
              send(
                `Release ${releaseId} fetched with track upsert failures (${failures.length}):\n`,
              );
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
              const errorMessage =
                albumError instanceof Error ? albumError.message : String(albumError);
              send(`⚠️  Album ingest error: ${errorMessage}\n\n`);
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
              send(
                `⚠️  Failed to queue embeddings: ${
                  embeddingError instanceof Error ? embeddingError.message : String(embeddingError)
                }\n\n`,
              );
            }
          } catch (e) {
            ingestFailed = true;
            const errorMessage = e instanceof Error ? e.message : String(e);
            send(`\n❌ Auto-ingest error: ${errorMessage}\n\n`);
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
          send(
            `\n⚠️  ${errors.length} releases failed to download and were NOT added to manifest:\n`,
          );
          for (const error of errors) {
            send(`  - Release ${error.releaseId}: ${error.error}\n`);
          }
          send("\n");
        }

        send(`Sync complete for ${username}. New releases downloaded: ${newReleases.length}\n\n`);

        // Step 5: Auto-ingest the last batch into Postgres
        if (newReleases.length > 0) {
          send(`\n--- Starting Auto-Ingest ---\n\n`);
          if (lastBatch.length > 0) await ingestBatch(lastBatch);
          if (!ingestFailed) {
            send(
              trackErrors.length > 0
                ? `\nAuto-ingest incomplete. Track upsert failures: ${trackErrors.length}.\n\n`
                : `\n✅ Auto-ingest complete!\n\n`,
            );
          }
        } else {
          send(`\nNo new releases to ingest. Skipping auto-ingest.\n\n`);
        }

        analytics.track(
          "discogs_sync_completed",
          {
            new_releases: newReleases.length,
            removed_releases: removedIds.length,
            error_count: errors.length + trackErrors.length,
            duration_ms: Date.now() - syncStartedAt,
          },
          { request },
        );

        console.log(`[Discogs Sync] All operations complete for ${username}`);
        send(
          trackErrors.length > 0
            ? `\nAll operations complete with track upsert failures. Failed tracks: ${trackErrors.length}; affected releases: ${new Set(trackErrors.map((error) => error.releaseId)).size}.\n\n`
            : `\n🎉 All operations complete!\n\n`,
        );
      } catch (e) {
        console.log(`[Discogs Sync] Error: ${e instanceof Error ? e.message : String(e)}`);
        send(`Error: ${e instanceof Error ? e.message : String(e)}\n\n`);
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
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
