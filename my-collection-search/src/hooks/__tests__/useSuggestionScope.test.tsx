// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ friend: { id: 4, username: "dj" } as { id: number; username: string } | null }));
const api = vi.hoisted(() => ({
  fetchRecommendationSettings: vi.fn(),
  updateRecommendationSettings: vi.fn(),
}));

vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: state.friend }) }));
vi.mock("@/services/internalApi/settings", () => api);

import { useSuggestionScope, useUpdateRecommendationSettings } from "../useSuggestionScope";

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.friend = { id: 4, username: "dj" };
  api.fetchRecommendationSettings.mockReset().mockImplementation(async (friendId: number) => ({
    friend_id: friendId,
    scope: friendId === 4 ? "all" : "library",
    isDefault: false,
  }));
  api.updateRecommendationSettings.mockReset();
});
afterEach(() => cleanup());

describe("useSuggestionScope", () => {
  it("waits for the selected library's saved scope, then uses it", async () => {
    const { result } = renderHook(() => useSuggestionScope(), { wrapper });
    expect(result.current.ready).toBe(false);

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current).toMatchObject({ scope: "all", savedScope: "all", libraryFriendId: 4 });
    expect(api.fetchRecommendationSettings).toHaveBeenCalledWith(4);
  });

  it("lets one view flip the scope without touching the saved setting", async () => {
    const { result } = renderHook(() => useSuggestionScope(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.setScope("library"));

    expect(result.current).toMatchObject({ scope: "library", savedScope: "all" });
    expect(api.updateRecommendationSettings).not.toHaveBeenCalled();
  });

  it("drops the flip when the selected library changes", async () => {
    const { result, rerender } = renderHook(() => useSuggestionScope(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setScope("library"));

    state.friend = { id: 7, username: "other" };
    rerender();

    await waitFor(() => expect(result.current.libraryFriendId).toBe(7));
    await waitFor(() => expect(result.current.ready).toBe(true));
    // Library 7's own saved scope, not the flip made for library 4.
    expect(result.current.scope).toBe("library");
  });

  it("defaults to the library and is ready at once when no library is selected", () => {
    state.friend = null;
    const { result } = renderHook(() => useSuggestionScope(), { wrapper });
    expect(result.current).toMatchObject({ scope: "library", libraryFriendId: undefined, ready: true });
    expect(api.fetchRecommendationSettings).not.toHaveBeenCalled();
  });
});

describe("useUpdateRecommendationSettings", () => {
  it("saves and refreshes the cached setting", async () => {
    api.updateRecommendationSettings.mockResolvedValue({ friend_id: 4, scope: "library", isDefault: false });
    const { result } = renderHook(() => ({ update: useUpdateRecommendationSettings(), scope: useSuggestionScope() }), { wrapper });
    await waitFor(() => expect(result.current.scope.savedScope).toBe("all"));

    await act(() => result.current.update.mutateAsync({ friend_id: 4, scope: "library" }));

    expect(api.updateRecommendationSettings).toHaveBeenCalledWith({ friend_id: 4, scope: "library" });
    await waitFor(() => expect(result.current.scope.savedScope).toBe("library"));
  });
});
