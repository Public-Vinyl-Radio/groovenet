/**
 * One structured log line per stage of the vinyl ingest pipeline (#280).
 *
 * The pipeline runs unattended, so when a record plays and nothing shows up
 * in the history the question is *where* it broke. Every line is one JSON
 * object carrying `ingest_id` — the same id `fingerprint-service` logs — so a
 * single chunk can be followed across the container boundary with a grep:
 *
 *     docker compose logs app fingerprint-service | grep <ingest_id>
 *
 * Fields are an allowlist, not a filter. Anything not named in
 * `ALLOWED_FIELDS` is dropped and only scalars survive, so an upload, a
 * request, a header bag or a row cannot reach a log line by being passed in
 * carelessly. Free text (`error`) is truncated and scrubbed of anything shaped
 * like a credential. `fingerprint_service/observability.py` is the twin.
 */

export const INGEST_LOG_COMPONENT = "audio-ingest";

/** Where a chunk failed. `fingerprint-service` uses the same words for its own. */
export type IngestStage =
  | "upload"
  | "validation"
  | "store"
  | "enqueue"
  | "claim"
  | "parse"
  | "resolve"
  | "decode"
  | "match"
  | "report"
  | "reap"
  | "aggregate";

export type IngestLogFields = {
  ingest_id?: string | null;
  source_id?: string | null;
  session_id?: string | null;
  sequence?: number | null;
  status?: string | null;
  stage?: IngestStage | string | null;
  reason?: string | null;
  error?: string | null;
  duplicate?: boolean;
  size_bytes?: number | null;
  duration_seconds?: number | null;
  sample_rate?: number | null;
  channels?: number | null;
  codec?: string | null;
  captured_at?: string | null;
  queue_depth?: number | null;
  candidates?: number | null;
  track_id?: string | null;
  friend_id?: number | null;
  confidence?: number | null;
  level_dbfs?: number | null;
  fingerprint_type?: string | null;
  detection_id?: string | null;
  windows?: number | null;
  processing_ms?: number | null;
  latency_ms?: number | null;
};

const ALLOWED_FIELDS: ReadonlySet<string> = new Set<keyof IngestLogFields>([
  "ingest_id",
  "source_id",
  "session_id",
  "sequence",
  "status",
  "stage",
  "reason",
  "error",
  "duplicate",
  "size_bytes",
  "duration_seconds",
  "sample_rate",
  "channels",
  "codec",
  "captured_at",
  "queue_depth",
  "candidates",
  "track_id",
  "friend_id",
  "confidence",
  "level_dbfs",
  "fingerprint_type",
  "detection_id",
  "windows",
  "processing_ms",
  "latency_ms",
]);

/** Long enough for an ffprobe complaint; short enough that a body cannot ride along. */
export const MAX_STRING = 300;

const REDACTIONS: Array<[RegExp, string]> = [
  [/\bbearer\s+[^\s"',]+/gi, "Bearer [redacted]"],
  [
    /\b(token|password|passwd|secret|api[_-]?key|authorization)(\s*[=:]\s*)[^\s"',&]+/gi,
    "$1$2[redacted]",
  ],
  // Userinfo in a URL: redis://user:pass@host, postgres://u:p@db
  [/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[redacted]@"],
];

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.length <= MAX_STRING ? out : `${out.slice(0, MAX_STRING - 1)}…`;
}

/** Keep only allowlisted keys with scalar values. */
export function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key) || value === undefined) continue;
    if (value === null || typeof value === "boolean") {
      clean[key] = value;
    } else if (typeof value === "number") {
      if (Number.isFinite(value)) clean[key] = value;
    } else if (typeof value === "string") {
      clean[key] = redact(value);
    }
    // Buffers, Files, objects, arrays: never.
  }
  return clean;
}

type Level = "info" | "warn" | "error";

/** Emit one JSON line and return it, for tests. */
export function logIngestEvent(
  event: string,
  fields: IngestLogFields = {},
  level: Level = "info"
): Record<string, unknown> {
  const line = {
    ts: new Date().toISOString(),
    level,
    component: INGEST_LOG_COMPONENT,
    event,
    ...sanitize(fields as Record<string, unknown>),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
  return line;
}

/** An error's message, never its stack or attached properties. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Milliseconds between a timestamp and now; null when it is unusable. */
export function msSince(at: Date | string | null | undefined, now = Date.now()): number | null {
  if (!at) return null;
  const then = new Date(at).getTime();
  return Number.isFinite(then) ? Math.max(0, now - then) : null;
}
