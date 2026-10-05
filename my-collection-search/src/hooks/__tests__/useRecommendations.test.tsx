// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Track } from "@/types/track";

const fetchCandidates = vi.hoisted(() => vi.fn());
const fetchTracksByIds = vi.hoisted(() => vi.fn());
const selected = vi.hoisted(() => ({ friend: { id: 4, username: "dj" } as { id: number; username: string } | null }));

vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: selected.friend }) }));
vi.mock("@/services/internalApi/recommendations", () => ({ fetchRecommendationCandidates: fetchCandidates }));
vi.mock("@/services/internalApi/tracks", () => ({ fetchTracksByIds }));

import useRecommendations, { toSeeds, useRecommendationsQuery } from "../useRecommendations";

const track = (track_id: string, friend_id?: number) => ({ track_id, friend_id }) as Track;

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  selected.friend = { id: 4, username: "dj" };
  fetchCandidates.mockReset().mockResolvedValue({
    candidates: [
      { trackId: "c1", friendId: 4, simIdentity: 0.9, simAudio: null },
      { trackId: "gone", friendId: 4, simIdentity: 0.8, simAudio: null },
    ],
  });
  fetchTracksByIds.mockReset().mockResolvedValue([{ track_id: "c1", friend_id: 4, title: "One" }]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("toSeeds", () => {
  it("keeps each seed in its own library, filling in only when it has none", () => {
    expect(toSeeds([track("a", 9), track("b"), track("a", 9)], 4)).toEqual([
      { track_id: "a", friend_id: 9 },
      { track_id: "b", friend_id: 4 },
    ]);
  });

  it("drops a seed with no library at all", () => {
    expect(toSeeds([track("a")])).toEqual([]);
  });
});

describe("useRecommendationsQuery", () => {
  it("asks for the given scope and library and hydrates the results", async () => {
    const { result } = renderHook(
      () => useRecommendationsQuery([track("seed", 9)], 20, { scope: "library", libraryFriendId: 4 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(fetchCandidates).toHaveBeenCalledWith({
      tracks: [{ track_id: "seed", friend_id: 9 }],
      limit_identity: 20,
      limit_audio: 20,
      scope: "library",
      library_friend_id: 4,
    });
    expect(result.current.data?.[0]).toMatchObject({ track_id: "c1", _simIdentity: 0.9, _simAudio: null });
  });

  it("defaults the library to the selected one and leaves the scope to the saved setting", async () => {
    renderHook(() => useRecommendationsQuery([track("seed", 9)]), { wrapper });
    await waitFor(() => expect(fetchCandidates).toHaveBeenCalled());
    expect(fetchCandidates.mock.calls[0][0]).toEqual({
      tracks: [{ track_id: "seed", friend_id: 9 }],
      limit_identity: 50,
      limit_audio: 50,
      library_friend_id: 4,
    });
  });

  it("sends no library when none is selected, so the server uses the seed's", async () => {
    selected.friend = null;
    renderHook(() => useRecommendationsQuery([track("seed", 9)]), { wrapper });
    await waitFor(() => expect(fetchCandidates).toHaveBeenCalled());
    expect(fetchCandidates.mock.calls[0][0]).not.toHaveProperty("library_friend_id");
  });

  it("waits while disabled", () => {
    renderHook(() => useRecommendationsQuery([track("seed", 9)], 20, { enabled: false }), { wrapper });
    expect(fetchCandidates).not.toHaveBeenCalled();
  });

  it("returns nothing when the request fails", async () => {
    fetchCandidates.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useRecommendationsQuery([track("seed", 9)]), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("skips hydration when there are no candidates", async () => {
    fetchCandidates.mockResolvedValue({});
    const { result } = renderHook(() => useRecommendationsQuery([track("seed", 9)]), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(fetchTracksByIds).not.toHaveBeenCalled();
  });
});

describe("useRecommendations", () => {
  it("gets suggestions for a playlist under the selected library's saved setting", async () => {
    const { result } = renderHook(() => useRecommendations(), { wrapper });

    await expect(result.current(10, [track("seed", 9)])).resolves.toHaveLength(1);
    expect(fetchCandidates).toHaveBeenCalledWith({
      tracks: [{ track_id: "seed", friend_id: 9 }],
      limit_identity: 10,
      limit_audio: 10,
      library_friend_id: 4,
    });
  });

  it("returns nothing for an empty playlist or a failed request", async () => {
    const { result } = renderHook(() => useRecommendations(), { wrapper });
    await expect(result.current()).resolves.toEqual([]);
    fetchCandidates.mockRejectedValue(new Error("down"));
    await expect(result.current(10, [track("seed", 9)])).resolves.toEqual([]);
  });
});
