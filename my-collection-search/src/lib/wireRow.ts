/**
 * A database row as JSON will serialise it: `Date` columns become ISO strings.
 * The response body is unchanged (`JSON.stringify` does the same), but the row
 * can then be checked against the shared schemas, which describe the wire form.
 */
export function toWireRow<T extends object>(row: T): T {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date)
      out[key] = Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return out as T;
}
