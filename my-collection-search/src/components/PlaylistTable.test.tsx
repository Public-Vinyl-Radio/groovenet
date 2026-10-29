// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PlaylistTable, { tableSetLinks } from "./PlaylistTable";
import { groupPlaylistsByMonth } from "@/lib/playlistGroups";
import type { Playlist } from "@/types/track";

const plain = (extra: Record<string, unknown> = {}) =>
  ({
    id: 1,
    name: "Late Night",
    tracks: [{}, {}],
    total_duration_seconds: 3900,
    cover_urls: ["/a.jpg"],
    created_at: "2026-10-20T12:00:00",
    ...extra,
  }) as unknown as Playlist;

const setOf = (set: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  plain({
    id: 2,
    name: "Fallback name",
    set: {
      status: "performed",
      title: "Inner Signals",
      last_performed_at: "2026-08-10T22:00:00",
      venue_name: "Room 4",
      location_city: "Oakland",
      collaborators: [{ username: "ana" }, { username: "ben" }],
      flyer_url: "/flyer.jpg",
      recording_url: "https://r",
      post_url: "https://p",
      youtube_url: "https://y",
      ...set,
    },
    ...extra,
  });

function setup(playlists: Playlist[], loadingId?: number | null) {
  const actions = {
    onClick: vi.fn(),
    onPlay: vi.fn(),
    onDelete: vi.fn(),
    onEnqueue: vi.fn(),
    onExportPdf: vi.fn(),
    onCreateSet: vi.fn(),
  };
  const rendered = renderWithProviders(
    <PlaylistTable
      groups={groupPlaylistsByMonth(playlists)}
      loadingId={loadingId}
      getActions={() => actions}
    />,
  );
  return { actions, ...rendered };
}

const rowOf = (i = 0) => screen.getAllByTestId("playlist-table-row")[i];

describe("PlaylistTable (#770)", () => {
  it("is a real table with named column headers and a group row per month", () => {
    setup([plain(), setOf()]);
    expect(screen.getByRole("table", { name: "Playlists" })).toBeTruthy();
    const headers = screen.getAllByRole("columnheader").map((el) => el.textContent);
    expect(headers).toEqual([
      "Date",
      "Cover",
      "Name",
      "Tracks",
      "Length",
      "With",
      "Set links",
      "Actions",
    ]);
    const groups = screen.getAllByRole("rowheader");
    expect(groups.map((el) => el.textContent)).toEqual([
      "OCT 20261 playlist",
      "AUG 20261 playlist · 1 set",
    ]);
    expect(groups[0].getAttribute("colspan")).toBe("8");
    expect(screen.getByRole("rowgroup", { name: "OCT 2026" })).toBeTruthy();
  });

  it("fills a plain playlist: date, mosaic, name, tracks, length, empty with and links", () => {
    setup([plain()]);
    const row = rowOf();
    expect(within(row).getByText("20").textContent).toBe("20");
    expect(within(row).getByText("TUE")).toBeTruthy();
    expect(within(row).getByTestId("playlist-mosaic")).toBeTruthy();
    expect(within(row).queryByTestId("set-flyer")).toBeNull();
    expect(within(row).getByText("Late Night")).toBeTruthy();
    expect(within(row).queryByTestId("live-set-stamp")).toBeNull();
    expect(within(row).queryByTestId("table-venue")).toBeNull();
    expect(within(row).getByText("2")).toBeTruthy();
    expect(within(row).getByText("1h 5m")).toBeTruthy();
    // With and Set links both fall back to a dash.
    expect(within(row).getAllByText("—")).toHaveLength(2);
    expect(within(row).getByTestId("set-links-empty")).toBeTruthy();
    expect(within(row).queryAllByRole("link")).toHaveLength(0);
  });

  it("falls back to dashes for a missing date and length", () => {
    setup([plain({ created_at: "bad", total_duration_seconds: 0 })]);
    // date, length, with, set links
    expect(within(rowOf()).getAllByText("—")).toHaveLength(4);
    expect(screen.getByText("UNDATED")).toBeTruthy();
  });

  it("shows a set with flyer thumbnail, stamp, venue, collaborators and every link", () => {
    setup([setOf()]);
    const row = rowOf();
    expect(within(row).getByTestId("set-flyer")).toBeTruthy();
    expect(within(row).queryByTestId("playlist-mosaic")).toBeNull();
    expect(within(row).getByText("Inner Signals")).toBeTruthy();
    expect(within(row).getByTestId("live-set-stamp").textContent).toBe("LIVE SET");
    expect(within(row).getByTestId("table-venue").textContent).toBe("Room 4 · Oakland");
    expect(within(row).getByText("ana, ben")).toBeTruthy();
    const links = within(row).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual([
      "Recording",
      "Website post",
      "YouTube",
      "Flyer",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://r",
      "https://p",
      "https://y",
      "/flyer.jpg",
    ]);
    links.forEach((a) => expect(a.getAttribute("target")).toBe("_blank"));
  });

  it("uses the playlist name, the mosaic and no venue or links for a bare set", () => {
    setup([
      setOf({
        title: null,
        venue_name: null,
        location_city: null,
        flyer_url: null,
        recording_url: null,
        post_url: null,
        youtube_url: null,
        collaborators: [],
      }),
    ]);
    const row = rowOf();
    expect(within(row).getByText("Fallback name")).toBeTruthy();
    expect(within(row).getByTestId("playlist-mosaic")).toBeTruthy();
    expect(within(row).queryByTestId("table-venue")).toBeNull();
    expect(within(row).getByTestId("set-links-empty")).toBeTruthy();
  });

  it("hides links that are missing", () => {
    setup([setOf({ flyer_url: null, post_url: null, youtube_url: null })]);
    expect(
      within(rowOf())
        .getAllByRole("link")
        .map((a) => a.getAttribute("aria-label")),
    ).toEqual(["Recording"]);
  });

  it("builds the table links from a set", () => {
    expect(
      tableSetLinks({ flyer_url: "/f", youtube_url: "https://y", collaborators: [] } as never),
    ).toEqual([
      { key: "youtube", href: "https://y", primary: false },
      { key: "flyer", href: "/f", primary: false },
    ]);
  });

  it("opens the playlist on a row click and on Enter", async () => {
    const { user, actions } = setup([plain()]);
    await user.click(within(rowOf()).getByText("Late Night"));
    expect(actions.onClick).toHaveBeenCalledTimes(1);
    rowOf().focus();
    await user.keyboard("{Enter}");
    expect(actions.onClick).toHaveBeenCalledTimes(2);
    await user.keyboard("a");
    expect(actions.onClick).toHaveBeenCalledTimes(2);
  });

  it("is keyboard reachable", () => {
    setup([plain()]);
    expect(rowOf().getAttribute("tabindex")).toBe("0");
  });

  it("does not open the playlist from a link click or Enter on a link", async () => {
    const { user, actions } = setup([setOf()]);
    const link = within(rowOf()).getByRole("link", { name: "Recording" });
    link.addEventListener("click", (e) => e.preventDefault());
    await user.click(link);
    link.focus();
    await user.keyboard("{Enter}");
    expect(actions.onClick).not.toHaveBeenCalled();
  });

  it("keeps the kebab and its menu from opening the playlist, and wires the menu actions", async () => {
    const { user, actions } = setup([plain()]);
    await user.click(
      within(rowOf()).getAllByRole("button", { name: "Playlist actions", hidden: true })[1],
    );
    expect(actions.onClick).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("menuitem", { name: /Play now/, hidden: true }));
    expect(actions.onPlay).toHaveBeenCalledTimes(1);
    expect(actions.onClick).not.toHaveBeenCalled();
  });

  it("offers Turn into a set only for a plain playlist", async () => {
    const { user } = setup([plain(), setOf()]);
    await user.click(
      within(rowOf(0)).getAllByRole("button", { name: "Playlist actions", hidden: true })[1],
    );
    expect(
      await screen.findByRole("menuitem", { name: /Turn into a set/, hidden: true }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(
      within(rowOf(1)).getAllByRole("button", { name: "Playlist actions", hidden: true })[1],
    );
    await screen.findByRole("menuitem", { name: /Play now/, hidden: true });
    expect(screen.queryByRole("menuitem", { name: /Turn into a set/, hidden: true })).toBeNull();
  });

  it("shows a spinner on the row with a pending action", () => {
    const { container } = setup([plain()], 1);
    expect(container.querySelector(".chakra-spinner")).toBeTruthy();
  });

  it("marks With and Set links as the columns that drop as the block narrows", () => {
    setup([plain()]);
    expect(document.querySelectorAll("[data-col=with]")).toHaveLength(2);
    expect(document.querySelectorAll("[data-col=links]")).toHaveLength(2);
  });
});
