// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: { id: 7 }, isHydrated: true }),
}));
vi.mock("@/hooks/useGenreTaxonomyQuery", () => ({ useGenreTaxonomyQuery: () => ({ genres: [] }) }));
vi.mock("@/components/AlbumSearchResults", () => ({ default: () => <div>results</div> }));
vi.mock("@/components/FilterChips", () => ({ default: () => null }));
vi.mock("@/components/GenreFilter", () => ({
  default: () => null,
  IncludeSimilarToggle: () => null,
  SelectedGenreTags: () => null,
  INCLUDE_SIMILAR_CHIP_KEY: "include-similar",
  addedGenreChips: () => [],
  genreFilterChips: () => [],
  genreSlugFromChipKey: () => null,
  includeSimilarChips: () => [],
  similarGenreIdFromChipKey: () => null,
}));

import AlbumsPage from "./page";

describe("AlbumsPage", () => {
  it("titles the page through the shared header", async () => {
    renderWithProviders(<AlbumsPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Albums" })).toBeTruthy();
    expect(screen.getByText("results")).toBeTruthy();
  });
});
