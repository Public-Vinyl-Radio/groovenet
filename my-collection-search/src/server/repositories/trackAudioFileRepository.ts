import type { TrackAudioFile, TrackAudioFileFields } from "@groovenet/contracts";
import { dbQuery } from "@/lib/serverDb";

/**
 * Alternate audio copies of a track (#1310). The primary file stays in
 * `tracks.local_audio_url` and the `tracks.audio_*` columns; this table only
 * holds the other formats linked beside it.
 */
type AlternateRow = {
  filename: string;
  container: string | null;
  codec: string | null;
  lossless: boolean | null;
  sample_rate: number | null;
  bit_depth: number | null;
  bitrate: number | null;
  channels: number | null;
  size_bytes: string | null;
  source: TrackAudioFile["source"];
};

export type BackfillCandidate = {
  track_id: string;
  friend_id: number;
  local_audio_url: string;
  audio_source: TrackAudioFileFields["audio_source"];
};

export const trackAudioFileRepository = {
  async listAlternates(trackId: string, friendId: number): Promise<TrackAudioFile[]> {
    const { rows } = await dbQuery<AlternateRow>(
      `SELECT filename, container, codec, lossless, sample_rate, bit_depth, bitrate, channels,
              size_bytes, source
         FROM track_audio_files
        WHERE track_id = $1 AND friend_id = $2
        ORDER BY lossless DESC NULLS LAST, filename`,
      [trackId, friendId],
    );
    return rows.map((row) => ({ ...row, primary: false }));
  },

  /** Insert or refresh one alternate. Returns true when the link is new. */
  async upsert(
    trackId: string,
    friendId: number,
    filename: string,
    fields: TrackAudioFileFields,
  ): Promise<boolean> {
    const { rows } = await dbQuery<{ inserted: boolean }>(
      `INSERT INTO track_audio_files
         (track_id, friend_id, filename, container, codec, lossless, sample_rate, bit_depth,
          bitrate, channels, size_bytes, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (track_id, friend_id, filename) DO UPDATE SET
         container = EXCLUDED.container, codec = EXCLUDED.codec, lossless = EXCLUDED.lossless,
         sample_rate = EXCLUDED.sample_rate, bit_depth = EXCLUDED.bit_depth,
         bitrate = EXCLUDED.bitrate, channels = EXCLUDED.channels,
         size_bytes = EXCLUDED.size_bytes, source = EXCLUDED.source, updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [
        trackId,
        friendId,
        filename,
        fields.audio_container ?? null,
        fields.audio_codec ?? null,
        fields.audio_lossless ?? null,
        fields.audio_sample_rate ?? null,
        fields.audio_bit_depth ?? null,
        fields.audio_bitrate ?? null,
        fields.audio_channels ?? null,
        fields.audio_size_bytes ?? null,
        fields.audio_source ?? null,
      ],
    );
    return rows[0]?.inserted ?? false;
  },

  /** Unlink one alternate. The file on disk is not touched. */
  async remove(trackId: string, friendId: number, filename: string): Promise<boolean> {
    const { rowCount } = await dbQuery(
      `DELETE FROM track_audio_files WHERE track_id = $1 AND friend_id = $2 AND filename = $3`,
      [trackId, friendId, filename],
    );
    return (rowCount ?? 0) > 0;
  },

  /** Live tracks whose primary is a FLAC: the ones that may have an AAC beside them. */
  async listFlacPrimaries(): Promise<BackfillCandidate[]> {
    const { rows } = await dbQuery<BackfillCandidate>(
      `SELECT track_id, friend_id, local_audio_url, audio_source
         FROM tracks
        WHERE deleted_at IS NULL AND lower(local_audio_url) LIKE '%.flac'`,
    );
    return rows;
  },

  /**
   * Every audio file the library tracks, with whether it is lossless (#1310): the
   * primary of each live track plus every linked alternate. `lossless` is null for
   * a file whose format was never probed. Backups use it to split lossless from AAC
   * without trusting the extension, because ALAC lives in `.m4a` beside AAC.
   */
  async listAudioFormats(): Promise<Array<{ filename: string; lossless: boolean | null }>> {
    const { rows } = await dbQuery<{ filename: string; lossless: boolean | null }>(
      `SELECT local_audio_url AS filename, audio_lossless AS lossless
         FROM tracks
        WHERE local_audio_url IS NOT NULL AND btrim(local_audio_url) <> ''
       UNION ALL
       SELECT filename, lossless FROM track_audio_files`,
    );
    return rows;
  },
};
