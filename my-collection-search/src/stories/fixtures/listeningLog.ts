import type { SpinListItem } from "@/components/spins/spinSummary";

// Inline so the stories need no network.
export const SAMPLE_ART =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#c2410c"/><circle cx="24" cy="24" r="9" fill="#111"/><circle cx="24" cy="24" r="2" fill="#eee"/></svg>',
  );

let nextId = 100;

/** A logged spin of `tracks` from one record, each `minutes` after the last. */
export function loggedSpin(options: {
  start: string;
  record: string;
  artist: string;
  tracks: Array<[position: string, title: string]>;
  medium?: "vinyl" | "digital";
  minutes?: number;
  art?: boolean;
}): SpinListItem {
  const id = ++nextId;
  const release = `r-${id}`;
  const step = (options.minutes ?? 4) * 60_000;
  return {
    session: {
      id,
      friend_id: 6,
      release_id: release,
      medium: options.medium ?? "vinyl",
      selection_mode: options.medium === "digital" ? "playlist" : "automatic",
      played_at: options.start,
      provenance: options.medium === "digital" ? "playlist" : "automatic",
      confidence: null,
      note: null,
      context_type: null,
      created_at: options.start,
      updated_at: options.start,
    },
    selections: [],
    track_events: options.tracks.map(([position, title], ordinal) => ({
      friend_id: 6,
      release_id: release,
      track_id: `${release}-${position}`,
      played_at: new Date(Date.parse(options.start) + ordinal * step).toISOString(),
      ordinal,
      side_key: position[0],
      position_snapshot: position,
      title_snapshot: title,
      artist_snapshot: options.artist,
      album_snapshot: options.record,
    })),
    album: {
      title: options.record,
      artist: options.artist,
      thumbnail: options.art === false ? null : SAMPLE_ART,
    },
    derived: {
      is_full_album_spin: false,
      selected_side_count: 0,
      album_side_count: 0,
      track_count: options.tracks.length,
    },
  };
}

// Newest first, as the list API returns them: one mixed evening session.
export const EVENING: SpinListItem[] = [
  loggedSpin({
    start: "2026-10-28T02:45:00.000Z",
    record: "La Boa Meets Tony Allen",
    artist: "La Boa (2) Meets Tony Allen",
    tracks: [["A1", "Ale"]],
    medium: "digital",
  }),
  loggedSpin({
    start: "2026-10-28T02:28:00.000Z",
    record: "Innerspeaker",
    artist: "Tame Impala",
    tracks: [
      ["A1", "It Is Not Meant To Be"],
      ["A2", "Desire Be Desire Go"],
      ["A3", "Alter Ego"],
    ],
    minutes: 5,
  }),
  loggedSpin({
    start: "2026-10-28T02:16:00.000Z",
    record: "Cumbia Cumbia Cumbia!!! Vol. 1",
    artist: "Various",
    tracks: [
      ["A1", "Toquen Cumbia"],
      ["A2", "La Pollera Colorá"],
    ],
    minutes: 3,
    art: false,
  }),
];
