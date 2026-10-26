// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { renderHook } from "@testing-library/react";
import { deviceLabel, useDeviceLabel } from "@/lib/deviceLabel";

describe("deviceLabel", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5, "This iPhone"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5, "This iPad"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 5, "This iPad"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 0, "This Mac"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari", 5, "This phone"],
    ["Mozilla/5.0 (Linux; Android 14; SM-X710) Safari", 5, "This tablet"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0, "This computer"],
    ["Something else", undefined, "This device"],
  ])("%s (%s touch points) is %s", (userAgent, maxTouchPoints, label) => {
    expect(deviceLabel({ userAgent, maxTouchPoints })).toBe(label);
  });

  it("falls back without a navigator, and reads the browser's", () => {
    expect(deviceLabel(undefined)).toBe("This device");
    expect(renderHook(useDeviceLabel).result.current).toMatch(/^This /);
    const Label = () => React.createElement("span", null, useDeviceLabel());
    expect(renderToString(React.createElement(Label))).toContain("This device");
  });
});
