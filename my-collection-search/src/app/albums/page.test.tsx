// @vitest-environment jsdom
import React from "react";
import { CommandPaletteProvider } from "@/providers/CommandPaletteProvider";
import { PaletteScopeControls } from "@/test/PaletteScopeControls";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const paletteMocks = vi.hoisted(() => ({
  push: vi.fn(),
  params: new URLSearchParams(
    "sort=year_desc&genre=cumbia&genre=salsa&artist=mirlos&missing_audio=1",
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => paletteMocks.params,
  useRouter: () => ({ push: paletteMocks.push, replace: vi.fn() }),
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

it("scoped album search preserves sort and filters", async () => {
  const { user } = renderWithProviders(
    <CommandPaletteProvider>
      <AlbumsPage />
      <PaletteScopeControls />
    </CommandPaletteProvider>,
  );
  await user.click(screen.getByText("Run scoped search"));
  const url = new URL(paletteMocks.push.mock.calls.at(-1)![0], "http://localhost");
  expect(url.pathname).toBe("/albums");
  expect(url.searchParams.get("q")).toBe("dusty");
  expect(url.searchParams.get("sort")).toBe("year_desc");
  expect(url.searchParams.getAll("genre")).toEqual(["cumbia", "salsa"]);
  expect(url.searchParams.get("artist")).toBe("mirlos");
  expect(url.searchParams.get("missing_audio")).toBe("1");
});
