// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { isStandaloneMode, useStandaloneMode } from "./useStandaloneMode";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
  } else {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
  }
  Object.defineProperty(window.navigator, "standalone", {
    configurable: true,
    value: undefined,
  });
});

describe("isStandaloneMode", () => {
  const mockMatchMedia = (matches: boolean) => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches }),
    });
  };

  it("detects standalone display mode", () => {
    mockMatchMedia(true);
    expect(isStandaloneMode()).toBe(true);
  });

  it("detects iOS home-screen mode", () => {
    mockMatchMedia(false);
    Object.defineProperty(window.navigator, "standalone", {
      configurable: true,
      value: true,
    });
    expect(isStandaloneMode()).toBe(true);
  });

  it("leaves regular browser tabs disabled", () => {
    mockMatchMedia(false);
    expect(isStandaloneMode()).toBe(false);
  });

  it("updates when display mode changes and removes the listener", () => {
    const listener = vi.fn();
    const removeListener = vi.fn();
    const mediaQuery = {
      matches: true,
      addEventListener: (_type: string, callback: () => void) => {
        listener.mockImplementation(callback);
      },
      removeEventListener: removeListener,
    };
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue(mediaQuery),
    });
    const { result, unmount } = renderHook(() => useStandaloneMode());
    expect(result.current).toBe(true);
    mediaQuery.matches = false;
    act(() => listener());
    expect(result.current).toBe(false);
    unmount();
    expect(removeListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("supports older media query listener APIs", () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false, addListener, removeListener }),
    });
    const { unmount } = renderHook(() => useStandaloneMode());
    expect(addListener).toHaveBeenCalledWith(expect.any(Function));
    unmount();
    expect(removeListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it("returns false when evaluated without a browser window", () => {
    vi.stubGlobal("window", undefined);
    expect(isStandaloneMode()).toBe(false);
    vi.unstubAllGlobals();
  });
});
