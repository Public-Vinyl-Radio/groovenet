"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { flattenGenreTree, type GenreOption } from "@/lib/genres/options";
import { fetchGenreTree } from "@/services/internalApi/genres";

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
