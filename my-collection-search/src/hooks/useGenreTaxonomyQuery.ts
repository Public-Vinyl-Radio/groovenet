"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { flattenGenreTree, type GenreOption } from "@/lib/genres/options";
import { fetchGenreTree } from "@/services/internalApi/genres";
import { buildGenreLookup, type GenreLookup } from "@/lib/genres/links";
import type { GenreTreeNode } from "@/api-contract/schemas";

// The taxonomy is small and changes only through admin edits, so one fetch
// serves every picker on the page for a while.
const STALE_TIME = 5 * 60_000;

/** Every taxonomy genre as a flat, pickable list. */
export function useGenreTaxonomyQuery(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: queryKeys.genreTree(),
    queryFn: fetchGenreTree,
    staleTime: STALE_TIME,
    enabled: options?.enabled ?? true,
  });
  const genres = useMemo<GenreOption[]>(
    () => (query.data ? flattenGenreTree(query.data) : []),
    [query.data]
  );
  return { ...query, genres };
}

// One lookup per fetched tree, however many badge rows ask for it.
const lookupCache = new WeakMap<GenreTreeNode[], GenreLookup>();
const EMPTY_LOOKUP: GenreLookup = new Map();

/**
 * Taxonomy names and aliases → slugs, for linking raw genre badges (#376).
 * Empty until the taxonomy loads, so badges render plain rather than wait.
 */
export function useGenreLookup(): GenreLookup {
  const { data } = useQuery({
    queryKey: queryKeys.genreTree(),
    queryFn: fetchGenreTree,
    staleTime: STALE_TIME,
  });
  if (!data) return EMPTY_LOOKUP;
  let lookup = lookupCache.get(data);
  if (!lookup) {
    lookup = buildGenreLookup(data);
    lookupCache.set(data, lookup);
  }
  return lookup;
}
