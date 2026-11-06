// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const breakpoint = vi.hoisted(() => ({ mobile: true }));
vi.mock("@chakra-ui/react", () => ({ useBreakpointValue: () => breakpoint.mobile }));

import { TRACK_VIEW_MODE_KEY, useTrackViewMode } from "../useTrackViewMode";

afterEach(() => {
  localStorage.clear();
  breakpoint.mobile = true;
  vi.restoreAllMocks();
});

describe("useTrackViewMode", () => {
  it("defaults to rows, restores a saved choice and saves a new one", () => {
    localStorage.setItem(TRACK_VIEW_MODE_KEY, "card");
    const { result } = renderHook(() => useTrackViewMode());
    expect(result.current.viewMode).toBe("card");
    act(() => result.current.setViewMode("row"));
    expect(localStorage.getItem(TRACK_VIEW_MODE_KEY)).toBe("row");
  });

  it("gives phones cards whatever the saved choice", () => {
    const { result } = renderHook(() => useTrackViewMode());
    expect(result.current.viewMode).toBe("row");
    expect(result.current.layout).toBe("card");
  });

  it("keeps its own key and default, and can let phones show rows", () => {
    localStorage.setItem(TRACK_VIEW_MODE_KEY, "card");
    const { result } = renderHook(() =>
      useTrackViewMode({ storageKey: "own", defaultMode: "card", phonesAlwaysCards: false }),
    );
    expect(result.current.viewMode).toBe("card");
    act(() => result.current.setViewMode("row"));
    expect(localStorage.getItem("own")).toBe("row");
    expect(localStorage.getItem(TRACK_VIEW_MODE_KEY)).toBe("card");
    expect(result.current.layout).toBe("row");
  });

  it("still works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useTrackViewMode({ defaultMode: "card" }));
    expect(result.current.viewMode).toBe("card");
    act(() => result.current.setViewMode("row"));
    expect(result.current.viewMode).toBe("row");
  });
});
