import type { Friend } from "@groovenet/contracts";
import { friendRepository } from "@/server/repositories/friendRepository";
import { getManifestLastSynced } from "@/server/services/discogsManifestService";

export type LibraryWithStats = Friend & {
  is_account: boolean;
  release_count: number;
  last_synced_at: string | null;
};

type ProgressFn = (line: string) => void;

export class FriendService {
  async listFriends(): Promise<Friend[]> {
    return friendRepository.listFriends();
  }

  /**
   * Settings → Libraries: each library with its album count and last sync,
   * your own account (`DISCOGS_USERNAME`) first and flagged.
   */
  async listLibraries(): Promise<{
    results: LibraryWithStats[];
    account_username: string | null;
  }> {
    const account = process.env.DISCOGS_USERNAME?.trim() || null;
    const rows = await friendRepository.listFriendsWithReleaseCounts();
    const results = rows.map((row) => ({
      ...row,
      is_account: row.username === account,
      last_synced_at: getManifestLastSynced(row.username),
    }));
    // Stable sort: the account first, the rest in their existing order.
    results.sort((a, b) => Number(b.is_account) - Number(a.is_account));
    return { results, account_username: account };
  }

  async addFriend(username: string): Promise<void> {
    await friendRepository.insertFriendIfMissing(username);
  }

  async removeFriend(username: string, onProgress: ProgressFn): Promise<void> {
    // Remove manifest and release files
    try {
      const { getManifestPath, getManifestReleaseIds, getReleasePath, DISCOGS_EXPORTS_DIR } =
        await import("@/server/services/discogsManifestService");
      const fs = await import("fs");
      const path = await import("path");

      const manifestPath = getManifestPath(username);
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
        onProgress(`Deleted manifest: ${manifestPath}`);
      } else {
        onProgress(`Manifest not found: ${manifestPath}`);
      }

      const releaseIds = getManifestReleaseIds(username);
      for (const releaseId of releaseIds) {
        const releasePath = getReleasePath(username, releaseId);
        if (releasePath && fs.existsSync(releasePath)) {
          fs.unlinkSync(releasePath);
          onProgress(`Deleted release: ${releasePath}`);
        } else if (releasePath) {
          onProgress(`Release not found: ${releasePath}`);
        }
      }

      const files = fs.readdirSync(DISCOGS_EXPORTS_DIR);
      for (const file of files) {
        if (file.startsWith(`${username}_release_`) && file.endsWith(".json")) {
          fs.unlinkSync(path.join(DISCOGS_EXPORTS_DIR, file));
          onProgress(`Deleted legacy release: ${file}`);
        }
      }
    } catch (error) {
      onProgress(
        `Error deleting manifest/release files: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Remove from Postgres
    try {
      await friendRepository.deleteTracksByUsername(username);
      onProgress(`Deleted tracks from Postgres for user: ${username}`);
    } catch (error) {
      onProgress(
        `Error deleting user tracks from Postgres: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await friendRepository.deleteFriendByUsername(username);
    onProgress(`Deleted friend: ${username}`);
  }
}

export const friendService = new FriendService();
