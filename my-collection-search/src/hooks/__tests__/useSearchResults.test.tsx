// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const searchTracks = vi.hoisted(() => vi.fn());
const setTracks = vi.hoisted(() => vi.fn());

vi.mock("@/services/internalApi/tracks", () => ({
  searchTracks,
  fetchPlaylistCounts: vi.fn(async () => ({})),
}));
vi.mock("@/stores/trackStore", () => ({ useTrackStore: () => ({ setTracks }) }));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: { id: 1, username: "dj" } }),
}));

import { useSearchResults } from "../useSearchResults";

let queryClient: QueryClient;

function renderSearch(options: Parameters<typeof useSearchResults>[0]) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSearchResults(options), { wrapper });
}

const trackKeys = () =>
  queryClient
    .getQueryCache()
    .getAll()
    .map((q) => q.queryKey)
    .filter((key) => key[0] === "tracks");

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  searchTracks.mockReset().mockResolvedValue({
    hits: [{ track_id: "t1", friend_id: 1 }],
    estimatedTotalHits: 1,
    offset: 0,
    limit: 20,
    processingTimeMs: 1,
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useSearchResults searchMode", () => {
  it("sends the mode and keys the cache by it, in infinite mode", async () => {
    const { result } = renderSearch({ searchMode: "semantic" });
    act(() => result.current.setQuery("dusty cumbia"));

    await waitFor(() =>
      expect(searchTracks).toHaveBeenCalledWith(
        expect.objectContaining({ q: "dusty cumbia", offset: 0, mode: "semantic" })
      )
    );
    expect(trackKeys()).toContainEqual(
      ["tracks", expect.objectContaining({ q: "dusty cumbia", searchMode: "semantic" })]
    );
    // One page: nothing more to load.
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.hasMore).toBe(false);
  });

  it("sends the mode in page mode too", async () => {
    renderSearch({ mode: "page", page: 1, searchMode: "hybrid" });

    await waitFor(() =>
      expect(searchTracks).toHaveBeenCalledWith(expect.objectContaining({ mode: "hybrid", offset: 0 }))
    );
    expect(trackKeys()).toContainEqual(["tracks", expect.objectContaining({ page: 1, searchMode: "hybrid" })]);
  });

  it("defaults to keyword, leaving the cache key as it was", async () => {
    renderSearch({});

    await waitFor(() =>
      expect(searchTracks).toHaveBeenCalledWith(expect.objectContaining({ mode: "lexical" }))
    );
    for (const [, args] of trackKeys()) expect(args).not.toHaveProperty("searchMode");
  });
});

describe("useSearchResults genres (#375)", () => {
  it("sends the genres and keys the cache by them", async () => {
    renderSearch({ genres: ["cumbia"] });

    await waitFor(() =>
      expect(searchTracks).toHaveBeenCalledWith(expect.objectContaining({ genre: ["cumbia"] }))
    );
    expect(trackKeys()[0][1]).toMatchObject({ genre: ["cumbia"] });
  });

  it("sends them in page mode too", async () => {
    renderSearch({ genres: ["salsa"], mode: "page" });
    await waitFor(() =>
      expect(searchTracks).toHaveBeenCalledWith(expect.objectContaining({ genre: ["salsa"] }))
    );
  });

  it("leaves the cache key as it was without genres", async () => {
    renderSearch({ genres: [] });
    await waitFor(() => expect(searchTracks).toHaveBeenCalled());
    expect(trackKeys()[0][1]).not.toHaveProperty("genre");
  });
});

describe("useSearchResults attribute filters (#447)", () => {
  const attributes = { bpm_min: 120, bpm_max: 126, key: "A minor", star_rating: 4 };

  it("sends the attributes and keys the cache by them", async () => {
    renderSearch({ attributes });
    await waitFor(() =>
      expect(searchTracks).toHaveBeenCalledWith(expect.objectContaining(attributes))
    );
    expect(trackKeys()[0][1]).toMatchObject({ attributes });
  });

  it("sends them in page mode too", async () => {
    renderSearch({ attributes: { key: "C major" }, mode: "page" });
    await waitFor(() =>
      expect(searchTracks).toHaveBeenCalledWith(expect.objectContaining({ key: "C major" }))
    );
    expect(trackKeys()[0][1]).toMatchObject({ attributes: { key: "C major" } });
  });

  it("leaves the cache key as it was with no attribute set", async () => {
    renderSearch({ attributes: { bpm_min: undefined } });
    await waitFor(() => expect(searchTracks).toHaveBeenCalled());
    expect(trackKeys()[0][1]).not.toHaveProperty("attributes");
  });
});
