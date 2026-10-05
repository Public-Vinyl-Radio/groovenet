// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  extractEmbeddedCover: vi.fn(),
  fetchAudioVibeEmbeddingPreview: vi.fn(async () => ({ vibeText: "v" })),
  fetchContextEmbeddingPreview: vi.fn(async () => ({ contextText: "c" })),
  fetchIdentityEmbeddingPreview: vi.fn(async () => ({ identityText: "i" })),
  fetchTrackAudioMetadata: vi.fn(async () => ({})),
  fetchTrackEssentiaData: vi.fn(async () => ({})),
  fetchTrackPlaylists: vi.fn(async () => []),
}));

vi.mock("@/services/internalApi/tracks", () => api);
vi.mock("@/hooks/useTrackByIdQuery", () => ({ useTrackByIdQuery: () => ({ data: undefined }) }));

import { useTrackDetailQueries } from "../useTrackDetailQueries";

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("useTrackDetailQueries", () => {
  it("loads the context embedding preview for the debug modal, keyed by track and friend", async () => {
    const { result } = renderHook(() => useTrackDetailQueries("t1", 6, true), { wrapper });

    await waitFor(() => expect(result.current.contextEmbeddingPreviewQuery.data).toEqual({ contextText: "c" }));
    expect(api.fetchContextEmbeddingPreview).toHaveBeenCalledWith("t1", 6);
    expect(queryClient.getQueryData(["track", "context-embedding-preview", "t1", 6])).toEqual({ contextText: "c" });
  });

  it("does not fetch it without a valid friend", () => {
    renderHook(() => useTrackDetailQueries("t1", 0, false), { wrapper });
    expect(api.fetchContextEmbeddingPreview).not.toHaveBeenCalled();
  });
});
