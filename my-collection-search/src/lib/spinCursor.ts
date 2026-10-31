// Keyset cursor for the spin list (#861): the sort key of the last item on a
// page, `(played_at, id)`, as base64url JSON. Opaque to callers.
//
// `played_at` stays the exact text Postgres produced (microsecond precision):
// round-tripping it through a JS Date would truncate to milliseconds, and a
// truncated key compares differently from the stored one, so rows sharing a
// millisecond could be skipped or repeated across a page boundary.

export type SpinCursor = { played_at: string; id: number };

const PLAYED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

export function encodeSpinCursor(cursor: SpinCursor): string {
  return Buffer.from(JSON.stringify({ played_at: cursor.played_at, id: cursor.id })).toString(
    "base64url",
  );
}

/** The cursor, or null when `value` is not one this module produced. */
export function decodeSpinCursor(value: string): SpinCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { played_at, id } = parsed as Record<string, unknown>;
    if (typeof played_at !== "string" || !PLAYED_AT.test(played_at)) return null;
    if (Number.isNaN(Date.parse(played_at))) return null;
    if (typeof id !== "number" || !Number.isSafeInteger(id)) return null;
    return { played_at, id };
  } catch {
    return null;
  }
}
