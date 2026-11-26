import { withDbTransaction } from "@/lib/serverDb";
import { playlistRepository } from "@/server/repositories/playlistRepository";
import { liveSetRepository, type LiveSetUpdate } from "@/server/repositories/liveSetRepository";

/**
 * A set belongs to its playlist, so it is visible exactly when the playlist
 * is (#1284): every method takes the viewer and treats a private playlist of
 * someone else's as missing.
 */
export class LiveSetService {
  private visible(playlistId: number, viewerId: string) {
    return playlistRepository.findPlaylistHeaderById(playlistId, viewerId);
  }

  async getByPlaylistId(playlistId: number, viewerId: string) {
    if (!(await this.visible(playlistId, viewerId))) return null;
    return liveSetRepository.findDetailByPlaylistId(playlistId);
  }

  async createForPlaylist(playlistId: number, viewerId: string) {
    if (!(await this.visible(playlistId, viewerId))) return null;
    return withDbTransaction((client) => liveSetRepository.ensureForPlaylist(client, playlistId));
  }

  async updateForPlaylist(playlistId: number, update: LiveSetUpdate, viewerId: string) {
    if (!(await this.visible(playlistId, viewerId))) return null;
    return withDbTransaction(async (client) => {
      const set = await liveSetRepository.ensureForPlaylist(client, playlistId);
      await liveSetRepository.update(client, set.id, update);
      await liveSetRepository.replaceRelatedRecords(client, set.id, update);
      return set;
    });
  }

  async deleteForPlaylist(playlistId: number, viewerId: string) {
    if (!(await this.visible(playlistId, viewerId))) return false;
    return liveSetRepository.deleteByPlaylistId(playlistId);
  }
}

export const liveSetService = new LiveSetService();
