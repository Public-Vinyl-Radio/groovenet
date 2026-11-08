// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { groupPlaylistsByMonth } from "@/lib/playlistGroups";
import type { Playlist } from "@/types/track";
import PlaylistPhoneList, { phoneMeta } from "./PlaylistPhoneList";

const plain = {
  id: 1,
  name: "Warm up",
  tracks: [{}],
  total_duration_seconds: 2940,
  created_at: "2026-10-30T12:00:00",
} as unknown as Playlist;
const set = {
  id: 2,
  name: "Fri night",
  tracks: [{}, {}],
  created_at: "2026-10-02T12:00:00",
  set: { title: "Inner Signals", flyer_url: "/flyer.jpg", collaborators: [], status: "performed" },
} as unknown as Playlist;
const actions = () => ({
  onClick: vi.fn(),
  onPlay: vi.fn(),
  onEnqueue: vi.fn(),
  onDelete: vi.fn(),
  onExportPdf: vi.fn(),
  onCreateSet: vi.fn(),
});

describe("phoneMeta", () => {
  it("joins day, count and length", () => {
    expect(phoneMeta(plain)).toBe("Fri 30 · 1 track · 49m");
  });

  it("skips what is unknown", () => {
    expect(phoneMeta({ id: 3, name: "x", tracks: [{}, {}] } as unknown as Playlist)).toBe(
      "2 tracks",
    );
  });
});

describe("PlaylistPhoneList", () => {
  it("keeps month dividers, links rows, marks sets and flags the loading row", () => {
    renderWithProviders(
      <PlaylistPhoneList
        groups={groupPlaylistsByMonth([plain, set])}
        loadingId={2}
        getActions={actions}
      />,
    );
    const rows = screen.getAllByTestId("playlist-phone-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId("month-count")).toBeTruthy();
    expect(within(rows[0]).getByRole("link", { name: "Warm up" }).getAttribute("href")).toBe(
      "/playlists/1",
    );
    expect(within(rows[0]).queryByText("Set")).toBeNull();
    // The set shows its title, a Set marker, its flyer, and the pending spinner.
    expect(within(rows[1]).getByRole("link", { name: "Inner Signals" })).toBeTruthy();
    expect(within(rows[1]).getByText("Set")).toBeTruthy();
    expect(screen.getByTestId("set-flyer")).toBeTruthy();
    expect(rows[1].querySelector(".chakra-spinner")).toBeTruthy();
  });
});
