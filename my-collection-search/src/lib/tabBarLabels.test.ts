// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  readTabBarLabels,
  resetTabBarLabels,
  useTabBarLabels,
  useTabBarLabelsFlag,
  writeTabBarLabels,
} from "./tabBarLabels";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetTabBarLabels();
  document.documentElement.removeAttribute("data-tabbar-labels");
});

describe("tab bar labels storage", () => {
  it("defaults to always", () => {
    expect(readTabBarLabels()).toBe("always");
  });

  it("falls back to always for an unknown stored value", () => {
    localStorage.setItem("tabbar-labels", "sometimes");
    expect(readTabBarLabels()).toBe("always");
  });

  it("falls back to always when reading throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readTabBarLabels()).toBe("always");
  });

  it("persists a choice", () => {
    writeTabBarLabels("never");
    expect(localStorage.getItem("tabbar-labels")).toBe("never");
    expect(readTabBarLabels()).toBe("never");
  });

  it("keeps the choice for the session when writing throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useTabBarLabels());
    act(() => result.current[1]("selected"));
    expect(result.current[0]).toBe("selected");
  });

  it("updates subscribers and reacts to storage events", () => {
    const { result } = renderHook(() => useTabBarLabels());
    expect(result.current[0]).toBe("always");
    act(() => result.current[1]("never"));
    expect(result.current[0]).toBe("never");
    localStorage.setItem("tabbar-labels", "selected");
    act(() => {
      window.dispatchEvent(new Event("storage"));
    });
    expect(result.current[0]).toBe("selected");
  });
});

describe("useTabBarLabelsFlag", () => {
  it("sets data-tabbar-labels on <html> and removes it on unmount", () => {
    const { rerender, unmount } = renderHook(({ v }) => useTabBarLabelsFlag(v), {
      initialProps: { v: "never" as "always" | "selected" | "never" },
    });
    expect(document.documentElement.getAttribute("data-tabbar-labels")).toBe("never");
    rerender({ v: "selected" });
    expect(document.documentElement.getAttribute("data-tabbar-labels")).toBe("selected");
    unmount();
    expect(document.documentElement.hasAttribute("data-tabbar-labels")).toBe(false);
  });
});
