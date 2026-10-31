// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { HOME_COUNTS } from "@/stories/fixtures/home";
import { OCTOBER_RECAP } from "@/stories/fixtures/spinRecap";
import { CommandPaletteProvider, useCommandPalette } from "@/providers/CommandPaletteProvider";

const friend = vi.hoisted(() => ({ value: { id: 7, username: "dj" } as null | object }));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: friend.value, isHydrated: true }),
}));
vi.mock("@/services/internalApi/home", () => ({ getHome: vi.fn() }));
vi.mock("@/services/internalApi/spins", () => ({ getSpinRecap: vi.fn() }));
// Now playing has its own suite; here it stands for "another section".
vi.mock("@/components/home/HomeNowPlaying", () => ({
  default: () => <section aria-label="Now playing stand-in" />,
}));

import HomePage from "./page";
import { getHome } from "@/services/internalApi/home";
import { getSpinRecap } from "@/services/internalApi/spins";

function PaletteState() {
  const { paletteOpen } = useCommandPalette();
  return <output data-testid="palette">{paletteOpen ? "open" : "closed"}</output>;
}

const renderPage = () =>
  renderWithProviders(
    <CommandPaletteProvider>
      <HomePage />
      <PaletteState />
    </CommandPaletteProvider>,
  );

const home = {
  counts: HOME_COUNTS,
  attention: { missing_audio: 12, missing_bpm_or_key: 0, due_for_cleaning: 3, failed_jobs: 1 },
} as Awaited<ReturnType<typeof getHome>>;

beforeEach(() => {
  friend.value = { id: 7, username: "dj" };
  vi.mocked(getHome).mockReset().mockResolvedValue(home);
  vi.mocked(getSpinRecap).mockReset().mockResolvedValue(OCTOBER_RECAP);
});

describe("HomePage", () => {
  it("renders the header, Now playing and the month card", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeTruthy();
    expect(await screen.findByText("4,044 tracks · 312 albums · 18 playlists")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Now playing stand-in" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /SO FAR$/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "12 tracks missing audio, open Tracks" })).toBeTruthy();
    expect(getHome).toHaveBeenCalledTimes(1);
    expect(getHome).toHaveBeenCalledWith({ friend_id: 7 });
  });

  it("opens the command palette from search", async () => {
    const { user } = renderPage();
    expect(screen.getByTestId("palette").textContent).toBe("closed");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByTestId("palette").textContent).toBe("open");
  });

  it("keeps the other sections when the recap fails", async () => {
    vi.mocked(getSpinRecap).mockRejectedValue(new Error("HTTP 500"));
    renderPage();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Now playing stand-in" })).toBeTruthy();
    expect(await screen.findByText("4,044 tracks · 312 albums · 18 playlists")).toBeTruthy();
  });

  it("keeps the other sections when the summary fails", async () => {
    vi.mocked(getHome).mockRejectedValue(new Error("HTTP 500"));
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Now playing stand-in" })).toBeTruthy();
    expect(await screen.findByText("120")).toBeTruthy();
    expect(screen.queryByTestId("page-header-summary")).toBeNull();
    expect(
      await within(screen.getByRole("region", { name: "NEEDS ATTENTION" })).findByRole("alert"),
    ).toHaveProperty("textContent", "Couldn't load needs attention · HTTP 500");
  });

  it("waits for a library before asking for anything", () => {
    friend.value = null;
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeTruthy();
    expect(getHome).not.toHaveBeenCalled();
    expect(getSpinRecap).not.toHaveBeenCalled();
  });
});
