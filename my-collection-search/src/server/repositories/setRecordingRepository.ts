import { dbQuery } from "@/lib/serverDb";
import type { SetRecordingRow } from "@/types/setDerivation";

export type CreateSetRecordingInput = {
  sha256: string;
  file_path: string;
  original_filename?: string | null;
  format_name?: string | null;
  duration_seconds?: number | null;
  size_bytes: number;
};

/** Uploaded set recordings, keyed by the sha256 of their bytes (#282). */
export class SetRecordingRepository {
  async findBySha256(sha256: string): Promise<SetRecordingRow | null> {
    const { rows } = await dbQuery<SetRecordingRow>(
      "SELECT * FROM set_recordings WHERE sha256 = $1",
      [sha256]
    );
    return rows[0] ?? null;
  }

  /**
   * Record a stored recording, or return the one already recorded.
   *
   * Two uploads of the same file racing each other both end with the same
   * bytes at the same path, so the second insert is simply a no-op.
   */
  async create(input: CreateSetRecordingInput): Promise<SetRecordingRow> {
    await dbQuery(
      `
      INSERT INTO set_recordings (
        sha256, file_path, original_filename, format_name, duration_seconds, size_bytes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (sha256) DO NOTHING
      `,
      [
        input.sha256,
        input.file_path,
        input.original_filename ?? null,
        input.format_name ?? null,
        input.duration_seconds ?? null,
        input.size_bytes,
      ]
    );
    return (await this.findBySha256(input.sha256)) as SetRecordingRow;
  }
}

export const setRecordingRepository = new SetRecordingRepository();
