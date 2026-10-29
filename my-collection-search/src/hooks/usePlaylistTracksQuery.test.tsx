import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/types/track";

const fetchTracksByIdsMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const setTracksMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/internalApi/tracks", () => ({
  fetchTracksByIds: fetchTracksByIdsMock,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("@/stores/trackStore", () => ({
  useTrackStore: (
    selector: (state: { setTracks: typeof setTracksMock; tracks: Map<string, Track> }) => unknown,
  ) =>
    selector({
      setTracks: setTracksMock,
      tracks: new Map(),
    }),
}));

import { usePlaylistTracksQuery } from "./usePlaylistTracksQuery";

function Harness({ trackRefs }: { trackRefs: { track_id: string; friend_id: number }[] }) {
  usePlaylistTracksQuery(trackRefs, true);
  return null;
}

describe("usePlaylistTracksQuery", () => {
  beforeEach(() => {
    fetchTracksByIdsMock.mockReset();
    useQueryMock.mockReset();
    setTracksMock.mockReset();
    useQueryMock.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: false,
    });
  });

  it("requests vectors for playlist hydration", async () => {
    const trackRefs = [{ track_id: "t1", friend_id: 1 }];

    renderToString(<Harness trackRefs={trackRefs} />);

    expect(useQueryMock).toHaveBeenCalledOnce();
    const queryOptions = useQueryMock.mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
    };

    fetchTracksByIdsMock.mockResolvedValue([]);
    await queryOptions.queryFn();

    expect(fetchTracksByIdsMock).toHaveBeenCalledWith(trackRefs, {
      includeVectors: true,
    });
  });
});
