import type { SpinRecapResponse } from "@/services/internalApi/spins";

// October 2026, as the recap API returns it: the artboards' sample month.

const HEATMAP = [
  [0, 0, 0, 0, 0, 1, 0, 1, 0, 2, 3, 1],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 4, 5, 2],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 2, 1],
  [0, 0, 0, 0, 0, 1, 0, 0, 1, 2, 3, 2],
  [1, 0, 0, 0, 0, 0, 1, 0, 1, 4, 6, 4],
  [2, 1, 0, 0, 0, 1, 2, 3, 3, 4, 7, 5],
  [1, 0, 0, 0, 1, 2, 3, 4, 2, 2, 1, 1],
];

const BPM = [1, 2, 3, 6, 5, 8, 11, 14, 18, 15, 10, 7];

export const OCTOBER_RECAP: SpinRecapResponse = {
  stats: {
    spins: { value: 120, previous: 104 },
    hours: { value: 8.4, previous: 9.1 },
    records_pulled: { value: 31, previous: 31 },
    new_to_rotation: { value: 6, previous: 2 },
    hours_known_share: 0.92,
    hours_known_spins: 110,
  },
  split: { vinyl: 48, digital: 72 },
  by_week: [
    { week: 1, vinyl: 8, digital: 12 },
    { week: 2, vinyl: 9, digital: 21 },
    { week: 3, vinyl: 12, digital: 12 },
    { week: 4, vinyl: 15, digital: 19 },
    { week: 5, vinyl: 4, digital: 8 },
  ],
  genre_mix: {
    current: [
      { genre_id: "g-latin", name: "Latin", spins: 40.5, share: 0.3375 },
      { genre_id: "g-rock", name: "Rock", spins: 26, share: 0.2167 },
      { genre_id: "g-electronic", name: "Electronic", spins: 19.5, share: 0.1625 },
      { genre_id: "g-hiphop", name: "Hip Hop", spins: 12, share: 0.1 },
      { genre_id: "g-pop", name: "Pop", spins: 10, share: 0.0833 },
      { genre_id: null, name: "Other", spins: 12, share: 0.1 },
    ],
    previous: [
      { genre_id: "g-rock", name: "Rock", spins: 31, share: 0.298 },
      { genre_id: "g-latin", name: "Latin", spins: 25, share: 0.2404 },
      { genre_id: "g-electronic", name: "Electronic", spins: 15, share: 0.1442 },
      { genre_id: "g-hiphop", name: "Hip Hop", spins: 12.5, share: 0.1202 },
      { genre_id: "g-jazz", name: "Jazz", spins: 8.5, share: 0.0817 },
      { genre_id: null, name: "Other", spins: 12, share: 0.1154 },
    ],
  },
  top_records: [
    {
      release_id: "r-algo",
      title: "Algo-Ritmo (Hits 2004–2024)",
      artist: "Mexican Institute Of Sound",
      thumbnail: null,
      spins: 14,
    },
    {
      release_id: "r-inner",
      title: "Innerspeaker",
      artist: "Tame Impala",
      thumbnail: null,
      spins: 11,
    },
    {
      release_id: "r-cumbia",
      title: "Cumbia Cumbia Cumbia!!! Vol. 1",
      artist: "Various",
      thumbnail: null,
      spins: 9,
    },
    {
      release_id: "r-endtro",
      title: "Endtroducing.....",
      artist: "DJ Shadow",
      thumbnail: null,
      spins: 7,
    },
    {
      release_id: "r-mejico",
      title: "Méjico Máxico",
      artist: "Mexican Institute Of Sound",
      thumbnail: null,
      spins: 5,
    },
  ],
  top_tracks: [
    {
      release_id: "r-algo",
      track_id: "r-algo-A1",
      title: "Mirando A Las Muchachas",
      artist: "Mexican Institute Of Sound",
      thumbnail: null,
      spins: 6,
    },
    {
      release_id: "r-algo",
      track_id: "r-algo-A2",
      title: "Tipo Raro",
      artist: "Mexican Institute Of Sound",
      thumbnail: null,
      spins: 5,
    },
    {
      release_id: "r-algo",
      track_id: "r-algo-B1",
      title: "Bolero",
      artist: "Mexican Institute Of Sound",
      thumbnail: null,
      spins: 4,
    },
    {
      release_id: "r-endtro",
      track_id: "r-endtro-B2",
      title: "Napalm Brain / Scatter Brain",
      artist: "DJ Shadow",
      thumbnail: null,
      spins: 3,
    },
    {
      release_id: "r-algo",
      track_id: "r-algo-C1",
      title: "Hiedra Venenosa",
      artist: "Mexican Institute Of Sound",
      thumbnail: null,
      spins: 3,
    },
  ],
  top_artists: [
    { artist: "Mexican Institute Of Sound", spins: 24 },
    { artist: "Tame Impala", spins: 11 },
    { artist: "DJ Shadow", spins: 9 },
    { artist: "Juan Gabriel", spins: 6 },
    { artist: "Meridian Brothers", spins: 4 },
  ],
  heatmap: HEATMAP,
  bpm: {
    histogram: BPM.map((spins, i) => ({ from: 80 + i * 10, to: 90 + i * 10, spins })),
    median: 162,
    busiest: { from: 160, to: 170, spins: 18 },
  },
};

/** A month with no spins: what the API returns before any listening. */
export const EMPTY_RECAP: SpinRecapResponse = {
  stats: {
    spins: { value: 0, previous: 120 },
    hours: { value: 0, previous: 8.4 },
    records_pulled: { value: 0, previous: 31 },
    new_to_rotation: { value: 0, previous: 6 },
    hours_known_share: 0,
    hours_known_spins: 0,
  },
  split: { vinyl: 0, digital: 0 },
  by_week: [1, 2, 3, 4, 5].map((week) => ({ week, vinyl: 0, digital: 0 })),
  genre_mix: {
    current: [{ genre_id: null, name: "Other", spins: 0, share: 0 }],
    previous: OCTOBER_RECAP.genre_mix.current,
  },
  top_records: [],
  top_tracks: [],
  top_artists: [],
  heatmap: Array.from({ length: 7 }, () => Array<number>(12).fill(0)),
  bpm: {
    histogram: BPM.map((_, i) => ({ from: 80 + i * 10, to: 90 + i * 10, spins: 0 })),
    median: null,
    busiest: null,
  },
};
