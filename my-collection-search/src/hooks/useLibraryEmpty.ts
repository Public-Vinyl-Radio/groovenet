"use client";

import { useLibrariesQuery } from "@/hooks/useLibraries";
import { useUsername } from "@/providers/UsernameProvider";

/**
 * Whether the selected library has nothing in it (#1246).
 * - `loading`: the libraries and the default haven't resolved yet, so a spinner is honest.
 * - `empty`: no library is selected yet (a fresh install, before the first import), or the
 *   selected one holds no albums. Both mean the same thing to the person looking.
 * - `ready`: there is something to show; the page loads its own data and its own spinners.
 *
 * Decided from the libraries list, never from a page's search or filters, so a search that
 * matches nothing is not mistaken for an empty library.
 */
export type LibraryEmptiness = "loading" | "empty" | "ready";

export function useLibraryEmpty(): LibraryEmptiness {
  const { friend, isHydrated } = useUsername();
  const libraries = useLibrariesQuery();
  if (!isHydrated) return "loading";
  if (!friend) return "empty";
  const row = libraries.data?.results.find((library) => library.id === friend.id);
  if (row && row.release_count === 0) return "empty";
  return "ready";
}
