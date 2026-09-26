import { dbQuery } from "@/lib/serverDb";
import type {
  PlannedEntry,
  SetDerivationRow,
  SetDerivationStatus,
  SetTrackRef,
  SetWindow,
} from "@/types/setDerivation";

export type CreateSetDerivationInput = {
  recording_sha256: string;
  fingerprint_type: string;
  fingerprint_version: string;
  window_seconds: number;
  step_seconds: number;
};

export type SetDerivationKey = CreateSetDerivationInput;

/** Runs of the matcher over whole set recordings (#282). */
export class SetDerivationRepository {
  async create(input: CreateSetDerivationInput): Promise<SetDerivationRow> {
    const { rows } = await dbQuery<SetDerivationRow>(
      `
      INSERT INTO set_derivations (
        recording_sha256, fingerprint_type, fingerprint_version, window_seconds, step_seconds
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        input.recording_sha256,
        input.fingerprint_type,
        input.fingerprint_version,
        input.window_seconds,
        input.step_seconds,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<SetDerivationRow | null> {
    const { rows } = await dbQuery<SetDerivationRow>(
      "SELECT * FROM set_derivations WHERE id = $1",
      [id]
    );
    return rows[0] ?? null;
  }

  /**
   * The newest run of this recording under this engine and these settings
   * that has not failed — what a repeat request gets back instead of a new
   * run. A failed run is not reused: asking again is how you retry it.
   */
  async findReusable(key: SetDerivationKey): Promise<SetDerivationRow | null> {
    const { rows } = await dbQuery<SetDerivationRow>(
      `
      SELECT * FROM set_derivations
      WHERE recording_sha256 = $1
        AND fingerprint_type = $2
        AND fingerprint_version = $3
        AND window_seconds = $4
        AND step_seconds = $5
        AND status <> 'failed'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [
        key.recording_sha256,
        key.fingerprint_type,
        key.fingerprint_version,
        key.window_seconds,
        key.step_seconds,
      ]
    );
    return rows[0] ?? null;
  }

  /** Move to `to` only from one of `from`; null if the guard did not match. */
  async transitionStatus(
    id: string,
    to: SetDerivationStatus,
    from: SetDerivationStatus[],
    error: string | null = null
  ): Promise<SetDerivationRow | null> {
    const { rows } = await dbQuery<SetDerivationRow>(
      `
      UPDATE set_derivations
      SET status = $2,
          error = $3,
          updated_at = current_timestamp,
          -- Decided here rather than with \`$2 IN (...)\`: reusing $2 in a
          -- comparison makes Postgres deduce two types for it and refuse.
          completed_at = CASE WHEN $5::boolean THEN current_timestamp ELSE completed_at END
      WHERE id = $1 AND status = ANY($4::text[])
      RETURNING *
      `,
      [id, to, error, from, to === "processed" || to === "failed"]
    );
    return rows[0] ?? null;
  }

  /**
   * Store the worker's result and close the run in one statement.
   *
   * Guarded like `transitionStatus`: a duplicate or late report for a run that
   * is already terminal changes nothing.
   */
  async complete(
    id: string,
    result: {
      status: "processed" | "failed";
      error: string | null;
      duration_seconds: number | null;
      windows: SetWindow[];
    }
  ): Promise<SetDerivationRow | null> {
    const { rows } = await dbQuery<SetDerivationRow>(
      `
      UPDATE set_derivations
      SET status = $2,
          error = $3,
          duration_seconds = $4,
          windows = $5::jsonb,
          updated_at = current_timestamp,
          completed_at = current_timestamp
      WHERE id = $1 AND status IN ('queued', 'processing')
      RETURNING *
      `,
      [id, result.status, result.error, result.duration_seconds, JSON.stringify(result.windows)]
    );
    return rows[0] ?? null;
  }

  /** Title, artist and release for each (track_id, friend_id) pair given. */
  async findTracks(
    refs: Array<{ track_id: string; friend_id: number }>
  ): Promise<SetTrackRef[]> {
    if (refs.length === 0) return [];
    const { rows } = await dbQuery<SetTrackRef>(
      `
      SELECT t.track_id, t.friend_id, t.title, t.artist, t.release_id, t.position
      FROM tracks t
      JOIN unnest($1::text[], $2::int[]) AS want(track_id, friend_id)
        ON t.track_id = want.track_id AND t.friend_id = want.friend_id
      `,
      [refs.map((r) => r.track_id), refs.map((r) => r.friend_id)]
    );
    return rows;
  }

  /**
   * A playlist in order, each entry resolved and marked with whether it has a
   * fingerprint under this engine. "Planned but not played" and "not in the
   * index" otherwise look identical.
   */
  async listPlannedEntries(
    playlistId: number,
    engine: { fingerprint_type: string; fingerprint_version: string }
  ): Promise<PlannedEntry[]> {
    const { rows } = await dbQuery<Omit<PlannedEntry, "index">>(
      `
      SELECT pt.track_id, pt.friend_id, t.title, t.artist, t.release_id, t.position,
             EXISTS (
               SELECT 1 FROM track_fingerprints f
               WHERE f.track_id = pt.track_id AND f.friend_id = pt.friend_id
                 AND f.fingerprint_type = $2 AND f.fingerprint_version = $3
                 AND f.fingerprint_data IS NOT NULL
             ) AS fingerprinted
      FROM playlist_tracks pt
      LEFT JOIN tracks t ON t.track_id = pt.track_id AND t.friend_id = pt.friend_id
      WHERE pt.playlist_id = $1
      ORDER BY pt.position ASC
      `,
      [playlistId, engine.fingerprint_type, engine.fingerprint_version]
    );
    return rows.map((row, index) => ({ ...row, index }));
  }

  /** Tracks on these releases with no fingerprint under this engine. */
  async listUnindexedOnReleases(
    releaseIds: string[],
    engine: { fingerprint_type: string; fingerprint_version: string }
  ): Promise<SetTrackRef[]> {
    if (releaseIds.length === 0) return [];
    const { rows } = await dbQuery<SetTrackRef>(
      `
      SELECT t.track_id, t.friend_id, t.title, t.artist, t.release_id, t.position
      FROM tracks t
      WHERE t.release_id = ANY($1::text[])
        AND t.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM track_fingerprints f
          WHERE f.track_id = t.track_id AND f.friend_id = t.friend_id
            AND f.fingerprint_type = $2 AND f.fingerprint_version = $3
            AND f.fingerprint_data IS NOT NULL
        )
      ORDER BY t.release_id, t.position
      `,
      [releaseIds, engine.fingerprint_type, engine.fingerprint_version]
    );
    return rows;
  }

  async findPlaylistIdForLiveSet(liveSetId: number): Promise<number | null> {
    const { rows } = await dbQuery<{ playlist_id: number }>(
      "SELECT playlist_id FROM live_sets WHERE id = $1",
      [liveSetId]
    );
    return rows[0]?.playlist_id ?? null;
  }

  async playlistExists(playlistId: number): Promise<boolean> {
    const { rows } = await dbQuery("SELECT 1 FROM playlists WHERE id = $1", [playlistId]);
    return rows.length > 0;
  }

  /**
   * Attach a recording to a live set's media, once. `url` is the app route
   * that serves the recording.
   */
  async attachToLiveSet(liveSetId: number, url: string, filename: string | null): Promise<void> {
    await dbQuery(
      `
      INSERT INTO live_set_media (live_set_id, media_type, url, filename, position)
      SELECT $1, 'audio', $2, $3,
             COALESCE((SELECT MAX(position) + 1 FROM live_set_media WHERE live_set_id = $1), 0)
      WHERE NOT EXISTS (
        SELECT 1 FROM live_set_media WHERE live_set_id = $1 AND url = $2
      )
      `,
      [liveSetId, url, filename]
    );
  }
}

export const setDerivationRepository = new SetDerivationRepository();
