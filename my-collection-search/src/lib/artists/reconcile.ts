import type { ArtistReconcileResponse, ArtistReviewItem } from "@groovenet/contracts";
import { artistNames, type ImportArtistCredit } from "@/lib/artists/importCredits";
import { normaliseArtistName } from "@/lib/artists/normalization";

/**
 * Separators that may join two artists in one string. `Y` and `X` are part of
 * names (`Fruko Y Sus Tesos`), so they are not here. Nothing is split on these:
 * a match only sends the string to review (#705).
 */
const SEPARATOR = /,|&|\/|\bfeat(?:uring|\.|\b)|\bft\.|\s+and\s+|\s+with\s+/i;
const PLACEHOLDER = /^(various(?: artists)?|unknown artist)$/i;
const INVERSION = /,\s*the\s*$/i;

/** A string-only credit that may be a collaboration, after un-inverting `Name, The`. */
export function needsReview(creditedAs: string): boolean {
  const { name } = artistNames(creditedAs);
  return !PLACEHOLDER.test(name) && SEPARATOR.test(name);
}

export type Baseline = ArtistReconcileResponse["baseline"];

/** The prod numbers from the epic (#700), over album artist strings. */
export function albumArtistBaseline(artists: string[]): Baseline {
  const spellings = new Map<string, Set<string>>();
  for (const artist of artists) {
    const key = normaliseArtistName(artist);
    if (!spellings.has(key)) spellings.set(key, new Set());
    spellings.get(key)!.add(artist);
  }
  const distinct = new Set(artists);
  const placeholder = (pattern: RegExp) =>
    artists.filter((a) => pattern.test(artistNames(a).name)).length;
  return {
    albums: artists.length,
    distinct_strings: distinct.size,
    spelling_groups: [...spellings.values()].filter((s) => s.size > 1).length,
    inversions: [...distinct].filter((a) => INVERSION.test(a)).length,
    various: placeholder(/^various(?: artists)?$/i),
    unknown_artist: placeholder(/^unknown artist$/i),
  };
}

/** Counts for the review queue, one entry per exact credit string. */
export class ReviewQueue {
  private items = new Map<string, ArtistReviewItem>();
  constructor(private reviewed = new Set<string>()) {}

  add(creditedAs: string, kind: "album" | "track", count = 1): void {
    if (this.reviewed.has(normaliseArtistName(creditedAs)) || !needsReview(creditedAs)) return;
    const item = this.items.get(creditedAs) ?? { credited_as: creditedAs, albums: 0, tracks: 0 };
    if (kind === "album") item.albums += count;
    else item.tracks += count;
    this.items.set(creditedAs, item);
  }

  /** Most-used first, then by name, so the output is stable. */
  list(): ArtistReviewItem[] {
    return [...this.items.values()].sort(
      (a, b) =>
        b.albums + b.tracks - (a.albums + a.tracks) || a.credited_as.localeCompare(b.credited_as),
    );
  }
}

export type KnownArtists = {
  discogsIds: Iterable<string>;
  /** Every alias, and whether its artist has a Discogs id. */
  aliases: Iterable<{ alias_normalized: string; has_discogs_id: boolean }>;
};

/**
 * Predicts how each credit resolves, in the order the import repository
 * matches: Discogs id, then a normalised name or alias, then a new artist.
 * Run in processing order, a new artist is known to every later credit.
 */
export class ArtistResolutionTally {
  readonly counts: ArtistReconcileResponse["artists"] = {
    matched_by_discogs_id: 0,
    matched_by_name: 0,
    created: 0,
  };
  private discogsIds: Set<string>;
  private aliases: Map<string, boolean>;

  constructor(known: KnownArtists) {
    this.discogsIds = new Set(known.discogsIds);
    this.aliases = new Map(
      [...known.aliases].map((a) => [a.alias_normalized, a.has_discogs_id] as const),
    );
  }

  add(credit: ImportArtistCredit): void {
    const id = credit.discogs_artist_id;
    const key = normaliseArtistName(credit.name);
    const aliasKey = normaliseArtistName(credit.credited_as) || key;
    if (id && this.discogsIds.has(id)) {
      this.counts.matched_by_discogs_id++;
    } else if (this.aliases.has(key) && (!id || this.aliases.get(key) === false)) {
      this.counts.matched_by_name++;
      // The import fills a missing Discogs id onto the matched artist.
      if (id) this.discogsIds.add(id);
      if (id) this.aliases.set(key, true);
    } else {
      this.counts.created++;
      if (id) this.discogsIds.add(id);
      this.aliases.set(key, this.aliases.get(key) ?? Boolean(id));
    }
    if (!this.aliases.has(aliasKey)) this.aliases.set(aliasKey, Boolean(id));
  }
}
