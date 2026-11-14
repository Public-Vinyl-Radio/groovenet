/**
 * Candidate texts for #1170. Node 26+ (imports the app's TS normalization).
 *
 * Identity (similar tracks) and context (natural-language retrieval) each get:
 *   0   current text, composer populated (the baseline)
 *   G   + the file's own genre (`audio_file_genre`)
 *   L   + a local-model lyric summary
 *   GL  + both
 * A track with no lyrics, or whose summary failed validation, gets no lyric
 * line, so its L text equals its baseline text.
 */
import {
  combineGenres,
  formatList,
  normalizeComposer,
  normalizeCountry,
  normalizeLabels,
  normalizeList,
  normalizeLocalTags,
  normalizeStyles,
  yearToEra,
} from "../../my-collection-search/src/lib/identity-normalization.ts";
import { contextLyricsSentence, identityLyricsLine } from "./summary.mjs";

export const VARIANTS = ["I0", "IG", "IL", "IGL", "C0", "CG", "CL", "CGL"];

/** Mirrors `buildIdentityData` in `src/lib/identity-embedding.ts`. */
export function identityData(track, album = {}) {
  return {
    title: (track.title || "unknown").trim(),
    artist: (track.artist || "unknown").trim(),
    album: (track.album || "unknown").trim(),
    era: yearToEra(track.year),
    country: normalizeCountry(album.country),
    labels: normalizeLabels(album.label ? album.label.split(",") : []).sort(),
    composers: normalizeComposer(track.composer).sort(),
    genres: combineGenres(album.genres || track.genres, null, 8).sort(),
    styles: normalizeStyles(album.styles || track.styles, 12).sort(),
    tags: normalizeLocalTags(track.local_tags, 12).sort(),
  };
}

/**
 * The file's genres, normalised like Discogs genres, minus any the identity
 * data already carries as a genre or style: a file genre of `Reggae` on a
 * Discogs `Reggae` release adds no information.
 */
export function fileGenres(track, data) {
  const known = new Set([...data.genres, ...data.styles]);
  return normalizeList(track.audio_file_genre ?? [])
    .filter((g) => !known.has(g))
    .slice(0, 4)
    .sort();
}

const list = (items, empty) => (items.length ? formatList(items) : empty);

/** Mirrors `buildIdentityText`; extras go after `Tags:` so the baseline lines stay put. */
export function identityText(d, { fileGenre = [], lyrics = null } = {}) {
  return [
    `Track: ${d.title} — ${d.artist}`,
    `Release: ${d.album} (${d.era})`,
    d.composers.length ? `Composer: ${formatList(d.composers)}` : null,
    `Country: ${d.country}`,
    `Labels: ${list(d.labels, "none")}`,
    `Genres: ${list(d.genres, "unknown")}`,
    `Styles: ${list(d.styles, "unknown")}`,
    `Tags: ${list(d.tags, "none")}`,
    fileGenre.length ? `File genre: ${formatList(fileGenre)}` : null,
    lyrics ? identityLyricsLine(lyrics) : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Mirrors `buildContextText`. File genres join the broad genres in the
 * descriptor sentence; the lyric sentence follows it, before the identifiers.
 */
export function contextText(d, { fileGenre = [], lyrics = null } = {}) {
  const descriptors = [...new Set([...d.styles, ...d.tags])];
  const genres = [...d.genres, ...fileGenre];
  const broad = genres.length ? `${formatList(genres)} music` : "music";
  const era = d.era === "unknown-era" ? "" : ` from the ${d.era}`;
  const summary = `${broad}${era}.`;
  const first = descriptors.length ? `${formatList(descriptors)}. ${summary}` : summary;
  return [
    lyrics ? `${first} ${contextLyricsSentence(lyrics)}` : first,
    `Track: ${d.title} — ${d.artist}`,
    `Release: ${d.album}`,
    `Labels: ${list(d.labels, "none")}`,
  ].join("\n");
}

export function variants(track, album, summary = null) {
  const d = identityData(track, album);
  const g = { fileGenre: fileGenres(track, d) };
  const l = { lyrics: summary };
  const gl = { ...g, ...l };
  return {
    I0: identityText(d),
    IG: identityText(d, g),
    IL: identityText(d, l),
    IGL: identityText(d, gl),
    C0: contextText(d),
    CG: contextText(d, g),
    CL: contextText(d, l),
    CGL: contextText(d, gl),
  };
}
