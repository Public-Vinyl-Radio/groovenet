// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("next/navigation", () => ({ usePathname: () => "/chore" }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ playlistLength: 0 }),
}));
vi.mock("@/providers/CommandPaletteProvider", () => ({
  useCommandPalette: () => ({ setPaletteOpen: vi.fn() }),
}));
vi.mock("@/components/CommandPalette", () => ({ default: () => null }));
const standaloneMode = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useStandaloneMode", () => ({
  useStandaloneMode: () => standaloneMode.value,
}));

import AppShell from "./AppShell";

describe("AppShell", () => {
  afterEach(() => {
    standaloneMode.value = false;
  });

  it("links to the record-care chores", () => {
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);

    const links = screen.getAllByRole("link", { name: /Chores/, hidden: true });
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.getAttribute("href") === "/chore")).toBe(true);
  });

  it("invalidates active data when a standalone app returns to the foreground", () => {
    standaloneMode.value = true;
    const { queryClient } = renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const originalVisibilityState = document.visibilityState;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(invalidate).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(invalidate).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: originalVisibilityState,
    });
  });
});
