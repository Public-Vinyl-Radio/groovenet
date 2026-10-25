// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRootFlag } from "./useRootFlag";

const has = () => document.documentElement.hasAttribute("data-flag");

describe("useRootFlag", () => {
  it("sets the attribute on <html> while on, and removes it on unmount", () => {
    const { unmount } = renderHook(() => useRootFlag("data-flag", true));
    expect(has()).toBe(true);
    unmount();
    expect(has()).toBe(false);
  });

  it("does nothing while off, and follows the flag when it changes", () => {
    const { rerender } = renderHook(({ on }) => useRootFlag("data-flag", on), {
      initialProps: { on: false },
    });
    expect(has()).toBe(false);
    rerender({ on: true });
    expect(has()).toBe(true);
    rerender({ on: false });
    expect(has()).toBe(false);
  });
});
