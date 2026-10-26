import type { TrackSearchMode } from "@/api-contract/schemas";

export const SEARCH_MODE_ITEMS: { value: TrackSearchMode; label: string }[] = [
  { value: "lexical", label: "Keyword" },
  { value: "hybrid", label: "Hybrid" },
  { value: "semantic", label: "Semantic" },
];

export const SEARCH_MODE_PLACEHOLDERS: Record<TrackSearchMode, string> = {
  lexical: "Search",
  hybrid: "Search, or describe a sound",
  semantic: "Describe a sound, e.g. dusty 70s cumbia with brass",
};

export function isTrackSearchMode(value: string | null | undefined): value is TrackSearchMode {
  return SEARCH_MODE_ITEMS.some((item) => item.value === value);
}
