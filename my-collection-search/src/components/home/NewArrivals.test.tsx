// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import { FIXTURE_NOW, HOME_ARRIVALS } from "@/stories/fixtures/home";
import { NewArrivals } from "./NewArrivals";

const now = new Date(FIXTURE_NOW);

// jsdom evaluates no media queries, so both layouts render: the phone scroller
// is the accessible one, the desktop list needs `hidden: true`.
const lists = () => screen.getAllByRole("list", { hidden: true });
const [phone, desktop] = [0, 1];

describe("NewArrivals", () => {
  it("renders a card scroller for phones and a list for desktop, in the API's order", () => {
    renderWithProviders(<NewArrivals arrivals={HOME_ARRIVALS} friendId={7} now={now} />);
    const cards = within(lists()[phone]).getAllByRole("link");
    const rows = within(lists()[desktop]).getAllByRole("link", { hidden: true });
    const titles = HOME_ARRIVALS.items.map((item) => item.title);
    expect(cards.map((link) => link.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining(titles[0])]),
    );
    expect(cards).toHaveLength(5);
    expect(rows).toHaveLength(5);
    rows.forEach((row, i) => expect(row.textContent).toContain(titles[i]));
  });

  it("links every item to its album page with title and artist in its name", () => {
    renderWithProviders(<NewArrivals arrivals={HOME_ARRIVALS} friendId={7} now={now} />);
    const link = screen.getByRole("link", { name: /Jazz Samba.*Stan Getz \/ Charlie Byrd/ });
    expect(link.getAttribute("href")).toBe("/albums/4?friend_id=7");
    const row = within(lists()[desktop]).getAllByRole("link", { hidden: true })[3];
    expect(row.textContent).toContain("Jazz Samba");
    expect(row.getAttribute("href")).toBe("/albums/4?friend_id=7");
  });

  it("shows plays, the rating chips and the added wording", () => {
    renderWithProviders(<NewArrivals arrivals={HOME_ARRIVALS} friendId={7} now={now} />);
    const rows = within(lists()[desktop]).getAllByRole("listitem", { hidden: true });
    expect(rows[0].textContent).toContain("NOT PLAYED");
    expect(rows[0].textContent).toContain("UNRATED");
    expect(rows[0].textContent).toContain("ADDED 9 DAYS AGO");
    expect(rows[1].textContent).toContain("1 PLAY");
    expect(rows[3].textContent).toContain("6 PLAYS");
    expect(rows[3].textContent).toContain("★★★★☆");
    // The stars have a text alternative; the unrated chip is text already.
    expect(within(rows[3]).getByRole("img", { name: "Rated 4 of 5", hidden: true })).toBeTruthy();
    expect(within(rows[0]).queryByRole("img", { name: /Rated/, hidden: true })).toBeNull();
    expect(within(lists()[phone]).getAllByText("UNRATED")).toHaveLength(3);
  });

  it("counts added days in the display time zone", () => {
    // 20:00 UTC on 31 Oct is 13:00 in Los Angeles; an item added 07:30 UTC is 00:30 local, today.
    const item = { ...HOME_ARRIVALS.items[0], date_added: "2026-10-31T07:30:00.000Z" };
    renderWithProviders(
      <DisplayTimeZoneProvider timeZone="America/Los_Angeles">
        <NewArrivals arrivals={{ ...HOME_ARRIVALS, items: [item] }} friendId={1} now={now} />
      </DisplayTimeZoneProvider>,
    );
    expect(screen.getByText("ADDED TODAY")).toBeTruthy();
  });

  it("defaults the clock to now", () => {
    const item = { ...HOME_ARRIVALS.items[0], date_added: new Date().toISOString() };
    renderWithProviders(
      <NewArrivals arrivals={{ ...HOME_ARRIVALS, items: [item] }} friendId={1} />,
    );
    expect(screen.getByText("ADDED TODAY")).toBeTruthy();
  });

  it("captions with the unrated count, and drops it at zero", () => {
    const { rerender } = renderWithProviders(
      <NewArrivals arrivals={HOME_ARRIVALS} friendId={1} now={now} />,
    );
    expect(screen.getByText("last 30 days · least played first · 3 unrated")).toBeTruthy();
    expect(screen.getByText("LEAST PLAYED · 3 UNRATED")).toBeTruthy();
    rerender(
      <NewArrivals arrivals={{ ...HOME_ARRIVALS, unrated_count: 0 }} friendId={1} now={now} />,
    );
    expect(screen.getByText("last 30 days · least played first")).toBeTruthy();
    expect(screen.getByText("LEAST PLAYED")).toBeTruthy();
  });

  it("links 'All new arrivals' to Albums by date added, newest first", () => {
    renderWithProviders(<NewArrivals arrivals={HOME_ARRIVALS} friendId={1} now={now} />);
    // Desktop only, so jsdom hides it and gives it no accessible name: find it by text.
    const all = screen.getByText("All new arrivals →").closest("a");
    expect(all?.getAttribute("href")).toBe("/albums?sort=date_added:desc");
  });

  it("shows a placeholder for a missing thumbnail and the image otherwise", () => {
    const withCover = { ...HOME_ARRIVALS.items[1], thumbnail: "https://img.test/c.jpg" };
    const items = [HOME_ARRIVALS.items[0], withCover];
    const { container } = renderWithProviders(
      <NewArrivals arrivals={{ ...HOME_ARRIVALS, items }} friendId={1} now={now} />,
    );
    // Two layouts, one image each for the album with a cover.
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
  });

  it("offers the Albums link when nothing arrived", () => {
    renderWithProviders(
      <NewArrivals arrivals={{ window_days: 30, unrated_count: 0, items: [] }} friendId={1} />,
    );
    expect(screen.getByRole("region", { name: "NEW ARRIVALS" })).toBeTruthy();
    expect(screen.getByText(/NOTHING NEW IN THE LAST 30 DAYS/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "BROWSE ALBUMS →" }).getAttribute("href")).toBe(
      "/albums?sort=date_added:desc",
    );
    expect(screen.queryAllByRole("list", { hidden: true })).toHaveLength(0);
  });

  it("shows a busy placeholder while loading", () => {
    renderWithProviders(<NewArrivals arrivals={null} friendId={1} loading />);
    expect(screen.getByTestId("new-arrivals-loading")).toBeTruthy();
    expect(screen.getByRole("region", { name: "NEW ARRIVALS" }).getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("keeps the header and reports the error in the section", () => {
    renderWithProviders(<NewArrivals arrivals={null} friendId={1} error="HTTP 500" />);
    expect(screen.getByRole("heading", { name: "NEW ARRIVALS" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("COULDN'T LOAD NEW ARRIVALS · HTTP 500");
    expect(screen.queryByText(/least played/i)).toBeNull();
  });
});
