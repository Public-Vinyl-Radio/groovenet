// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

const api = vi.hoisted(() => ({ getSpinTrackStats: vi.fn() }));
vi.mock("@/services/internalApi/spins", () => api);

import { useSpinTrackStatsQuery } from "../useSpinsQuery";

function setup(params: Parameters<typeof useSpinTrackStatsQuery>[0], enabled?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useSpinTrackStatsQuery(params, { enabled }), { wrapper }) };
}

describe("useSpinTrackStatsQuery", () => {
  it("loads the track's stats under the spins root", async () => {
    const stats = { play_count: 4, last_played_at: "2026-10-27T19:38:00.000Z" };
    api.getSpinTrackStats.mockReset().mockResolvedValue(stats);
    const { client, result } = setup({ friend_id: 7, track_id: "t1" });

    expect(result.current.stats).toBeNull();
    await waitFor(() => expect(result.current.stats).toEqual(stats));
    expect(api.getSpinTrackStats).toHaveBeenCalledWith({ friend_id: 7, track_id: "t1" });
    const key = queryKeys.spinTrackStats({ friend_id: 7, track_id: "t1" });
    expect(client.getQueryData(key)).toEqual(stats);
    // A logged, edited or deleted spin invalidates the spins root, so this refreshes.
    expect(key.slice(0, 1)).toEqual(queryKeys.spinsRoot());
  });

  it("returns a never-spun track's zero count", async () => {
    const stats = { play_count: 0, last_played_at: null };
    api.getSpinTrackStats.mockReset().mockResolvedValue(stats);
    const { result } = setup({ friend_id: 7, track_id: "t2" });
    await waitFor(() => expect(result.current.stats).toEqual(stats));
  });

  it("can be disabled", () => {
    api.getSpinTrackStats.mockReset();
    setup({ friend_id: 7, track_id: "" }, false);
    expect(api.getSpinTrackStats).not.toHaveBeenCalled();
  });
});
