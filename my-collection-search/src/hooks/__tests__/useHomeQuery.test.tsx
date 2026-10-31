// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

const api = vi.hoisted(() => ({ getHome: vi.fn() }));
vi.mock("@/services/internalApi/home", () => api);

import { useHomeQuery } from "../useHomeQuery";

const clients: QueryClient[] = [];
afterEach(() => {
  // Vitest has no global afterEach, so Testing Library needs explicit cleanup.
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
});

function setup(
  params: Parameters<typeof useHomeQuery>[0],
  options?: Parameters<typeof useHomeQuery>[1],
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useHomeQuery(params, options), { wrapper }) };
}

describe("useHomeQuery", () => {
  it("loads the Home summary under its friend key with default options", async () => {
    const home = { counts: { tracks: 3, albums: 1, playlists: 0 } };
    api.getHome.mockReset().mockResolvedValue(home);
    const { client, result } = setup({ friend_id: 7 });

    expect(result.current.home).toBeNull();
    await waitFor(() => expect(result.current.home).toEqual(home));
    expect(api.getHome).toHaveBeenCalledWith({ friend_id: 7 });
    const key = queryKeys.home({ friend_id: 7 });
    expect(client.getQueryData(key)).toEqual(home);
    expect(key).toEqual(["home", { friend_id: 7 }]);
  });

  it("can be disabled", () => {
    api.getHome.mockReset();
    setup({ friend_id: 0 }, { enabled: false });
    expect(api.getHome).not.toHaveBeenCalled();
  });

  it("uses explicit query options", async () => {
    const home = { counts: {} };
    api.getHome.mockReset().mockResolvedValue(home);
    const { client, result } = setup({ friend_id: 3 }, { staleTime: 123, enabled: true });
    // Wait for React's observable result, not just the earlier cache write.
    await waitFor(() => expect(result.current.home).toEqual(home));
    expect(client.getQueryData(queryKeys.home({ friend_id: 3 }))).toEqual(home);
  });
});
