// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  fetchSimilarTracks: vi.fn(async () => ({ tracks: [] })),
  fetchSimilarVibeTracks: vi.fn(async () => ({ tracks: [] })),
}));
vi.mock("@/services/internalApi/tracks", () => api);

import { useSimilarTracks } from "../useSimilarTracks";
import { useSimilarVibeTracks } from "../useSimilarVibeTracks";

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const keys = () => queryClient.getQueryCache().getAll().map((q) => q.queryKey);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("similarity hooks", () => {
  it("cache identity results per scope and library, so flipping the toggle refetches", async () => {
    const { rerender } = renderHook(
      (scope: "library" | "all") => useSimilarTracks({ track_id: "t", friend_id: 9, scope, library_friend_id: 4 }),
      { wrapper, initialProps: "library" as "library" | "all" }
    );
    await waitFor(() => expect(api.fetchSimilarTracks).toHaveBeenCalledTimes(1));
    rerender("all");
    await waitFor(() => expect(api.fetchSimilarTracks).toHaveBeenCalledTimes(2));

    expect(api.fetchSimilarTracks).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "all", library_friend_id: 4 }));
    expect(keys()).toContainEqual(expect.arrayContaining(["similar-tracks", "all", 4]));
  });

  it("cache vibe results per scope and library", async () => {
    renderHook(() => useSimilarVibeTracks({ track_id: "t", friend_id: 9, scope: "library", library_friend_id: 4 }), { wrapper });
    await waitFor(() => expect(api.fetchSimilarVibeTracks).toHaveBeenCalled());
    expect(keys()).toContainEqual(expect.arrayContaining(["similar-vibe-tracks", "library", 4]));
  });
});
