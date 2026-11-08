// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  fetchLiveSet: vi.fn(),
  createSetForPlaylist: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/services/internalApi/playlists", () => ({
  fetchLiveSet: api.fetchLiveSet,
  createSetForPlaylist: api.createSetForPlaylist,
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: api.toast } }));

import { useLiveSet } from "./useLiveSet";

beforeEach(() => vi.clearAllMocks());

describe("useLiveSet", () => {
  it("loads the set", async () => {
    api.fetchLiveSet.mockResolvedValue({ title: "Friday" });
    const { result } = renderHook(() => useLiveSet(3));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.set).toEqual({ title: "Friday" });
    expect(api.fetchLiveSet).toHaveBeenCalledWith(3);
  });

  it("is not a set when the load fails, and skips loading without a playlist", async () => {
    api.fetchLiveSet.mockRejectedValue(new Error("404"));
    const { result } = renderHook(() => useLiveSet(3));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.set).toBeNull();

    const none = renderHook(() => useLiveSet(undefined));
    await act(async () => {
      await none.result.current.load();
      await none.result.current.create();
    });
    expect(none.result.current.loading).toBe(false);
    expect(api.fetchLiveSet).toHaveBeenCalledTimes(1);
    expect(api.createSetForPlaylist).not.toHaveBeenCalled();
  });

  it("creates the set, then reloads it", async () => {
    api.fetchLiveSet.mockRejectedValueOnce(new Error("404"));
    api.createSetForPlaylist.mockResolvedValue({});
    const { result } = renderHook(() => useLiveSet(3));
    await waitFor(() => expect(result.current.loading).toBe(false));
    api.fetchLiveSet.mockResolvedValue({ title: "New" });
    await act(async () => {
      await result.current.create();
    });
    expect(api.createSetForPlaylist).toHaveBeenCalledWith(3);
    expect(result.current.set).toEqual({ title: "New" });
  });

  it("says so when creating fails", async () => {
    api.fetchLiveSet.mockRejectedValue(new Error("404"));
    api.createSetForPlaylist.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useLiveSet(3));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create();
    });
    expect(api.toast).toHaveBeenCalledWith({ title: "Could not create set", type: "error" });
    expect(result.current.set).toBeNull();
  });
});
