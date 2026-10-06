// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchTrackGenreFacets = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/tracks", () => ({ fetchTrackGenreFacets }));

import { useTrackGenreFacets } from "../useTrackGenreFacets";

function render(params: Parameters<typeof useTrackGenreFacets>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTrackGenreFacets(params), { wrapper });
}

describe("useTrackGenreFacets", () => {
  beforeEach(() => {
    fetchTrackGenreFacets.mockReset().mockResolvedValue({
      genres: [{ id: "latin", track_count: 3 }],
    });
  });

  it("maps the counts by genre id", async () => {
    const { result } = render({ q: "dub", filter: "friend_id = 6", enabled: true });
    await waitFor(() => expect(result.current.counts).toEqual(new Map([["latin", 3]])));
    expect(fetchTrackGenreFacets).toHaveBeenCalledWith({ q: "dub", filter: "friend_id = 6" });
  });

  it("counts within the BPM, key and rating filters (#447)", async () => {
    render({ q: "", attributes: { bpm_min: 120, key: "A minor" }, enabled: true });
    await waitFor(() =>
      expect(fetchTrackGenreFacets).toHaveBeenCalledWith({
        q: "",
        filter: undefined,
        bpm_min: 120,
        key: "A minor",
      })
    );
  });

  it("fetches nothing and has no counts while disabled", () => {
    const { result } = render({ q: "dub", enabled: false });
    expect(result.current.counts).toBeUndefined();
    expect(fetchTrackGenreFacets).not.toHaveBeenCalled();
  });
});
