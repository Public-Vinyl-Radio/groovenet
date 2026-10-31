// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

const api = vi.hoisted(() => ({ listSpins: vi.fn() }));
vi.mock("@/services/internalApi/spins", () => api);

import { useSpinsInfiniteQuery } from "../useSpinsQuery";

const page = (id: number, next_cursor: string | null) => ({
  items: [{ session: { id } }],
  limit: 1,
  offset: 0,
  next_cursor,
});

function setup(params: Parameters<typeof useSpinsInfiniteQuery>[0], enabled?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useSpinsInfiniteQuery(params, { enabled }), { wrapper }) };
}

describe("useSpinsInfiniteQuery", () => {
  it("follows next_cursor until it is null", async () => {
    api.listSpins.mockReset();
    api.listSpins.mockResolvedValueOnce(page(2, "c1")).mockResolvedValueOnce(page(1, null));
    const { result } = setup({ friend_id: 7, limit: 1, medium: "vinyl" });

    await waitFor(() => expect(result.current.spins).toHaveLength(1));
    expect(api.listSpins).toHaveBeenLastCalledWith({
      friend_id: 7,
      limit: 1,
      medium: "vinyl",
      offset: 0,
      cursor: undefined,
    });
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(api.listSpins).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "c1" }));
    await waitFor(() =>
      expect(result.current.spins.map((spin) => spin.session.id)).toEqual([2, 1]),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it("is keyed by filters but not by the cursor, and can be disabled", async () => {
    api.listSpins.mockReset().mockResolvedValue(page(1, "c1"));
    const params = { friend_id: 7, limit: 1, medium: "digital" as const, from: "a", to: "b" };
    const { client, result } = setup(params);
    await waitFor(() => expect(result.current.spins).toHaveLength(1));
    expect(client.getQueryData(queryKeys.spinsInfinite(params))).toBeDefined();

    api.listSpins.mockClear();
    setup({ friend_id: 8, limit: 1 }, false);
    expect(api.listSpins).not.toHaveBeenCalled();
  });
});
