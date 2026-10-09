// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PullToRefreshIndicator from "./PullToRefreshIndicator";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: reduced }),
  });
}

describe("PullToRefreshIndicator", () => {
  it("stays hidden before a gesture begins", () => {
    setReducedMotion(false);
    render(<PullToRefreshIndicator distance={0} refreshing={false} />);
    expect(screen.getByRole("status", { name: "Pull to refresh" }).style.opacity).toBe("0");
  });

  it("shows gesture progress and honors reduced motion", () => {
    setReducedMotion(true);
    render(<PullToRefreshIndicator distance={32} refreshing={false} />);
    const indicator = screen.getByRole("status", { name: "Pull to refresh" });
    expect(indicator.style.opacity).toBe("1");
    expect(indicator.style.transition).toBe("none");
  });

  it("shows an animated refresh state when motion is allowed", () => {
    setReducedMotion(false);
    render(<PullToRefreshIndicator distance={72} refreshing />);
    const indicator = screen.getByRole("status", { name: "Refreshing" });
    expect(indicator.querySelector("svg")?.style.animation).toContain("pull-to-refresh-spin");
  });
});
