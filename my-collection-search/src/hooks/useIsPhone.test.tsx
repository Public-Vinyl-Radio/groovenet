// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsPhone } from "./useIsPhone";

const real = window.matchMedia;
afterEach(() => {
  window.matchMedia = real;
});

describe("useIsPhone", () => {
  it("follows the media query", () => {
    let listener = () => {};
    let matches = true;
    window.matchMedia = (() => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, fn: () => void) => (listener = fn),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => useIsPhone());
    expect(result.current).toBe(true);
    matches = false;
    act(() => listener());
    expect(result.current).toBe(false);
  });

  it("is false without matchMedia", () => {
    // @ts-expect-error simulating an environment without it
    window.matchMedia = undefined;
    const { result } = renderHook(() => useIsPhone());
    expect(result.current).toBe(false);
  });
});
