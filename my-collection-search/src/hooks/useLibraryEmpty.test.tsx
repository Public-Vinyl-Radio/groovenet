// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const state = vi.hoisted(() => ({
  friend: null as { id: number } | null,
  hydrated: true,
  results: undefined as { id: number; release_count: number }[] | undefined,
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: state.friend, isHydrated: state.hydrated }),
}));
vi.mock("@/hooks/useLibraries", () => ({
  useLibrariesQuery: () => ({ data: state.results ? { results: state.results } : undefined }),
}));

import { useLibraryEmpty } from "./useLibraryEmpty";

beforeEach(() => {
  state.friend = { id: 7 };
  state.hydrated = true;
  state.results = [{ id: 7, release_count: 3 }];
});

describe("useLibraryEmpty", () => {
  it("is loading until the libraries and the default have resolved", () => {
    state.hydrated = false;
    state.friend = null;
    expect(renderHook(() => useLibraryEmpty()).result.current).toBe("loading");
  });

  it("is empty when no library is selected: a fresh install, before the first import", () => {
    state.friend = null;
    state.results = undefined;
    expect(renderHook(() => useLibraryEmpty()).result.current).toBe("empty");
  });

  it("is empty when the selected library holds no albums", () => {
    state.results = [{ id: 7, release_count: 0 }];
    expect(renderHook(() => useLibraryEmpty()).result.current).toBe("empty");
  });

  it("is ready when the selected library has albums", () => {
    expect(renderHook(() => useLibraryEmpty()).result.current).toBe("ready");
  });

  it("stays ready while the counts load, so a slow request keeps the page's own spinner", () => {
    state.results = undefined;
    expect(renderHook(() => useLibraryEmpty()).result.current).toBe("ready");
  });

  it("stays ready for a library the list doesn't know", () => {
    state.results = [{ id: 99, release_count: 0 }];
    expect(renderHook(() => useLibraryEmpty()).result.current).toBe("ready");
  });
});
