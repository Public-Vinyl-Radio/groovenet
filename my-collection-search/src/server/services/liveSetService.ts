import { withDbTransaction } from "@/lib/serverDb";
import { playlistRepository } from "@/server/repositories/playlistRepository";
import { liveSetRepository, type LiveSetUpdate } from "@/server/repositories/liveSetRepository";

export class LiveSetService {
  async getByPlaylistId(playlistId: number) {
    return liveSetRepository.findDetailByPlaylistId(playlistId);
  }

  async createForPlaylist(playlistId: number) {
    const playlist = await playlistRepository.findPlaylistHeaderById(playlistId);
    if (!playlist) return null;
    return withDbTransaction((client) => liveSetRepository.ensureForPlaylist(client, playlistId));
  }

  async updateForPlaylist(playlistId: number, update: LiveSetUpdate) {
    const playlist = await playlistRepository.findPlaylistHeaderById(playlistId);
    if (!playlist) return null;
    return withDbTransaction(async (client) => {
      const set = await liveSetRepository.ensureForPlaylist(client, playlistId);
      await liveSetRepository.update(client, set.id, update);
      await liveSetRepository.replaceRelatedRecords(client, set.id, update);
      return set;
    });
  }

  async deleteForPlaylist(playlistId: number) {
    return liveSetRepository.deleteByPlaylistId(playlistId);
  }
}

export const liveSetService = new LiveSetService();
