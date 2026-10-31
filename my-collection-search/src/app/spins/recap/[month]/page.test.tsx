// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import type { SpinRecapResponse } from "@/services/internalApi/spins";
import { EMPTY_RECAP, OCTOBER_RECAP } from "@/stories/fixtures/spinRecap";

const user = vi.hoisted(() => ({
  value: { friend: { id: 7 }, isHydrated: true } as {
    friend: { id: number } | null;
    isHydrated: boolean;
  },
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => user.value }));

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const hooks = vi.hoisted(() => ({
  recap: {
    recap: null as SpinRecapResponse | null,
    isLoading: false,
    error: null as Error | null,
  },
  useSpinRecapQuery: vi.fn(),
}));
vi.mock("@/hooks/useSpinsQuery", () => ({
  useSpinRecapQuery: (...args: unknown[]) => {
    hooks.useSpinRecapQuery(...args);
    return hooks.recap;
  },
}));

import SpinRecapRoute, { generateMetadata } from "./page";
import SpinRecapPage from "@/components/spins/SpinRecapPage";

// 05:00 UTC on Nov 1 is still Oct 31 in Los Angeles.
const NOW = new Date("2026-11-01T05:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("GROOVENET_TIME_ZONE", "America/Los_Angeles");
  user.value = { friend: { id: 7 }, isHydrated: true };
  nav.push.mockReset();
  hooks.recap = { recap: OCTOBER_RECAP, isLoading: false, error: null };
  hooks.useSpinRecapQuery.mockReset();
  setViewportWidth(390);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function renderRecap(month = "2026-10") {
  return renderWithProviders(
    <DisplayTimeZoneProvider timeZone="America/Los_Angeles">
      <SpinRecapPage month={month} />
    </DisplayTimeZoneProvider>,
  );
}

const href = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");

describe("the recap route", () => {
  const params = (month: string) => ({ params: Promise.resolve({ month }) });

  it.each(["2026-13", "october", "2026-1", "0000-01"])("404s a malformed month (%s)", async (m) => {
    await expect(SpinRecapRoute(params(m))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s a month that hasn't started in the configured zone", async () => {
    // Already November in UTC, still October in Los Angeles.
    await expect(SpinRecapRoute(params("2026-11"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders this month and earlier ones", async () => {
    const element = await SpinRecapRoute(params("2026-10"));
    expect(element.props).toEqual({ month: "2026-10" });
    await expect(SpinRecapRoute(params("2019-03"))).resolves.toBeTruthy();
  });

  it("titles the page with the month", async () => {
    expect(await generateMetadata(params("2026-10"))).toEqual({ title: "October 2026 recap" });
    expect(await generateMetadata(params("nope"))).toEqual({ title: "Recap" });
  });
});

describe("SpinRecapPage", () => {
  it("shows a populated month", () => {
    renderRecap();
    expect(hooks.useSpinRecapQuery).toHaveBeenCalledWith(
      { friend_id: 7, month: "2026-10" },
      { enabled: true },
    );
    expect(screen.getByRole("heading", { level: 1, name: "October 2026" })).toBeTruthy();
    expect(screen.getByText("OCT 2026 · SO FAR")).toBeTruthy();
    expect(within(document.querySelector("dl")!).getByText("120")).toBeTruthy();
    expect(screen.getByText("≈8.4")).toBeTruthy();
    expect(screen.getByText("+16 VS SEP")).toBeTruthy();
    expect(screen.getByText("−0.7 VS SEP")).toBeTruthy();
    expect(screen.getByText("SAME AS SEP")).toBeTruthy();
    expect(screen.getByText("+4 VS SEP")).toBeTruthy();
    expect(screen.getByText("BUSIEST · SAT 8–10 PM")).toBeTruthy();
    expect(screen.getByText("MEDIAN 162 BPM · MOST IN 160–170")).toBeTruthy();
    expect(screen.getAllByTestId("week-bar")).toHaveLength(5);
    expect(screen.queryByText(/DUSTY CRATES/)).toBeNull();
  });

  it("labels every chart with its numbers", () => {
    renderRecap();
    const img = (name: string | RegExp) => screen.getByRole("img", { name });
    expect(img("Vinyl 48 spins (40%), digital 72 spins (60%)")).toBeTruthy();
    expect(img(/^Spins per week: week 1, Oct 1–7: 8 vinyl, 12 digital;/)).toBeTruthy();
    expect(img(/week 5, Oct 29–31: 4 vinyl, 8 digital$/)).toBeTruthy();
    expect(img(/^October spins by top-level genre: Latin 34%, Rock 22%/)).toBeTruthy();
    expect(
      img(/^September spins by top-level genre: Latin 24%, Rock 30%.*Other 20%$/),
    ).toBeTruthy();
    expect(img(/Busiest: Saturday 8–10 PM, 7 spins\./)).toBeTruthy();
    expect(img(/^Tempos spun this month\. Median 162 BPM\./)).toBeTruthy();
  });

  it("links genres, but not Other, with the change spelled out", () => {
    renderRecap();
    expect(href("Latin, 41 spins, up 10 points")).toBe("/genres/g-latin");
    expect(href("Pop, 10 spins, new this month")).toBe("/genres/g-pop");
    expect(href("Rock, 26 spins, down 8 points")).toBe("/genres/g-rock");
    expect(screen.queryByRole("link", { name: /^Other/ })).toBeNull();
    expect(screen.getByText("Other, 12 spins, down 10 points")).toBeTruthy();
    expect(screen.getByText("▲ 10%")).toBeTruthy();
  });

  it("says when last month has nothing to compare", () => {
    hooks.recap.recap = {
      ...OCTOBER_RECAP,
      genre_mix: { ...OCTOBER_RECAP.genre_mix, previous: [] },
      stats: { ...OCTOBER_RECAP.stats, spins: { value: 120, previous: 0 } },
    };
    renderRecap();
    expect(screen.getByText("No spins in September to compare.")).toBeTruthy();
    expect(screen.getAllByText("NO SPINS IN SEP")).toHaveLength(4);
    expect(href("Latin, 41 spins")).toBe("/genres/g-latin");
  });

  it("goes back to the log on the same month", () => {
    renderRecap("2026-08");
    expect(href("Back to listening log")).toBe("/spins?month=2026-08");
    const crumbs = screen.getByTestId("recap-breadcrumbs-phone");
    expect(within(crumbs).getByRole("link", { name: "Spins" }).getAttribute("href")).toBe(
      "/spins?month=2026-08",
    );
    expect(within(crumbs).getByText("Recap").getAttribute("aria-current")).toBe("page");
    // The desktop button: jsdom applies no media queries, so it stays hidden here.
    expect(screen.getByText("← LISTENING LOG").closest("a")?.getAttribute("href")).toBe(
      "/spins?month=2026-08",
    );
  });

  it("switches months by URL and stops at this month", async () => {
    const { user: actor } = renderRecap();
    const next = screen.getByRole("button", { name: "Next month" });
    expect(next.hasAttribute("disabled")).toBe(true);
    await actor.click(screen.getByRole("button", { name: "Previous month" }));
    expect(nav.push).toHaveBeenCalledWith("/spins/recap/2026-09");
  });

  it("moves forward from an earlier month, without SO FAR", async () => {
    const { user: actor } = renderRecap("2026-09");
    expect(screen.getByText("SEP 2026")).toBeTruthy();
    expect(screen.queryByText(/SO FAR/)).toBeNull();
    await actor.click(screen.getByRole("button", { name: "Next month" }));
    expect(nav.push).toHaveBeenCalledWith("/spins/recap/2026-10");
  });

  it("puts the top lists in a tablist on phones, with arrow keys", async () => {
    const { user: actor } = renderRecap();
    const tablist = screen.getByRole("tablist", { name: "Top lists" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["RECORDS", "TRACKS", "ARTISTS"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(href(/^1\. Algo-Ritmo/)).toBe("/albums/r-algo?friend_id=7");

    await actor.click(tabs[1]);
    expect(href("1. Mirando A Las Muchachas, Mexican Institute Of Sound, 6 spins")).toBe(
      "/tracks/r-algo-A1?friend_id=7",
    );

    // Arrow keys move focus along the tabs on the next frame. Selection then
    // follows focus in a browser; jsdom never runs that second frame.
    await actor.keyboard("{ArrowRight}");
    await waitFor(() => expect(document.activeElement).toBe(tabs[2]));
    await actor.keyboard("{ArrowLeft}");
    await waitFor(() => expect(document.activeElement).toBe(tabs[1]));

    await actor.click(tabs[2]);
    expect(href("1. Mexican Institute Of Sound, 24 spins")).toBe(
      "/albums?q=Mexican%20Institute%20Of%20Sound&friend_id=7",
    );
  });

  it("lays the top lists out side by side on a wide screen", () => {
    setViewportWidth(1440);
    renderRecap();
    expect(screen.queryByRole("tablist")).toBeNull();
    for (const name of ["TOP RECORDS", "TOP TRACKS", "TOP ARTISTS"]) {
      expect(screen.getByRole("heading", { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    expect(href(/^1\. Algo-Ritmo/)).toBe("/albums/r-algo?friend_id=7");
    expect(href(/^1\. Mirando/)).toBe("/tracks/r-algo-A1?friend_id=7");
    expect(href("5. Meridian Brothers, 4 spins")).toBe("/albums?q=Meridian%20Brothers&friend_id=7");
  });

  it("shows an empty state for a month without spins", () => {
    hooks.recap.recap = EMPTY_RECAP;
    renderRecap();
    expect(screen.getByText("No spins in October yet")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("VINYL / DIGITAL")).toBeNull();
  });

  it("drops 'yet' from an empty past month", () => {
    hooks.recap.recap = EMPTY_RECAP;
    renderRecap("2026-03");
    expect(screen.getByText("No spins in March")).toBeTruthy();
  });

  it("shows a spinner while loading or before the user is known", () => {
    hooks.recap = { recap: null, isLoading: true, error: null };
    const { unmount } = renderRecap();
    expect(screen.queryByText("VINYL / DIGITAL")).toBeNull();
    expect(document.querySelector(".chakra-spinner")).toBeTruthy();
    unmount();

    user.value = { friend: null, isHydrated: false };
    renderRecap();
    expect(hooks.useSpinRecapQuery).toHaveBeenLastCalledWith(
      { friend_id: 0, month: "2026-10" },
      { enabled: false },
    );
  });

  it("says when the recap failed to load", () => {
    hooks.recap = { recap: null, isLoading: false, error: new Error("boom") };
    renderRecap();
    expect(screen.getByText("COULDN'T LOAD THE RECAP · BOOM")).toBeTruthy();
  });

  it("says when no spin had a tempo, and leaves out the busiest caption without spins", () => {
    hooks.recap.recap = {
      ...OCTOBER_RECAP,
      heatmap: EMPTY_RECAP.heatmap,
      bpm: EMPTY_RECAP.bpm,
      top_artists: [],
      by_week: [{ week: 1, vinyl: 48, digital: 72 }],
    };
    setViewportWidth(1440);
    renderRecap();
    expect(screen.getByText("None of this month's spins have a BPM yet.")).toBeTruthy();
    expect(screen.queryByText(/^BUSIEST/)).toBeNull();
    expect(screen.getByText("Nothing yet.")).toBeTruthy();
  });
});
