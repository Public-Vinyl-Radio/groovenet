// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import { FIXTURE_NOW, HOME_PLAYLISTS } from "@/stories/fixtures/home";
import { PlaylistsSection } from "./PlaylistsSection";

const now = new Date(FIXTURE_NOW);
const section = () => screen.getByRole("region", { name: "PLAYLISTS & SETS" });
const allLink = () => within(section()).getByRole("link", { name: "All playlists →" });

describe("PlaylistsSection", () => {
  it("highlights the draft set with its venue, tracks and duration, linking to the set", () => {
    renderWithProviders(<PlaylistsSection playlists={HOME_PLAYLISTS} now={now} />);
    const draft = within(section()).getByRole("link", { name: /Rock Nacional Night/ });
    expect(draft.getAttribute("href")).toBe("/playlists/42");
    expect(draft.textContent).toContain("DRAFT SET · CLUB ATLÉTICO");
    expect(draft.textContent).toContain("24 TRACKS · 1:45:12");
  });

  it("shows just DRAFT SET without a venue, and a fallback title", () => {
    const playlists = {
      ...HOME_PLAYLISTS,
      draft_set: { ...HOME_PLAYLISTS.draft_set!, location_name: null, title: null },
    };
    renderWithProviders(<PlaylistsSection playlists={playlists} now={now} />);
    const draft = within(section()).getByRole("link", { name: /Untitled set/ });
    expect(draft.textContent).toMatch(/^DRAFT SETUntitled set/);
  });

  it("lists the recent playlists with phone and desktop details, in order", () => {
    renderWithProviders(<PlaylistsSection playlists={HOME_PLAYLISTS} now={now} />);
    const rows = within(screen.getByRole("list")).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      "/playlists/1",
      "/playlists/2",
      "/playlists/3",
    ]);
    expect(within(rows[0]).getByText("12 TRACKS")).toBeTruthy();
    expect(within(rows[0]).getByText("CREATED TODAY · 12 TRACKS · 0:48:15")).toBeTruthy();
    expect(within(rows[1]).getByText("CREATED 3 DAYS AGO · 18 TRACKS · ≈1:08:40")).toBeTruthy();
    expect(within(rows[2]).getByText("CREATED SEP 21 · 31 TRACKS · 2:04:40")).toBeTruthy();
    expect(allLink().getAttribute("href")).toBe("/playlists");
  });

  it("shows only the playlists when there is no draft", () => {
    renderWithProviders(
      <PlaylistsSection playlists={{ ...HOME_PLAYLISTS, draft_set: null }} now={now} />,
    );
    expect(within(section()).queryByText(/DRAFT SET/)).toBeNull();
    expect(within(screen.getByRole("list")).getAllByRole("link")).toHaveLength(3);
  });

  it("shows the draft alone when there are no playlists", () => {
    renderWithProviders(
      <PlaylistsSection playlists={{ ...HOME_PLAYLISTS, recent: [] }} now={now} />,
    );
    expect(within(section()).getByText("DRAFT SET · CLUB ATLÉTICO")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("offers to create one when there is nothing at all", () => {
    renderWithProviders(<PlaylistsSection playlists={{ draft_set: null, recent: [] }} />);
    const create = within(section()).getByRole("link", { name: "CREATE ONE FROM TRACKS →" });
    expect(create.getAttribute("href")).toBe("/tracks");
    expect(section().textContent).toContain("NO PLAYLISTS YET.");
    expect(allLink()).toBeTruthy();
  });

  it("dates playlists in the display time zone", () => {
    // 06:30 UTC on 31 Oct is still 30 Oct in Los Angeles.
    const playlist = { ...HOME_PLAYLISTS.recent[0], created_at: "2026-10-31T06:30:00.000Z" };
    renderWithProviders(
      <DisplayTimeZoneProvider timeZone="America/Los_Angeles">
        <PlaylistsSection playlists={{ draft_set: null, recent: [playlist] }} now={now} />
      </DisplayTimeZoneProvider>,
    );
    expect(screen.getByText(/^CREATED YESTERDAY/)).toBeTruthy();
  });

  it("defaults the clock to now", () => {
    const playlist = { ...HOME_PLAYLISTS.recent[1], created_at: new Date().toISOString() };
    renderWithProviders(<PlaylistsSection playlists={{ draft_set: null, recent: [playlist] }} />);
    expect(screen.getByText(/^CREATED TODAY/)).toBeTruthy();
  });

  it("shows a placeholder while loading", () => {
    renderWithProviders(<PlaylistsSection playlists={null} />);
    expect(screen.getByTestId("playlists-loading")).toBeTruthy();
    expect(section().getAttribute("aria-busy")).toBe("true");
  });

  it("keeps the placeholder while a refetch is loading", () => {
    renderWithProviders(<PlaylistsSection playlists={HOME_PLAYLISTS} loading />);
    expect(screen.getByTestId("playlists-loading")).toBeTruthy();
  });

  it("reports an error and keeps the header", () => {
    renderWithProviders(<PlaylistsSection playlists={null} error="HTTP 500" />);
    expect(within(section()).getByRole("alert").textContent).toBe(
      "COULDN'T LOAD PLAYLISTS · HTTP 500",
    );
    expect(section().getAttribute("aria-busy")).toBeNull();
    expect(allLink()).toBeTruthy();
  });
});
