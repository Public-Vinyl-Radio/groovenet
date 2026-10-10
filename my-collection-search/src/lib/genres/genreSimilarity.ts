/**
 * Pure scoring for "similar genres" (#377): taxonomy position plus how often
 * genres actually co-occur in the collection, counted per distinct album.
 *
 * No I/O here — counts in, a ranked list out — so the scoring rules can be
 * unit-tested on a small fixture without a database.
 */

export type GenreSimilarityTaxonomyNode = {
  id: string;
  parentId: string | null;
};

/** One unordered pair's distinct-album overlap; `genreIdA < genreIdB` is not required. */
export type GenreCoOccurrence = {
  genreIdA: string;
  genreIdB: string;
  sharedAlbums: number;
};

export type GenreSimilarityWeights = {
  /** Fixed contribution for a direct sibling (same parent). */
  taxonomySiblingBase: number;
  /** Fixed, smaller contribution for a direct parent/child pair. */
  taxonomyParentBase: number;
  /** Multiplies the taxonomy base in the combined score. */
  taxonomyWeight: number;
  /** Multiplies `max(npmi, 0)` in the combined score. */
  coOccurrenceWeight: number;
};

export const DEFAULT_GENRE_SIMILARITY_WEIGHTS: GenreSimilarityWeights = {
  taxonomySiblingBase: 1,
  taxonomyParentBase: 0.5,
  taxonomyWeight: 1,
  coOccurrenceWeight: 1,
};

/** "About 3 albums" and "about 20" from the design (#377). */
export const DEFAULT_MIN_SUPPORT_ALBUMS = 3;
export const DEFAULT_TOP_N = 20;

export type GenreSimilaritySignals = {
  taxonomy?: "sibling" | "parent" | "child";
  npmi?: number;
  shared_albums?: number;
};

export type GenreSimilarityEntry = {
  genre_id: string;
  related_genre_id: string;
  score: number;
  signals: GenreSimilaritySignals;
};

export type GenreSimilarityOptions = {
  minSupportAlbums?: number;
  topN?: number;
  weights?: Partial<GenreSimilarityWeights>;
};

/** Every genre's ancestors (parent, grandparent, ...), keyed by id. */
function buildAncestry(genres: GenreSimilarityTaxonomyNode[]): Map<string, Set<string>> {
  const parentOf = new Map(genres.map((g) => [g.id, g.parentId]));
  const ancestry = new Map<string, Set<string>>();
  for (const genre of genres) {
    const ancestors = new Set<string>();
    let parentId = parentOf.get(genre.id) ?? null;
    // A cycle would loop forever; the taxonomy forbids one (genres_no_self_parent
    // and reparenting checks cycles), so this is a defensive bound, not a fix.
    while (parentId && !ancestors.has(parentId)) {
      ancestors.add(parentId);
      parentId = parentOf.get(parentId) ?? null;
    }
    ancestry.set(genre.id, ancestors);
  }
  return ancestry;
}

function isAncestorDescendant(a: string, b: string, ancestry: Map<string, Set<string>>): boolean {
  return ancestry.get(a)?.has(b) === true || ancestry.get(b)?.has(a) === true;
}

/**
 * Normalised PMI, in [-1, 1]. `total` is every album in the collection, not
 * just those tagged with either genre — that is `p(x)`'s denominator too.
 */
export function npmi(sharedAlbums: number, countA: number, countB: number, total: number): number {
  if (total <= 0 || countA <= 0 || countB <= 0 || sharedAlbums <= 0) return 0;
  const pA = countA / total;
  const pB = countB / total;
  const pAB = sharedAlbums / total;
  // pAB <= min(pA, pB) <= 1, so pAB >= 1 forces pA = pB = 1 too: pmi is
  // exactly log(1) = 0 here, never positive, so -log(pAB) would divide by
  // the same zero pmi already is.
  if (pAB >= 1) return 0;
  const pmi = Math.log(pAB / (pA * pB));
  const denom = -Math.log(pAB); // pAB < 1, so this is strictly positive.
  return Math.max(-1, Math.min(1, pmi / denom));
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/**
 * Scores every genre pair worth scoring, and keeps the top `topN` per genre
 * (both directions of each kept pair, so a genre's own related list is a
 * simple lookup by `genre_id`).
 */
export function computeGenreSimilarity(
  genres: GenreSimilarityTaxonomyNode[],
  coOccurrences: GenreCoOccurrence[],
  albumCounts: Map<string, number>,
  totalAlbums: number,
  options: GenreSimilarityOptions = {}
): GenreSimilarityEntry[] {
  const minSupportAlbums = options.minSupportAlbums ?? DEFAULT_MIN_SUPPORT_ALBUMS;
  const topN = options.topN ?? DEFAULT_TOP_N;
  const weights = { ...DEFAULT_GENRE_SIMILARITY_WEIGHTS, ...options.weights };

  const parentOf = new Map(genres.map((g) => [g.id, g.parentId]));
  const ancestry = buildAncestry(genres);
  const coOccurrenceByPair = new Map<string, number>();
  for (const pair of coOccurrences) {
    if (pair.genreIdA === pair.genreIdB) continue;
    coOccurrenceByPair.set(pairKey(pair.genreIdA, pair.genreIdB), pair.sharedAlbums);
  }

  const byGenre = new Map<string, GenreSimilarityEntry[]>();
  const push = (entry: GenreSimilarityEntry) => {
    const list = byGenre.get(entry.genre_id) ?? [];
    list.push(entry);
    byGenre.set(entry.genre_id, list);
  };

  const ids = genres.map((g) => g.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];

      let taxonomyBase = 0;
      let signalForA: GenreSimilaritySignals["taxonomy"];
      let signalForB: GenreSimilaritySignals["taxonomy"];
      const parentA = parentOf.get(a) ?? null;
      const parentB = parentOf.get(b) ?? null;
      if (parentA !== null && parentA === parentB) {
        taxonomyBase = weights.taxonomySiblingBase;
        signalForA = "sibling";
        signalForB = "sibling";
      } else if (parentA === b) {
        taxonomyBase = weights.taxonomyParentBase;
        signalForA = "parent";
        signalForB = "child";
      } else if (parentB === a) {
        taxonomyBase = weights.taxonomyParentBase;
        signalForA = "child";
        signalForB = "parent";
      }

      // Ancestor/descendant pairs always co-occur because of the hierarchy
      // itself, so that signal says nothing new — leave it out, even when
      // the pair also has a direct taxonomy relationship (parent/child).
      let coOccurrenceScore = 0;
      let sharedAlbums: number | undefined;
      let pairNpmi: number | undefined;
      if (!isAncestorDescendant(a, b, ancestry)) {
        const shared = coOccurrenceByPair.get(pairKey(a, b)) ?? 0;
        if (shared >= minSupportAlbums) {
          sharedAlbums = shared;
          pairNpmi = npmi(shared, albumCounts.get(a) ?? 0, albumCounts.get(b) ?? 0, totalAlbums);
          coOccurrenceScore = Math.max(pairNpmi, 0);
        }
      }

      const score = weights.taxonomyWeight * taxonomyBase + weights.coOccurrenceWeight * coOccurrenceScore;
      if (score <= 0) continue;

      const signalsFor = (taxonomy: GenreSimilaritySignals["taxonomy"]): GenreSimilaritySignals => ({
        ...(taxonomy ? { taxonomy } : {}),
        ...(pairNpmi !== undefined ? { npmi: pairNpmi } : {}),
        ...(sharedAlbums !== undefined ? { shared_albums: sharedAlbums } : {}),
      });

      push({ genre_id: a, related_genre_id: b, score, signals: signalsFor(signalForA) });
      push({ genre_id: b, related_genre_id: a, score, signals: signalsFor(signalForB) });
    }
  }

  const result: GenreSimilarityEntry[] = [];
  for (const entries of byGenre.values()) {
    entries.sort((x, y) => y.score - x.score || x.related_genre_id.localeCompare(y.related_genre_id));
    result.push(...entries.slice(0, topN));
  }
  return result;
}
