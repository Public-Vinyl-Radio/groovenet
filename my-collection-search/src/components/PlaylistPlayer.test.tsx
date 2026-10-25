// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
const playlist = vi.hoisted(() => ({ length: 0 }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ playlistLength: playlist.length }),
}));
vi.mock("@/components/PlayerControls", () => ({ default: () => <div>controls</div> }));
vi.mock("@/components/QueueDrawer", () => ({ default: () => null }));

import PlaylistPlayer from "./PlaylistPlayer";

const hasPlayerFlag = () => document.documentElement.hasAttribute("data-player");

describe("PlaylistPlayer", () => {
  afterEach(() => {
    pathname.value = "/";
    playlist.length = 0;
  });

  it("renders nothing and leaves --player-h at 0 while the queue is empty", () => {
    renderWithProviders(<PlaylistPlayer />);
    expect(screen.queryByTestId("floating-player")).toBeNull();
    expect(hasPlayerFlag()).toBe(false);
  });

  it("flags <html> while the player shows, so --player-h becomes 70px, and clears it on unmount", () => {
    playlist.length = 2;
    const { unmount } = renderWithProviders(<PlaylistPlayer />);
    expect(screen.getByTestId("floating-player")).toBeTruthy();
    expect(hasPlayerFlag()).toBe(true);
    unmount();
    expect(hasPlayerFlag()).toBe(false);
  });

  it("sits on the tab bar on mobile, edge to edge, with no hard shadow", () => {
    playlist.length = 2;
    renderWithProviders(<PlaylistPlayer />);
    const classes = [...screen.getByTestId("floating-player").classList];
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .filter((text) => classes.some((c) => text.includes(`.${c}`)))
      .join("\n");
    expect(css).toMatch(/bottom:\s*var\(--tabbar-h\)/);
    expect(css).toMatch(/box-shadow:\s*none/);
  });
});
