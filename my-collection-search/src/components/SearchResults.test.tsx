// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  useSearchResults: vi.fn(),
  onQueryChange: vi.fn(),
  track: vi.fn(),
  query: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: { id: 1, username: "dj" }, isHydrated: true }),
}));
vi.mock("@/hooks/useSearchResults", () => ({ useSearchResults: mocks.useSearchResults }));
vi.mock("@/lib/analytics/client", () => ({ analytics: { track: mocks.track } }));
// The result list and its rows have their own tests; here only the controls matter.
vi.mock("@/components/TrackResultStore", () => ({ default: () => null }));
vi.mock("@/components/TrackTableViewWithLoader", () => ({ default: () => null }));
vi.mock("@/components/TrackActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/TrackSelectionBar", () => ({ default: () => null }));

import SearchResults from "./SearchResults";

/** The desktop input: jsdom renders both layouts and only the mobile one is accessible. */
const searchInput = () => screen.getAllByRole("textbox", { hidden: true })[0] as HTMLInputElement;
const lastSearchMode = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].searchMode;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.query = "";
  mocks.useSearchResults.mockImplementation(() => ({
    query: mocks.query,
    onQueryChange: mocks.onQueryChange,
    estimatedResults: 0,
    trackInfo: [],
    playlistCounts: {},
    hasMore: false,
    loadMore: vi.fn(),
    initialLoading: false,
    loadingMore: false,
  }));
});

describe("SearchResults search mode", () => {
  it("starts on keyword search, with no mode in the URL", () => {
    renderWithProviders(<SearchResults />);

    expect(lastSearchMode()).toBe("lexical");
    expect(searchInput().placeholder).toBe("Search");
  });

  it("reads the mode from the URL", () => {
    mocks.searchParams = new URLSearchParams("mode=semantic");
    renderWithProviders(<SearchResults />);
    expect(lastSearchMode()).toBe("semantic");
    expect(searchInput().placeholder).toMatch(/describe a sound/i);
  });

  it("falls back to keyword for an unknown mode in the URL", () => {
    mocks.searchParams = new URLSearchParams("mode=vibes");
    renderWithProviders(<SearchResults />);
    expect(lastSearchMode()).toBe("lexical");
  });

  it("switches mode from the toggle and records it in the URL", async () => {
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(screen.getAllByText("Hybrid")[0]);

    await waitFor(() => expect(lastSearchMode()).toBe("hybrid"));
    expect(mocks.replace).toHaveBeenLastCalledWith("/?mode=hybrid");
  });

  it("drops the mode from the URL on returning to keyword", async () => {
    mocks.searchParams = new URLSearchParams("mode=semantic&q=cumbia");
    mocks.query = "cumbia";
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(screen.getAllByText("Keyword")[0]);

    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/?q=cumbia"));
  });

  it("reports the mode with each executed query", async () => {
    mocks.searchParams = new URLSearchParams("mode=semantic");
    const { user } = renderWithProviders(<SearchResults />);

    await user.type(searchInput(), "brass");

    await waitFor(() =>
      expect(mocks.track).toHaveBeenCalledWith(
        "search_query_executed",
        expect.objectContaining({ query_length: 5, search_mode: "semantic" })
      )
    );
  });
});
