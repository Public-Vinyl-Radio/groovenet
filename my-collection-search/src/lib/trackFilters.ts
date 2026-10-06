import { keyToCamelot } from "@/lib/playlistOrder";

export interface TracksFilter {
  missingAudio?: boolean;
  missingAppleMusic?: boolean;
  missingYouTube?: boolean;
  missingSoundCloud?: boolean;
  missingAnyStreamingUrl?: boolean;
  missingMetadata?: boolean;
}

/**
 * Convert TracksFilter state to SQL-style filter expressions used by search API
 * Supports IS NULL, IS NOT NULL, AND, OR operators
 */
export function buildSearchFilters(filters: TracksFilter): string[] {
  const filterStrings: string[] = [];

  // Missing local audio
  if (filters.missingAudio) {
    filterStrings.push("local_audio_url IS NULL");
  }

  // Missing metadata (BPM OR Key)
  if (filters.missingMetadata) {
    filterStrings.push("(bpm IS NULL OR key IS NULL)");
  }

  // Missing ALL streaming URLs
  if (filters.missingAnyStreamingUrl) {
    filterStrings.push(
      "(apple_music_url IS NULL AND youtube_url IS NULL AND soundcloud_url IS NULL)"
    );
  } else {
    // Individual streaming URL filters (only if not using "all" filter)
    if (filters.missingAppleMusic) {
      filterStrings.push("apple_music_url IS NULL");
    }

    if (filters.missingYouTube) {
      filterStrings.push("youtube_url IS NULL");
    }

    if (filters.missingSoundCloud) {
      filterStrings.push("soundcloud_url IS NULL");
    }
  }

  return filterStrings;
}

/**
 * Check if any filters are active
 */
export function hasActiveFilters(filters: TracksFilter): boolean {
  return Object.values(filters).some(Boolean);
}

/**
 * Get count of active filters
 */
export function getActiveFilterCount(filters: TracksFilter): number {
  return Object.values(filters).filter(Boolean).length;
}

/**
 * Create empty filter state
 */
export function createEmptyFilters(): TracksFilter {
  return {
    missingAudio: false,
    missingAppleMusic: false,
    missingYouTube: false,
    missingSoundCloud: false,
    missingAnyStreamingUrl: false,
    missingMetadata: false,
  };
}

/** A missing-data check, as a menu entry and as the chip shown while it's on. */
export interface MissingFilterOption<K extends string = string> {
  key: K;
  label: string;
  chipLabel: string;
  /** Shown under the previous entry, and off while that entry is on. */
  nested?: boolean;
}

/**
 * The tracks page's missing checks, in menu order. The keys double as URL
 * parameters (`missingAudio=1`), so existing links keep working.
 */
export const TRACK_MISSING_OPTIONS: MissingFilterOption<keyof TracksFilter>[] = [
  { key: "missingAudio", label: "Audio", chipLabel: "Missing audio" },
  { key: "missingMetadata", label: "Metadata (BPM/key)", chipLabel: "Missing metadata" },
  { key: "missingAnyStreamingUrl", label: "Any streaming URL", chipLabel: "No streaming URL" },
  { key: "missingAppleMusic", label: "Apple Music", chipLabel: "No Apple Music", nested: true },
  { key: "missingYouTube", label: "YouTube", chipLabel: "No YouTube", nested: true },
  { key: "missingSoundCloud", label: "SoundCloud", chipLabel: "No SoundCloud", nested: true },
];

const STREAMING_KEYS = ["missingAppleMusic", "missingYouTube", "missingSoundCloud"] as const;

/**
 * Flip one missing check. "Any streaming URL" already covers each service, so
 * turning it on clears them rather than leaving checks that do nothing.
 */
export function toggleTracksFilter(filters: TracksFilter, key: keyof TracksFilter): TracksFilter {
  const next = { ...filters, [key]: !filters[key] };
  if (key === "missingAnyStreamingUrl" && next.missingAnyStreamingUrl) {
    STREAMING_KEYS.forEach((k) => (next[k] = false));
  }
  return next;
}

/** The missing checks a URL turns on, read as `toggleTracksFilter` would leave them. */
export function tracksFilterFromParams(params: URLSearchParams | null): TracksFilter {
  const filters = createEmptyFilters();
  TRACK_MISSING_OPTIONS.forEach(({ key }) => (filters[key] = params?.get(key) === "1"));
  if (filters.missingAnyStreamingUrl) STREAMING_KEYS.forEach((k) => (filters[k] = false));
  return filters;
}

/**
 * Attribute filters (#412), named as the search API and the URL name them.
 * Unset fields filter nothing.
 */
export interface TrackAttributeFilters {
  bpm_min?: number;
  bpm_max?: number;
  key?: string;
  star_rating?: number;
}

/** Keys as the library spells them, so an exact match can find them. */
export const MUSICAL_KEYS: string[] = [
  "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
].flatMap((note) => [`${note} major`, `${note} minor`]);

/** A key as DJs read it: Camelot first, e.g. `8A · A minor`. */
export function keyFilterLabel(key: string): string {
  const camelot = keyToCamelot(key);
  return camelot === "-" || camelot === key ? key : `${camelot} · ${key}`;
}

/** Position on the wheel; every key in MUSICAL_KEYS has a code like `8A`. */
function camelotOrder(key: string): number {
  const camelot = keyToCamelot(key);
  return parseInt(camelot, 10) * 2 + (camelot.endsWith("B") ? 1 : 0);
}

/** The key filter's choices, round the Camelot wheel: 1A, 1B, 2A, … 12B. */
export const KEY_FILTER_OPTIONS: { value: string; label: string }[] = [...MUSICAL_KEYS]
  .sort((a, b) => camelotOrder(a) - camelotOrder(b))
  .map((key) => ({ value: key, label: keyFilterLabel(key) }));

function positiveNumber(value: string | null | undefined): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Attribute filters from a URL. Anything the API would reject is dropped
 * rather than sent: a BPM range whose min is above its max, or a rating
 * outside 1–5 (0 filters nothing).
 */
export function attributeFiltersFromParams(params: URLSearchParams | null): TrackAttributeFilters {
  const filters: TrackAttributeFilters = {};
  const bpmMin = positiveNumber(params?.get("bpm_min"));
  const bpmMax = positiveNumber(params?.get("bpm_max"));
  if (bpmMin === undefined || bpmMax === undefined || bpmMin <= bpmMax) {
    if (bpmMin !== undefined) filters.bpm_min = bpmMin;
    if (bpmMax !== undefined) filters.bpm_max = bpmMax;
  }
  const key = params?.get("key")?.trim();
  if (key) filters.key = key;
  const rating = Number(params?.get("star_rating"));
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) filters.star_rating = rating;
  return filters;
}

const ATTRIBUTE_PARAMS = ["bpm_min", "bpm_max", "key", "star_rating"] as const;

/** Write missing checks and attribute filters into `params`, replacing any there. */
export function writeTrackFiltersToParams(
  params: URLSearchParams,
  filters: TracksFilter,
  attributes: TrackAttributeFilters
): void {
  TRACK_MISSING_OPTIONS.forEach(({ key }) => {
    if (filters[key]) params.set(key, "1");
    else params.delete(key);
  });
  ATTRIBUTE_PARAMS.forEach((name) => {
    const value = attributes[name];
    if (value !== undefined) params.set(name, String(value));
    else params.delete(name);
  });
}

const ATTRIBUTE_CHIP_PREFIX = "attr:";

/** One removable chip per attribute filter: the BPM range is a single chip. */
export function attributeFilterChips(
  attributes: TrackAttributeFilters
): { key: string; label: string; active: true }[] {
  const chips: { key: string; label: string; active: true }[] = [];
  const { bpm_min: min, bpm_max: max } = attributes;
  if (min !== undefined || max !== undefined) {
    const label =
      min !== undefined && max !== undefined
        ? min === max ? `${min} BPM` : `${min}–${max} BPM`
        : min !== undefined ? `${min}+ BPM` : `≤${max} BPM`;
    chips.push({ key: `${ATTRIBUTE_CHIP_PREFIX}bpm`, label, active: true });
  }
  if (attributes.key) {
    chips.push({
      key: `${ATTRIBUTE_CHIP_PREFIX}key`,
      label: keyFilterLabel(attributes.key),
      active: true,
    });
  }
  if (attributes.star_rating) {
    chips.push({
      key: `${ATTRIBUTE_CHIP_PREFIX}star_rating`,
      label: `★${attributes.star_rating}+`,
      active: true,
    });
  }
  return chips;
}

/**
 * The attribute filters without the one a chip stands for, or null when the
 * key isn't an attribute chip's.
 */
export function removeAttributeChip(
  attributes: TrackAttributeFilters,
  chipKey: string
): TrackAttributeFilters | null {
  if (!chipKey.startsWith(ATTRIBUTE_CHIP_PREFIX)) return null;
  const next = { ...attributes };
  const name = chipKey.slice(ATTRIBUTE_CHIP_PREFIX.length);
  if (name === "bpm") {
    delete next.bpm_min;
    delete next.bpm_max;
  } else {
    delete next[name as keyof TrackAttributeFilters];
  }
  return next;
}
