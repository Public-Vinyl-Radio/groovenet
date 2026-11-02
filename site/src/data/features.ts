// The landing page's Features section (#938): three lead cards with a visual,
// then a grid of smaller cards, each a link to its docs page. Copy is from
// the design, with card 03 revised in #938: no multi-room or Sonos-style claims.
import type { ScreenshotKey } from "./screenshots";

const docs = {
  spins: "/docs/vinyl-tracking/spins/",
  setSheets: "/docs/using/playlists/#print-a-set-sheet",
  playback: "/docs/using/server-players/",
  setRecordings: "/docs/vinyl-tracking/set-recordings/",
  analysis: "/docs/using/analysis/",
  optimiser: "/docs/using/playlists/",
  similar: "/docs/using/similar-tracks/",
  genres: "/docs/using/genres/",
  enrichment: "/docs/using/enrichment/",
  recordCare: "/docs/using/record-care/",
  home: "/docs/using/home/",
};

/**
 * A lead card's visual: a screenshot in a phone frame or on its own, or an
 * HTML stand-in drawn in Features.astro until its screenshot exists (#939).
 */
export type LeadVisual =
  | { shot: ScreenshotKey; frame: "phone" | "plain" }
  | { standIn: "setSheet" | "playOn" };

export interface LeadFeature {
  kicker: string;
  title: string;
  body: string;
  href: string;
  visual: LeadVisual;
}

export interface GridFeature {
  title: string;
  body: string;
  href: string;
  /**
   * A screenshot thumbnail, shown at `zoom` times the card's width. `focus` is
   * the point of the shot, in percent across and down, the crop centres on.
   */
  thumb?: { shot: ScreenshotKey; zoom: number; focus: [number, number] };
  /** A 24 × 24 stroke icon's path, for cards without a thumbnail. */
  icon?: string;
}

export const leadFeatures: LeadFeature[] = [
  {
    kicker: "01 · Spin logging",
    title: "Vinyl play tracking",
    body: "Every record you play, logged automatically. A listener next to the turntable recognises each record from its sound, matched against your own library, and logs the spin. A monthly recap shows what you actually played.",
    href: docs.spins,
    visual: { shot: "phoneSpinsByMode", frame: "phone" },
  },
  {
    kicker: "02 · Set sheets",
    title: "Pull a set in minutes",
    body: "Export a playlist as a PDF with each record’s shelf ID and track position, plus BPM, key and length. Pulling a four-hour set, finding records in the crate at the venue and re-shelving them used to take hours.",
    href: docs.setSheets,
    visual: { standIn: "setSheet" },
  },
  {
    kicker: "03 · Playback",
    title: "Your library, streamed from the server, with a shared queue",
    body: "Music plays from your server to your speakers, not from your phone, so it keeps going when you lock the phone or leave the room. Everyone in the room can add to and reorder the same queue. Play on lets any phone or laptop join a player or take over from another device, and OwnTone sends the music to AirPlay speakers.",
    href: docs.playback,
    visual: { standIn: "playOn" },
  },
];

export const gridFeatures: GridFeature[] = [
  {
    title: "Set recordings → tracklists",
    body: "Record a set; see what played and how it differed from the plan.",
    href: docs.setRecordings,
    icon: "M4 6h11M4 11h11M4 16h7M19 4v11.5M19 15.5a2.5 2.5 0 1 1-2.5-2.5H19",
  },
  {
    title: "Audio analysis you can trust",
    body: "BPM, key and mood, with a confidence score and a warning when the key is uncertain.",
    href: docs.analysis,
    icon: "M5 20v-7M11 20V5M17 20v-10M3 20h18",
  },
  {
    title: "Playlist optimiser",
    body: "Reorders a crate for smooth BPM and key transitions.",
    href: docs.optimiser,
    thumb: { shot: "desktopOptimiser", zoom: 2.5, focus: [88, 19] },
  },
  {
    title: "Find similar, two ways",
    body: "“Sounds like this” or same artist, label, era or genre, plus natural-language search.",
    href: docs.similar,
    icon: "M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
  },
  {
    title: "Genre taxonomy",
    body: "Your tags mapped onto real genres, with pages, neighbours and crates to build.",
    href: docs.genres,
    thumb: { shot: "desktopGenresByMode", zoom: 2.5, focus: [17, 2] },
  },
  {
    title: "Enrichment and downloads",
    body: "A wizard fills in missing metadata and fetches audio for analysis.",
    href: docs.enrichment,
    thumb: { shot: "desktopEnrichment", zoom: 2.5, focus: [54, 20] },
  },
  {
    title: "Record care",
    body: "Cleaning and condition, logged per copy.",
    href: docs.recordCare,
    icon: "M12 3c3 4.5 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 3-6.5 6-11z",
  },
  {
    title: "Home dashboard",
    body: "Now playing, new arrivals and what needs attention.",
    href: docs.home,
    icon: "M4 11l8-7 8 7v9h-5v-6h-6v6H4z",
  },
];

export const trustPoints = ["Self-hosted", "MIT license", "Restic backups", "Analytics off switch"];
