// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

const api = vi.hoisted(() => ({ getHome: vi.fn() }));
vi.mock("@/services/internalApi/home", () => api);

import { useHomeQuery } from "../useHomeQuery";

function setup(params: Parameters<typeof useHomeQuery>[0], enabled?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useHomeQuery(params, { enabled }), { wrapper }) };
}

describe("useHomeQuery", () => {
  it("loads the Home summary under its friend key", async () => {
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
    setup({ friend_id: 0 }, false);
    expect(api.getHome).not.toHaveBeenCalled();
  });
});

it("uses explicit query options", async () => {
  api.getHome.mockResolvedValue({ counts: {} });
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useHomeQuery({ friend_id: 3 }, { staleTime: 123, enabled: true }), { wrapper });
  await waitFor(() =>
    expect(client.getQueryData(queryKeys.home({ friend_id: 3 }))).toEqual({ counts: {} }),
  );
});

it("loads with default options", async () => {
  api.getHome.mockResolvedValue({ counts: {} });
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useHomeQuery({ friend_id: 4 }), { wrapper });
  await waitFor(() =>
    expect(client.getQueryData(queryKeys.home({ friend_id: 4 }))).toEqual({ counts: {} }),
  );
});
