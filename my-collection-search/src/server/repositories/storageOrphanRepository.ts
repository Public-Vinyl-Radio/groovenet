import { dbQuery } from "@/lib/serverDb";
import type { MissingFileTrack, OrphanFile } from "@groovenet/contracts";

export type StoredScan = {
  scanned_at: Date | null;
  duration_ms: number | null;
  error: string | null;
  files_total: number;
  tracks_total: number;
  files: OrphanFile[];
  tracks: MissingFileTrack[];
};

// A page of a jsonb array, in stored order.
const slice = (column: string, offset: string, limit: string) =>
  `(SELECT COALESCE(jsonb_agg(e ORDER BY n), '[]'::jsonb)
      FROM (SELECT e, n FROM jsonb_array_elements(${column}) WITH ORDINALITY AS t(e, n)
            ORDER BY n OFFSET ${offset} LIMIT ${limit}) page)`;

export const storageOrphanRepository = {
  /** Every track that names an audio file, for the scan to resolve. */
  async listTracksWithAudio(): Promise<MissingFileTrack[]> {
    const { rows } = await dbQuery<MissingFileTrack>(
      `SELECT track_id, username, title, artist, local_audio_url
         FROM tracks
        WHERE local_audio_url IS NOT NULL AND btrim(local_audio_url) <> ''`,
    );
    return rows;
  },

  async saveResult(scan: {
    scannedAt: Date;
    durationMs: number;
    files: OrphanFile[];
    tracks: MissingFileTrack[];
  }): Promise<void> {
    await dbQuery(
      `INSERT INTO storage_orphan_scan (id, scanned_at, duration_ms, files, tracks, error)
       VALUES (1, $1, $2, $3::jsonb, $4::jsonb, NULL)
       ON CONFLICT (id) DO UPDATE
         SET scanned_at = EXCLUDED.scanned_at, duration_ms = EXCLUDED.duration_ms,
             files = EXCLUDED.files, tracks = EXCLUDED.tracks, error = NULL`,
      [scan.scannedAt, scan.durationMs, JSON.stringify(scan.files), JSON.stringify(scan.tracks)],
    );
  },

  /** Keeps the previous result; only records why the newest scan failed. */
  async saveError(message: string): Promise<void> {
    await dbQuery(
      `INSERT INTO storage_orphan_scan (id, error) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET error = EXCLUDED.error`,
      [message],
    );
  },

  async getPage(
    limit: number,
    filesOffset: number,
    tracksOffset: number,
  ): Promise<StoredScan | null> {
    const { rows } = await dbQuery<StoredScan>(
      `SELECT scanned_at, duration_ms, error,
              jsonb_array_length(files) AS files_total,
              jsonb_array_length(tracks) AS tracks_total,
              ${slice("files", "$2", "$1")} AS files,
              ${slice("tracks", "$3", "$1")} AS tracks
         FROM storage_orphan_scan WHERE id = 1`,
      [limit, filesOffset, tracksOffset],
    );
    return rows[0] ?? null;
  },

  /** Totals for the summary line: count and bytes of the stored orphan files. */
  async getFileBytes(): Promise<number> {
    const { rows } = await dbQuery<{ bytes: string | null }>(
      `SELECT SUM((e->>'size_bytes')::bigint) AS bytes
         FROM storage_orphan_scan, jsonb_array_elements(files) AS e WHERE id = 1`,
    );
    return Number(rows[0]?.bytes ?? 0);
  },
};
