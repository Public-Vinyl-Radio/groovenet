import { dbQuery } from "@/lib/serverDb";
import type {
  FingerprintIdentity,
  FingerprintIndexCandidate,
  FingerprintIndexScope,
  FingerprintType,
  ListFingerprintsFilters,
  TrackFingerprintRow,
  TrackFingerprintStatusRow,
  UpsertTrackFingerprintInput,
} from "@/types/fingerprint";

const ROW_COLUMNS = `
  id,
  track_id,
  friend_id,
  fingerprint_type,
  fingerprint_version,
  fingerprint_data,
  audio_sha256,
  audio_duration_seconds,
  created_at,
  updated_at
`;

const STATUS_COLUMNS = `
  track_id,
  friend_id,
  fingerprint_type,
  fingerprint_version,
  audio_sha256,
  audio_duration_seconds,
  updated_at
`;

export class FingerprintRepository {
  /**
   * Insert or refresh one track's fingerprint for a given engine and version.
   * Other engines and other versions of the same engine are left untouched.
   */
  async upsertFingerprint(
    input: UpsertTrackFingerprintInput
  ): Promise<TrackFingerprintRow> {
    const { rows } = await dbQuery<TrackFingerprintRow>(
      `
      INSERT INTO track_fingerprints (
        track_id, friend_id, fingerprint_type, fingerprint_version,
        fingerprint_data, audio_sha256, audio_duration_seconds, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      ON CONFLICT (track_id, friend_id, fingerprint_type, fingerprint_version)
      DO UPDATE SET
        fingerprint_data       = EXCLUDED.fingerprint_data,
        audio_sha256           = EXCLUDED.audio_sha256,
        audio_duration_seconds = EXCLUDED.audio_duration_seconds,
        updated_at             = CURRENT_TIMESTAMP
      RETURNING ${ROW_COLUMNS}
      `,
      [
        input.track_id,
        input.friend_id,
        input.fingerprint_type,
        input.fingerprint_version,
        input.fingerprint_data,
        input.audio_sha256,
        input.audio_duration_seconds ?? null,
      ]
    );
    return rows[0];
  }

  /** The stored fingerprint for one track under one engine and version. */
  async findFingerprint(
    identity: FingerprintIdentity
  ): Promise<TrackFingerprintRow | null> {
    const { rows } = await dbQuery<TrackFingerprintRow>(
      `
      SELECT ${ROW_COLUMNS}
      FROM track_fingerprints
      WHERE track_id = $1
        AND friend_id = $2
        AND fingerprint_type = $3
        AND fingerprint_version = $4
      `,
      [
        identity.track_id,
        identity.friend_id,
        identity.fingerprint_type,
        identity.fingerprint_version,
      ]
    );
    return rows[0] ?? null;
  }

  /**
   * Fingerprints whose source audio hashed to `audioSha256`. More than one row
   * can share a hash — the same file indexed by two engines, or the same audio
   * reachable under two tracks.
   */
  async findFingerprintsByAudioSha256(
    audioSha256: string,
    filters: { fingerprint_type?: FingerprintType; fingerprint_version?: string } = {}
  ): Promise<TrackFingerprintRow[]> {
    const params: Array<string> = [audioSha256];
    const where = ["audio_sha256 = $1"];

    if (filters.fingerprint_type) {
      params.push(filters.fingerprint_type);
      where.push(`fingerprint_type = $${params.length}`);
    }
    if (filters.fingerprint_version) {
      params.push(filters.fingerprint_version);
      where.push(`fingerprint_version = $${params.length}`);
    }

    const { rows } = await dbQuery<TrackFingerprintRow>(
      `
      SELECT ${ROW_COLUMNS}
      FROM track_fingerprints
      WHERE ${where.join(" AND ")}
      ORDER BY track_id, friend_id
      `,
      params
    );
    return rows;
  }

  /** Every fingerprint for one engine and version — the in-memory match index. */
  async listFingerprintsForIndex(
    filters: ListFingerprintsFilters
  ): Promise<TrackFingerprintRow[]> {
    const params: Array<string | number> = [
      filters.fingerprint_type,
      filters.fingerprint_version,
    ];
    let query = `
      SELECT ${ROW_COLUMNS}
      FROM track_fingerprints
      WHERE fingerprint_type = $1 AND fingerprint_version = $2
    `;

    if (filters.friend_id !== undefined) {
      params.push(filters.friend_id);
      query += ` AND friend_id = $${params.length}`;
    }

    query += " ORDER BY friend_id, track_id";

    if (filters.limit !== undefined) {
      params.push(filters.limit);
      query += ` LIMIT $${params.length}`;
    }
    if (filters.offset !== undefined) {
      params.push(filters.offset);
      query += ` OFFSET $${params.length}`;
    }

    const { rows } = await dbQuery<TrackFingerprintRow>(query, params);
    return rows;
  }

  /**
   * The same set without the payload, for deciding what to re-fingerprint.
   * Reading thousands of blobs to compare seven-byte hashes would be wasteful.
   */
  async listFingerprintStatus(
    filters: ListFingerprintsFilters
  ): Promise<TrackFingerprintStatusRow[]> {
    const params: Array<string | number> = [
      filters.fingerprint_type,
      filters.fingerprint_version,
    ];
    let query = `
      SELECT ${STATUS_COLUMNS}
      FROM track_fingerprints
      WHERE fingerprint_type = $1 AND fingerprint_version = $2
    `;

    if (filters.friend_id !== undefined) {
      params.push(filters.friend_id);
      query += ` AND friend_id = $${params.length}`;
    }

    query += " ORDER BY friend_id, track_id";

    const { rows } = await dbQuery<TrackFingerprintStatusRow>(query, params);
    return rows;
  }

  /** Which engines and versions already cover a track. */
  async listFingerprintVersionsForTrack(
    trackId: string,
    friendId: number
  ): Promise<Array<Pick<FingerprintIdentity, "fingerprint_type" | "fingerprint_version">>> {
    const { rows } = await dbQuery<
      Pick<FingerprintIdentity, "fingerprint_type" | "fingerprint_version">
    >(
      `
      SELECT fingerprint_type, fingerprint_version
      FROM track_fingerprints
      WHERE track_id = $1 AND friend_id = $2
      ORDER BY fingerprint_type, fingerprint_version
      `,
      [trackId, friendId]
    );
    return rows;
  }

  async countFingerprints(filters: {
    fingerprint_type?: FingerprintType;
    fingerprint_version?: string;
    friend_id?: number;
  } = {}): Promise<number> {
    const params: Array<string | number> = [];
    const where: string[] = [];

    if (filters.fingerprint_type) {
      params.push(filters.fingerprint_type);
      where.push(`fingerprint_type = $${params.length}`);
    }
    if (filters.fingerprint_version) {
      params.push(filters.fingerprint_version);
      where.push(`fingerprint_version = $${params.length}`);
    }
    if (filters.friend_id !== undefined) {
      params.push(filters.friend_id);
      where.push(`friend_id = $${params.length}`);
    }

    const { rows } = await dbQuery<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM track_fingerprints
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      `,
      params
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Drop a track's fingerprints, optionally only those of one engine. */
  async deleteFingerprintsForTrack(
    trackId: string,
    friendId: number,
    fingerprintType?: FingerprintType
  ): Promise<number> {
    const params: Array<string | number> = [trackId, friendId];
    let query = `
      DELETE FROM track_fingerprints
      WHERE track_id = $1 AND friend_id = $2
    `;

    if (fingerprintType) {
      params.push(fingerprintType);
      query += ` AND fingerprint_type = $${params.length}`;
    }

    const result = await dbQuery(query, params);
    return result.rowCount ?? 0;
  }

  /**
   * The tracks one indexing run should queue, for one engine and version (#277).
   *
   * Left-joined against `track_fingerprints` so every candidate carries the
   * hash stored for it — that is what lets the worker decide skip-or-regenerate
   * from the file in front of it without a round-trip per track. The join is
   * pinned to the active engine, so a version bump finds no stored hash and
   * regenerates, while rows under other types and versions are neither read nor
   * written.
   *
   * Only tracks with a `local_audio_url` are returned; the ones without are
   * counted separately by `countUnindexableTracks`, because "no reference audio"
   * is a fact about the library, not a failure of the run.
   */
  async listIndexCandidates(
    scope: FingerprintIndexScope,
    identity: Pick<FingerprintIdentity, "fingerprint_type" | "fingerprint_version">
  ): Promise<FingerprintIndexCandidate[]> {
    const params: Array<string | number> = [
      identity.fingerprint_type,
      identity.fingerprint_version,
    ];
    const where = [
      "t.deleted_at IS NULL",
      "t.local_audio_url IS NOT NULL",
      "t.local_audio_url <> ''",
    ];

    switch (scope.kind) {
      case "missing":
        where.push("f.track_id IS NULL");
        break;
      case "changed":
        // A stored row whose hash no longer matches cannot be detected here —
        // only the worker can hash the file. "Changed" therefore means "already
        // indexed", and the worker skips the ones that turn out to be current.
        where.push("f.track_id IS NOT NULL");
        break;
      case "all":
        break;
      case "track":
        params.push(scope.track_id);
        where.push(`t.track_id = $${params.length}`);
        if (scope.friend_id !== undefined) {
          params.push(scope.friend_id);
          where.push(`t.friend_id = $${params.length}`);
        }
        break;
      case "release":
        params.push(scope.release_id);
        where.push(`t.release_id = $${params.length}`);
        if (scope.friend_id !== undefined) {
          params.push(scope.friend_id);
          where.push(`t.friend_id = $${params.length}`);
        }
        break;
    }

    const { rows } = await dbQuery<FingerprintIndexCandidate>(
      `
      SELECT
        t.track_id,
        t.friend_id,
        t.local_audio_url,
        f.audio_sha256 AS stored_audio_sha256
      FROM tracks t
      LEFT JOIN track_fingerprints f
        ON f.track_id = t.track_id
       AND f.friend_id = t.friend_id
       AND f.fingerprint_type = $1
       AND f.fingerprint_version = $2
      WHERE ${where.join(" AND ")}
      ORDER BY t.friend_id, t.track_id
      `,
      params
    );
    return rows;
  }

  /**
   * Tracks in scope that can never be indexed, because there is no local audio.
   *
   * Reported rather than failed: only part of the library has been downloaded,
   * and the first thing an operator wants from a full run is how much of it the
   * matcher will actually be able to recognise.
   */
  async countUnindexableTracks(scope: FingerprintIndexScope): Promise<number> {
    const params: Array<string | number> = [];
    const where = [
      "deleted_at IS NULL",
      "(local_audio_url IS NULL OR local_audio_url = '')",
    ];

    if (scope.kind === "track") {
      params.push(scope.track_id);
      where.push(`track_id = $${params.length}`);
      if (scope.friend_id !== undefined) {
        params.push(scope.friend_id);
        where.push(`friend_id = $${params.length}`);
      }
    } else if (scope.kind === "release") {
      params.push(scope.release_id);
      where.push(`release_id = $${params.length}`);
      if (scope.friend_id !== undefined) {
        params.push(scope.friend_id);
        where.push(`friend_id = $${params.length}`);
      }
    } else if (scope.kind === "changed") {
      // A track with no audio has never been indexed, so it can never be in
      // the "already indexed" set. Counting it would be noise.
      return 0;
    }

    const { rows } = await dbQuery<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM tracks
      WHERE ${where.join(" AND ")}
      `,
      params
    );
    return Number(rows[0]?.count ?? 0);
  }

  /** Retire a superseded engine version without touching the others. */
  async deleteFingerprintsByVersion(
    fingerprintType: FingerprintType,
    fingerprintVersion: string
  ): Promise<number> {
    const result = await dbQuery(
      `
      DELETE FROM track_fingerprints
      WHERE fingerprint_type = $1 AND fingerprint_version = $2
      `,
      [fingerprintType, fingerprintVersion]
    );
    return result.rowCount ?? 0;
  }
}

export const fingerprintRepository = new FingerprintRepository();
