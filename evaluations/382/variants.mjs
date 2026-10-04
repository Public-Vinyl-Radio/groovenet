/**
 * Candidate embedding texts for #382. Pure functions over one snapshot track and
 * its album; Node 26+ (imports the app's TS normalization directly).
 *
 * A   current identity text (the #379 builder, which mirrors the app)
 * A2  A with Unicode-aware normalization and tag splitting
 * D   A2 without identifier lines (title, artist, album, labels)
 * E   D rendered as one descriptive sentence, without release country
 * F   E plus the identifier lines, to see whether similarity needs them
 */
import { yearToEra, filterIdentityTags } from '../../my-collection-search/src/lib/identity-normalization.ts';
import { identityText } from '../379/prepare.mjs';

export const VARIANTS = ['A', 'A2', 'D', 'E', 'F'];

/**
 * The app's `normalizeToken` keeps only ASCII `\w`, so it deletes accented
 * letters (`amazónica` → `amaznica`), `&`, and non-ASCII dashes (`jazz‑rock`
 * → `jazzrock`). This folds them instead, and treats hyphens as spaces so
 * `trip-hop` and `trip hop` are one token.
 */
export function foldToken(token) {
  return token
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Split a list field into folded, de-duplicated tokens. Local tags arrive as
 * free text, so `/` and `;` separate values as well as `,` (`Soul / funk`),
 * and a stray Postgres array literal (`{}`, `{a,b}`) is unwrapped.
 */
export function foldList(items) {
  if (!items) return [];
  const raw = Array.isArray(items) ? items : [String(items).replace(/^\{(.*)\}$/s, '$1')];
  const tokens = raw
    .filter((item) => typeof item === 'string')
    .flatMap((item) => item.split(/[,/;|]/))
    .map((item) => foldToken(item.replace(/^"|"$/g, '')))
    .filter((item) => item.length > 0);
  return [...new Set(tokens)];
}

/** Discogs genres are whole values (`Folk, World, & Country`); never split them on commas. */
function foldGenres(genres) {
  if (!Array.isArray(genres)) return foldList(genres);
  return [...new Set(genres.filter((g) => typeof g === 'string').map(foldToken).filter(Boolean))];
}

/** Same caps and fallbacks as `buildIdentityData`, with folded tokens. */
export function foldedFields(track, album = {}) {
  const tags = foldList(track.local_tags).filter((tag) => filterIdentityTags([tag]).length > 0);
  return {
    title: (track.title || 'unknown').trim(),
    artist: (track.artist || 'unknown').trim(),
    album: (track.album || 'unknown').trim(),
    era: yearToEra(track.year),
    country: album.country ? foldToken(album.country) || 'unknown-country' : 'unknown-country',
    labels: foldList(album.label).slice(0, 3).sort(),
    composers: foldList(track.composer).filter((c) => c !== 'unknown' && c !== 'various').sort(),
    genres: foldGenres(album.genres || track.genres).slice(0, 8).sort(),
    styles: foldList(album.styles || track.styles).slice(0, 12).sort(),
    tags: tags.slice(0, 12).sort(),
  };
}

const list = (items, empty) => (items.length ? items.join(', ') : empty);

function identityLines(f) {
  return [
    `Track: ${f.title} — ${f.artist}`,
    `Release: ${f.album}`,
    `Labels: ${list(f.labels, 'none')}`,
  ];
}

export function textA2(f) {
  return [
    `Track: ${f.title} — ${f.artist}`,
    `Release: ${f.album} (${f.era})`,
    f.composers.length ? `Composer: ${f.composers.join(', ')}` : null,
    `Country: ${f.country}`,
    `Labels: ${list(f.labels, 'none')}`,
    `Genres: ${list(f.genres, 'unknown')}`,
    `Styles: ${list(f.styles, 'unknown')}`,
    `Tags: ${list(f.tags, 'none')}`,
  ].filter(Boolean).join('\n');
}

export function textD(f) {
  return [
    `Era: ${f.era}`,
    `Country: ${f.country}`,
    `Genres: ${list(f.genres, 'unknown')}`,
    `Styles: ${list(f.styles, 'unknown')}`,
    `Tags: ${list(f.tags, 'none')}`,
  ].join('\n');
}

/**
 * One sentence: the specific descriptors first, then the broad genres and era.
 * Release country is left out: it is where a pressing was released (229 of 409
 * albums in the #379 snapshot are `US`), not where the music is from.
 */
export function textE(f) {
  const descriptors = [...new Set([...f.styles, ...f.tags])];
  const known = f.era !== 'unknown-era';
  const genres = f.genres.length ? `${f.genres.join(', ')} music` : 'music';
  const tail = `${genres}${known ? ` from the ${f.era}` : ''}.`;
  return descriptors.length ? `${descriptors.join(', ')}. ${tail}` : tail;
}

export function textF(f) {
  return [textE(f), ...identityLines(f)].join('\n');
}

export function variants(track, album) {
  const f = foldedFields(track, album);
  return { A: identityText(track, album), A2: textA2(f), D: textD(f), E: textE(f), F: textF(f) };
}
