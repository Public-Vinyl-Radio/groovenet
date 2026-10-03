import { withDbTransaction } from "@/lib/serverDb";
import {
  playlistRepository,
  type PlaylistSpinEntry,
} from "@/server/repositories/playlistRepository";
import { spinSessionRepository } from "@/server/repositories/spinSessionRepository";
import { trackSpinEventRepository } from "@/server/repositories/trackSpinEventRepository";
import { setDerivationService } from "@/server/services/setDerivationService";

export type LogPlaylistSpinsInput = {
  performed_at?: string;
  performance_id?: number;
  derivation_id?: string;
};

export type LogPlaylistSpinsResult = {
  playlist_id: number;
  performance_id: number | null;
  performed_at: string;
  created: number;
  skipped: number;
};

type EntryToLog = PlaylistSpinEntry & { offset_seconds: number | null };

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class PlaylistSpinService {
  async log(playlistId: number, input: LogPlaylistSpinsInput): Promise<LogPlaylistSpinsResult> {
    const playlist = await playlistRepository.findPlaylistHeaderById(playlistId);
    if (!playlist) throw new Error("Playlist not found");
    if (input.performed_at != null && input.performance_id != null) {
      throw new Error("Provide either performed_at or performance_id, not both");
    }

    const performance =
      input.performed_at == null
        ? await playlistRepository.findPerformance(playlistId, input.performance_id)
        : null;
    if (input.performance_id != null && !performance) {
      throw new Error("Performance not found for playlist");
    }
    if (!performance && input.performed_at == null) {
      throw new Error("Playlist has no performance; provide performed_at");
    }

    const anchor = iso(performance?.performed_at ?? input.performed_at!);
    const allEntries = await playlistRepository.listSpinEntries(playlistId);
    let entries: EntryToLog[];

    if (input.derivation_id) {
      const view = await setDerivationService.view(input.derivation_id, { playlist_id: playlistId });
      if (!view.diff || view.derivation.status !== "processed") {
        throw new Error("Set derivation is not ready for this playlist");
      }
      // Only entries positively matched to the plan are spins. In particular,
      // planned_not_played and the planned half of played_instead_of are omitted.
      entries = view.diff.played_as_planned
        .sort((a, b) => a.play - b.play)
        .map(({ play, planned }) => {
          const entry = allEntries[planned.index];
          if (!entry || entry.track_id !== planned.track_id || entry.friend_id !== planned.friend_id) {
            throw new Error("Playlist changed since the set derivation was reviewed");
          }
          return { ...entry, offset_seconds: view.tracklist[play]?.start_seconds ?? 0 };
        });
    } else {
      entries = allEntries.map((entry) => ({ ...entry, offset_seconds: null }));
    }

    for (const entry of entries) {
      if (!entry.release_id || entry.title == null || entry.artist == null) {
        throw new Error(`Playlist track is missing or has no release: ${entry.track_id}`);
      }
    }

    let elapsed = 0;
    const baseMs = new Date(anchor).getTime();
    const result = await withDbTransaction(async (client) => {
      let created = 0;
      let skipped = 0;

      for (const entry of entries) {
        const offset = performance
          ? input.derivation_id
            ? entry.offset_seconds!
            : elapsed
          : 0;
        const playedAt = new Date(baseMs + offset * 1000).toISOString();
        const session = await spinSessionRepository.createPlaylistSession(client, {
          friend_id: entry.friend_id,
          release_id: entry.release_id!,
          selection_mode: "playlist",
          played_at: playedAt,
          provenance: "playlist",
          playlist_id: playlistId,
          live_set_performance_id: performance?.id ?? null,
          playlist_played_at: anchor,
          playlist_position: entry.playlist_position,
        });

        if (!session) {
          skipped += 1;
        } else {
          await spinSessionRepository.insertSelections(client, session.id, [{
            ordinal: 0,
            selection_type: "track",
            track_id: entry.track_id,
            friend_id: entry.friend_id,
            position_snapshot: entry.track_position,
          }]);
          await trackSpinEventRepository.insertEvents(client, session.id, [{
            friend_id: entry.friend_id,
            release_id: entry.release_id!,
            track_id: entry.track_id,
            played_at: playedAt,
            ordinal: 0,
            side_key: null,
            position_snapshot: entry.track_position,
            title_snapshot: entry.title!,
            artist_snapshot: entry.artist!,
            album_snapshot: entry.album ?? "",
          }]);
          created += 1;
        }
        elapsed += Math.max(0, entry.duration_seconds ?? 0);
      }
      return { created, skipped };
    });

    return {
      playlist_id: playlistId,
      performance_id: performance?.id ?? null,
      performed_at: anchor,
      ...result,
    };
  }
}

export const playlistSpinService = new PlaylistSpinService();
