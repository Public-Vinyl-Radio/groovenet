// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ listSpins: vi.fn(), listTopSpinTracks: vi.fn() }));
vi.mock("@/services/internalApi/spins", () => api);

import { ALBUM_SPINS_PAGE, useAlbumSpins } from "./useAlbumSpins";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createQueryWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useAlbumSpins", () => {
  it("loads one page of the album's spins", async () => {
    api.listSpins.mockResolvedValue({
      items: [{ session: { id: 1 } }],
      limit: ALBUM_SPINS_PAGE,
      offset: 0,
    });
    const { result } = renderHook(() => useAlbumSpins("rel", 7), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.spins).toHaveLength(1));
    expect(api.listSpins).toHaveBeenCalledWith({
      friend_id: 7,
      release_id: "rel",
      limit: ALBUM_SPINS_PAGE,
      offset: 0,
    });
  });

  it("waits for a library", () => {
    api.listSpins.mockClear();
    renderHook(() => useAlbumSpins("rel", 0), { wrapper: createQueryWrapper() });
    expect(api.listSpins).not.toHaveBeenCalled();
  });
});
