// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PLAYLISTS_VIEW_MODE_KEY, usePlaylistsViewMode } from "../usePlaylistsViewMode";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("usePlaylistsViewMode", () => {
  it("defaults to cards", () => {
    const { result } = renderHook(() => usePlaylistsViewMode());
    expect(result.current.viewMode).toBe("cards");
  });

  it("restores a saved choice", () => {
    localStorage.setItem(PLAYLISTS_VIEW_MODE_KEY, "list");
    const { result } = renderHook(() => usePlaylistsViewMode());
    expect(result.current.viewMode).toBe("list");
  });

  it("ignores an unknown saved value", () => {
    localStorage.setItem(PLAYLISTS_VIEW_MODE_KEY, "grid");
    const { result } = renderHook(() => usePlaylistsViewMode());
    expect(result.current.viewMode).toBe("cards");
  });

  it("saves a new choice", () => {
    const { result } = renderHook(() => usePlaylistsViewMode());
    act(() => result.current.setViewMode("list"));
    expect(result.current.viewMode).toBe("list");
    expect(localStorage.getItem(PLAYLISTS_VIEW_MODE_KEY)).toBe("list");
  });

  it("still works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => usePlaylistsViewMode());
    act(() => result.current.setViewMode("list"));
    expect(result.current.viewMode).toBe("list");
  });
});
