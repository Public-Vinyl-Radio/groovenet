import { withDbTransaction } from "@/lib/serverDb";
import {
  albumRepository,
  type DiscogsCollectionRepair,
} from "@/server/repositories/albumRepository";
import { friendRepository } from "@/server/repositories/friendRepository";
import {
  getReleasePath,
  getReleaseWritePath,
  loadAlbum,
} from "@/server/services/discogsManifestService";

export type DiscogsCollectionRepairResult = {
  albums: string[];
  tracks: number;
};

/**
 * Bring already-imported releases back in line with the Discogs collection
 * listing the sync has just paged through (#847). Album edits used to null
 * `date_added` and `discogs_url`, and tracks never got `date_added` at all;
 * this heals both on every sync without re-fetching release details.
 *
 * `date_added` comes from the listing, else from the user's own saved release
 * JSON. `discogs_url` comes from the saved JSON's `uri`, else is rebuilt from
 * the release ID; the repository only uses it to fill a blank.
 */
export async function repairDiscogsCollectionFields(
  username: string,
  releaseIds: string[],
  collectionDateAdded: Map<string, string>,
): Promise<DiscogsCollectionRepairResult> {
  const ids = [...new Set(releaseIds)].filter((id) => /^\d+$/.test(id));
  if (ids.length === 0) return { albums: [], tracks: 0 };

  const friendId = await friendRepository.findIdByUsername(username);
  if (!friendId) return { albums: [], tracks: 0 };

  const entries: DiscogsCollectionRepair[] = ids.map((releaseId) => {
    const releasePath = getReleasePath(username, releaseId);
    const saved = releasePath ? loadAlbum(releasePath) : null;
    // A friend's lookup can fall back to the main user's file: its uri is the
    // same release, but its date_added is someone else's collection.
    const ownFile = releasePath === getReleaseWritePath(username, releaseId);
    return {
      release_id: releaseId,
      date_added:
        collectionDateAdded.get(releaseId) || (ownFile ? saved?.date_added : null) || null,
      discogs_url: saved?.uri || `https://www.discogs.com/release/${releaseId}`,
    };
  });

  return withDbTransaction((client) =>
    albumRepository.repairDiscogsCollectionFields(client, friendId, entries),
  );
}
