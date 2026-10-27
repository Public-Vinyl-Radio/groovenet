// Pure track formatters shared by the web app and the CLI. No I/O and no Node
// imports: the web bundle loads this through `@groovenet/client/player-session`.

/** The duration fields of a track, in either form the catalogue stores them. */
type Timed = { duration_seconds?: number | null; duration?: string | null };
/** The fields behind a track's meta line. */
type Described = { position?: string | number | null; bpm?: number | string | null; key?: string | null };

/** A usable tempo: a positive number, whether stored as a number or a string. */
export function parseBpm(bpm: number | string | null | undefined): number | null {
  const n = typeof bpm === "number" ? bpm : parseFloat(bpm ?? "");
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CAMELOT_BY_KEY: Record<string, string> = {
  "C major": "8B", "G major": "9B", "D major": "10B", "A major": "11B", "E major": "12B", "B major": "1B",
  "F# major": "2B", "C# major": "3B", "F major": "7B", "Bb major": "6B", "Eb major": "5B", "Ab major": "4B",
  "Db major": "3B", "Gb major": "2B", "Cb major": "1B",
  "A minor": "8A", "E minor": "9A", "B minor": "10A", "F# minor": "11A", "C# minor": "12A", "G# minor": "1A",
  "D# minor": "2A", "A# minor": "3A", "D minor": "7A", "G minor": "6A", "C minor": "5A", "F minor": "4A",
  "Bb minor": "3A", "Eb minor": "2A", "Ab minor": "1A",
};

/**
 * The Camelot code for a spelled key ("A minor"); "-" when the key is missing
 * and the input unchanged when it is not recognised (it may already be Camelot).
 */
export function keyToCamelot(key: string | undefined | null): string {
  if (!key) return "-";
  const k = key.trim().replace(/\s+/g, " ");
  if (CAMELOT_BY_KEY[k]) return CAMELOT_BY_KEY[k];
  const found = Object.entries(CAMELOT_BY_KEY).find(([std]) => std.toLowerCase() === k.toLowerCase());
  if (found) return found[1];
  const m = k.match(/^([A-G][b#]?)(?:\s+)?(major|minor)$/i);
  if (m) {
    const norm = `${m[1]!.toUpperCase()} ${m[2]!.toLowerCase()}`;
    if (CAMELOT_BY_KEY[norm]) return CAMELOT_BY_KEY[norm];
  }
  return key;
}

/** The Camelot code (`8A`) for a key, or null when the key is missing or unrecognised. */
export function camelotOf(key: string | null | undefined): string | null {
  const camelot = keyToCamelot(key);
  return /^\d{1,2}[AB]$/i.test(camelot) ? camelot.toUpperCase() : null;
}

export function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  } else if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  } else if (parts.length === 1) {
    return parts[0]!;
  }
  return 0;
}

/** `4:02`, or `1:02:03` from an hour up. Negative and non-finite values read as `0:00`. */
export function formatSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function getTrackDurationSeconds(track: Timed): number | null {
  if (typeof track.duration_seconds === "number" && track.duration_seconds > 0) {
    return track.duration_seconds;
  }
  if (track.duration) {
    const parsed = parseDurationToSeconds(track.duration);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

/** The mono meta line under a playing track: `A1 · 134 BPM · 7A`, skipping what's unknown. */
export function trackMetaLine(track: Described | null | undefined): string {
  if (!track) return "";
  const bpm = parseBpm(track.bpm);
  return [
    String(track.position ?? "").trim() || null,
    bpm === null ? null : `${Math.round(bpm)} BPM`,
    camelotOf(track.key),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** `4:02`, or empty when the duration is unknown. */
export function trackDurationLabel(track: Timed): string {
  const seconds = getTrackDurationSeconds(track);
  return seconds === null ? "" : formatSeconds(seconds);
}

/** `20 tracks · 59:58` for the queue header. */
export function queueSummary(tracks: Timed[]): string {
  const total = tracks.reduce((sum, t) => sum + (getTrackDurationSeconds(t) || 0), 0);
  return `${tracks.length} ${tracks.length === 1 ? "track" : "tracks"} · ${formatSeconds(total)}`;
}
