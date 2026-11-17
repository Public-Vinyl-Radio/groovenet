// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_RANKING_CONFIG } from "@/lib/ranking/configs";
import { PRESET_LIST, RANKING_PRESETS } from "@/lib/ranking/profiles";

const mocks = vi.hoisted(() => ({
  friend: { id: 6 } as { id: number } | null,
  list: vi.fn(),
  setActive: vi.fn(),
  copy: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: mocks.friend }) }));
vi.mock("@/services/internalApi/ranking", () => ({
  fetchRankingProfiles: mocks.list,
  setActiveRankingProfile: mocks.setActive,
  copyRankingProfile: mocks.copy,
  createRankingProfile: mocks.create,
  updateRankingProfile: mocks.update,
  deleteRankingProfile: mocks.remove,
}));

import { useRankingProfile, useRankingProfileMutations } from "../useRankingProfiles";

const custom = {
  ...RANKING_PRESETS.selector,
  id: "7",
  kind: "custom" as const,
  name: "Mine",
  surfaces: ["related" as const],
};
const response = {
  friend_id: 6,
  profiles: [...PRESET_LIST, custom, { ...custom, id: "8", invalid: true }],
  active: { suggestions: "default", related: "7", recommendations: "default" },
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.friend = { id: 6 };
  mocks.list.mockResolvedValue(response);
});

describe("useRankingProfile", () => {
  it("ranks with Default before the list loads, then with the surface's profile", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useRankingProfile("related"), { wrapper });
    expect(result.current.config).toEqual(DEFAULT_RANKING_CONFIG);
    await waitFor(() => expect(result.current.profile.id).toBe("7"));
    // Presets plus the one readable profile meant for this surface.
    expect(result.current.options.map((p) => p.id)).toEqual([
      "default",
      "beatmatcher",
      "selector",
      "7",
    ]);
  });

  it("switches at once, keeps the server's answer, and rolls back on failure", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.setActive.mockReturnValue(new Promise((r) => (resolve = r)));
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useRankingProfile("suggestions"), { wrapper });
    await waitFor(() => expect(client.getQueryData(["ranking", "profiles", 6])).toBeDefined());
    expect(result.current.options).toHaveLength(3);

    act(() => void result.current.choose("beatmatcher"));
    await waitFor(() => expect(result.current.profile.id).toBe("beatmatcher"));
    expect(mocks.setActive.mock.calls[0][0]).toEqual({
      friend_id: 6,
      profile_id: "beatmatcher",
      surfaces: ["suggestions"],
    });
    act(() =>
      resolve({ friend_id: 6, active: { ...response.active, suggestions: "beatmatcher" } }),
    );
    await waitFor(() => expect(result.current.profile.id).toBe("beatmatcher"));

    mocks.setActive.mockRejectedValueOnce(new Error("down"));
    act(() => void result.current.choose("selector"));
    await waitFor(() => expect(result.current.profile.id).toBe("beatmatcher"));
  });

  it("does nothing to choose without a library, and switches without a cached list", async () => {
    mocks.friend = null;
    const { wrapper } = setup();
    const { result } = renderHook(() => useRankingProfile("suggestions"), { wrapper });
    act(() => void result.current.choose("selector"));
    expect(mocks.setActive).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("leaves nothing to roll back when a choice fails before the list loaded", async () => {
    mocks.list.mockReturnValue(new Promise(() => {}));
    mocks.setActive.mockRejectedValue(new Error("down"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useRankingProfile("suggestions"), { wrapper });
    act(() => void result.current.choose("selector"));
    await waitFor(() => expect(mocks.setActive).toHaveBeenCalled());
    expect(result.current.profile.id).toBe("default");
  });

  it("keeps working when the server answers before the list loaded", async () => {
    mocks.list.mockReturnValue(new Promise(() => {}));
    mocks.setActive.mockResolvedValue({ friend_id: 6, active: response.active });
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useRankingProfile("suggestions"), { wrapper });
    act(() => void result.current.choose("selector"));
    await waitFor(() => expect(mocks.setActive).toHaveBeenCalled());
    expect(client.getQueryData(["ranking", "profiles", 6])).toBeUndefined();
  });
});

describe("useRankingProfileMutations", () => {
  it("copies, creates, saves and deletes, refreshing the list each time", async () => {
    mocks.copy.mockResolvedValue(custom);
    mocks.create.mockResolvedValue(custom);
    mocks.update.mockResolvedValue(custom);
    mocks.remove.mockResolvedValue({ deleted: true, id: "7" });
    const { wrapper, client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRankingProfileMutations(6), { wrapper });
    const draft = {
      version: 2 as const,
      name: "Mine",
      surfaces: ["related" as const],
      weights: {},
    };
    await act(() => result.current.copy.mutateAsync("selector"));
    await act(() => result.current.create.mutateAsync(draft));
    await act(() => result.current.save.mutateAsync({ id: "7", profile: draft }));
    await act(() => result.current.remove.mutateAsync("7"));
    expect(mocks.copy).toHaveBeenCalledWith("selector", 6);
    expect(mocks.create).toHaveBeenCalledWith(6, draft);
    expect(mocks.update).toHaveBeenCalledWith("7", draft);
    expect(mocks.remove.mock.calls[0][0]).toBe("7");
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["ranking", "profiles", 6] });
  });
});
