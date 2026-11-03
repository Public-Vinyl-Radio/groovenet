// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ fetchLibraries: vi.fn(), lookupDiscogsUser: vi.fn() }));
vi.mock("@/services/internalApi/friends", () => ({ fetchLibraries: api.fetchLibraries }));
vi.mock("@/services/internalApi/discogs", () => ({ lookupDiscogsUser: api.lookupDiscogsUser }));

import { useDiscogsUserLookup, useLibrariesQuery } from "./useLibraries";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

beforeEach(() => vi.resetAllMocks());

describe("useLibrariesQuery", () => {
  it("loads the libraries", async () => {
    const body = { results: [], account_username: "owner" };
    api.fetchLibraries.mockResolvedValue(body);
    const { result } = renderHook(() => useLibrariesQuery(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toEqual(body));
  });
});

describe("useDiscogsUserLookup", () => {
  it("does nothing until a username is submitted", () => {
    const { result } = renderHook(() => useDiscogsUserLookup(null), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.lookupDiscogsUser).not.toHaveBeenCalled();
  });

  it("looks the submitted username up once, and again only on request", async () => {
    api.lookupDiscogsUser.mockResolvedValue({ username: "dj", found: true, release_count: 3 });
    const { result } = renderHook(() => useDiscogsUserLookup("dj"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.found).toBe(true));
    expect(api.lookupDiscogsUser).toHaveBeenCalledTimes(1);
    expect(api.lookupDiscogsUser).toHaveBeenCalledWith("dj");
    await act(() => result.current.refetch());
    expect(api.lookupDiscogsUser).toHaveBeenCalledTimes(2);
  });

  it("surfaces a failed lookup without retrying it", async () => {
    api.lookupDiscogsUser.mockRejectedValue(new Error("Discogs lookup failed: HTTP 429"));
    const client = new QueryClient();
    const { result } = renderHook(() => useDiscogsUserLookup("dj"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.lookupDiscogsUser).toHaveBeenCalledTimes(1);
  });
});
