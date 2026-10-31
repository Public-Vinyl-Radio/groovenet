// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { DisplayTimeZoneProvider, useDisplayTimeZone } from "./DisplayTimeZoneProvider";

describe("useDisplayTimeZone", () => {
  it("defaults to UTC without a provider", () => {
    const { result } = renderHook(() => useDisplayTimeZone());
    expect(result.current).toBe("UTC");
  });

  it("returns the zone the provider was given", () => {
    const { result } = renderHook(() => useDisplayTimeZone(), {
      wrapper: ({ children }) => (
        <DisplayTimeZoneProvider timeZone="America/Los_Angeles">{children}</DisplayTimeZoneProvider>
      ),
    });
    expect(result.current).toBe("America/Los_Angeles");
  });
});
