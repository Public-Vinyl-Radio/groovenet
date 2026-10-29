import type { Track } from "./types.js";

/** Largest adjacent BPM change that is not flagged, unless the caller says otherwise. */
export const DEFAULT_BPM_JUMP_THRESHOLD = 8;

/** The fields of a track the check reads; a full `Track` satisfies it. */
export type CheckableTrack = Pick<Track, "track_id" | "bpm" | "key" | "duration_seconds"> &
  Partial<Pick<Track, "title" | "artist">>;

export interface PlaylistCheckOptions {
  /** Adjacent BPM differences strictly above this are flagged. */
  bpmJumpThreshold?: number;
}

export interface BpmPoint {
  /** 1-based position in the playlist. */
  position: number;
  track_id: string;
  bpm: number | null;
}

export interface BpmJump {
  from_position: number;
  to_position: number;
  from_track_id: string;
  to_track_id: string;
  from_bpm: number;
  to_bpm: number;
  /** Signed change, `to_bpm - from_bpm`. */
  delta: number;
}

export interface KeyClash {
  from_position: number;
  to_position: number;
  from_track_id: string;
  to_track_id: string;
  from_key: string;
  to_key: string;
  from_camelot: string;
  to_camelot: string;
}

export interface RepeatedRelease {
  release: string;
  positions: number[];
  track_ids: string[];
}

export interface SideOrderViolation {
  release: string;
  position: number;
  track_id: string;
  /** The earlier track of the same release that this one should have preceded. */
  after_track_id: string;
  reason: string;
}

export interface PlaylistCheck {
  track_count: number;
  total_duration_seconds: number;
  /** Positions (1-based) of tracks with no usable duration; not in the total. */
  missing_duration: number[];
  bpm: {
    threshold: number;
    curve: BpmPoint[];
    jumps: BpmJump[];
    /** Positions (1-based) of tracks with no usable BPM. */
    missing: number[];
  };
  keys: {
    clashes: KeyClash[];
    /** Positions (1-based) of tracks whose key is absent or not recognised. */
    missing: number[];
  };
  repeated_releases: RepeatedRelease[];
  side_order_violations: SideOrderViolation[];
  /** True when nothing was flagged. Missing data alone does not make a playlist fail. */
  ok: boolean;
}

// Camelot number for each pitch class, minor ("A") and major ("B") rings.
const CAMELOT_MINOR: Record<string, number> = {
  "G#": 1,
  "D#": 2,
  "A#": 3,
  F: 4,
  C: 5,
  G: 6,
  D: 7,
  A: 8,
  E: 9,
  B: 10,
  "F#": 11,
  "C#": 12,
};
const CAMELOT_MAJOR: Record<string, number> = {
  B: 1,
  "F#": 2,
  "C#": 3,
  "G#": 4,
  "D#": 5,
  "A#": 6,
  F: 7,
  C: 8,
  G: 9,
  D: 10,
  A: 11,
  E: 12,
};
// Flats folded onto the sharp spelling used above.
const ENHARMONIC: Record<string, string> = {
  AB: "G#",
  BB: "A#",
  DB: "C#",
  EB: "D#",
  GB: "F#",
  CB: "B",
  FB: "E",
  "E#": "F",
  "B#": "C",
};

/**
 * Converts a musical key ("A minor", "Ab major", "F# min", "Am", "8A") to
 * Camelot notation. Returns null for anything not recognised, including a
 * bare note with no mode, which would be a guess.
 */
export function toCamelot(key: string | null | undefined): string | null {
  // Collapse whitespace runs first so the patterns below need at most one optional space.
  const text = key?.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const camelot = /^(1[0-2]|[1-9]) ?([AB])$/i.exec(text);
  if (camelot) return `${Number(camelot[1])}${camelot[2]!.toUpperCase()}`;

  const match = /^([A-G])([#b♯♭]?) ?(major|minor|maj|min|m)$/i.exec(text);
  if (!match) return null;
  const accidental = match[2] === "♯" ? "#" : match[2] === "♭" ? "b" : match[2]!;
  const spelled = `${match[1]!.toUpperCase()}${accidental === "b" ? "B" : accidental}`;
  const note = ENHARMONIC[spelled] ?? spelled;
  const minor = /^m(in(or)?)?$/i.test(match[3]!);
  // Every letter with a sharp, or a flat folded above, is in both tables.
  return `${(minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[note]}${minor ? "A" : "B"}`;
}

/** Same code, a neighbour on the wheel (±1, wrapping 12→1), or the relative major/minor. */
export function camelotCompatible(a: string, b: string): boolean {
  const pa = /^(\d+)([AB])$/.exec(a);
  const pb = /^(\d+)([AB])$/.exec(b);
  if (!pa || !pb) return false;
  const na = Number(pa[1]);
  const nb = Number(pb[1]);
  if (na === nb) return true; // same key, or relative major/minor
  if (pa[2] !== pb[2]) return false;
  const distance = Math.abs(na - nb);
  return distance === 1 || distance === 11;
}

export interface ParsedTrackId {
  release: string;
  /** Upper-case side letter, or null when the suffix is not a vinyl position. */
  side: string | null;
  /** 0 for a bare side letter, which sorts before the numbered tracks on that side. */
  index: number;
}

/** Splits "33416876-D2" into release "33416876", side "D", index 2. */
export function parseTrackId(trackId: string): ParsedTrackId {
  const dash = trackId.indexOf("-");
  if (dash === -1) return { release: trackId, side: null, index: 0 };
  const match = /^([A-Za-z])(\d*)$/.exec(trackId.slice(dash + 1));
  return {
    release: trackId.slice(0, dash),
    side: match ? match[1]!.toUpperCase() : null,
    index: match && match[2] ? Number(match[2]) : 0,
  };
}

/** "A2", or "A" for a bare side letter. */
function position(side: string, index: number): string {
  return `${side}${index || ""}`;
}

function parseBpm(value: Track["bpm"]): number | null {
  const bpm = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

/** Checks an ordered playlist for BPM jumps, key clashes, repeated releases and vinyl side-order mistakes. */
export function checkPlaylist(
  tracks: CheckableTrack[],
  options: PlaylistCheckOptions = {},
): PlaylistCheck {
  const threshold = options.bpmJumpThreshold ?? DEFAULT_BPM_JUMP_THRESHOLD;

  let total = 0;
  const missingDuration: number[] = [];
  const curve: BpmPoint[] = [];
  const missingBpm: number[] = [];
  const camelot: (string | null)[] = [];
  const missingKey: number[] = [];

  tracks.forEach((track, i) => {
    const position = i + 1;
    if (typeof track.duration_seconds === "number" && track.duration_seconds > 0)
      total += track.duration_seconds;
    else missingDuration.push(position);

    const bpm = parseBpm(track.bpm);
    curve.push({ position, track_id: track.track_id, bpm });
    if (bpm === null) missingBpm.push(position);

    const code = toCamelot(track.key);
    camelot.push(code);
    if (code === null) missingKey.push(position);
  });

  const jumps: BpmJump[] = [];
  const clashes: KeyClash[] = [];
  for (let i = 1; i < tracks.length; i++) {
    const from = curve[i - 1]!;
    const to = curve[i]!;
    if (from.bpm !== null && to.bpm !== null && Math.abs(to.bpm - from.bpm) > threshold) {
      jumps.push({
        from_position: from.position,
        to_position: to.position,
        from_track_id: from.track_id,
        to_track_id: to.track_id,
        from_bpm: from.bpm,
        to_bpm: to.bpm,
        delta: Math.round((to.bpm - from.bpm) * 100) / 100,
      });
    }
    const fromCode = camelot[i - 1];
    const toCode = camelot[i];
    if (fromCode && toCode && !camelotCompatible(fromCode, toCode)) {
      clashes.push({
        from_position: i,
        to_position: i + 1,
        from_track_id: tracks[i - 1]!.track_id,
        to_track_id: tracks[i]!.track_id,
        from_key: tracks[i - 1]!.key!,
        to_key: tracks[i]!.key!,
        from_camelot: fromCode,
        to_camelot: toCode,
      });
    }
  }

  const byRelease = new Map<string, number[]>();
  const lastPlayed = new Map<string, { side: string; index: number; track_id: string }>();
  const violations: SideOrderViolation[] = [];
  tracks.forEach((track, i) => {
    const { release, side, index } = parseTrackId(track.track_id);
    byRelease.set(release, [...(byRelease.get(release) ?? []), i]);
    if (side === null) return;

    const last = lastPlayed.get(release);
    let reason: string | null = null;
    if (last && side < last.side)
      reason = `side ${side} comes after side ${last.side} was already played`;
    else if (last && side === last.side && index < last.index)
      reason = `${position(side, index)} comes after ${position(last.side, last.index)} on the same side`;
    if (reason) {
      violations.push({
        release,
        position: i + 1,
        track_id: track.track_id,
        after_track_id: last!.track_id,
        reason,
      });
    } else {
      lastPlayed.set(release, { side, index, track_id: track.track_id });
    }
  });

  const repeated: RepeatedRelease[] = [];
  for (const [release, indices] of byRelease) {
    if (indices.length > 1) {
      repeated.push({
        release,
        positions: indices.map((i) => i + 1),
        track_ids: indices.map((i) => tracks[i]!.track_id),
      });
    }
  }

  return {
    track_count: tracks.length,
    total_duration_seconds: total,
    missing_duration: missingDuration,
    bpm: { threshold, curve, jumps, missing: missingBpm },
    keys: { clashes, missing: missingKey },
    repeated_releases: repeated,
    side_order_violations: violations,
    ok:
      jumps.length === 0 &&
      clashes.length === 0 &&
      repeated.length === 0 &&
      violations.length === 0,
  };
}

/** Formats seconds as H:MM:SS, or M:SS under an hour. */
export function formatDurationHms(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
