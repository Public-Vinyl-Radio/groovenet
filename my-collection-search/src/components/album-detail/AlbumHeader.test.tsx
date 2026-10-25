// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { queryKeys } from "@/lib/queryKeys";
import { summarizeSides } from "@/lib/albumStats";
import type { AlbumEntity } from "@/stores/albumStore";
import type { Track } from "@/types/track";

import AlbumHeader from "./AlbumHeader";

const album = (overrides: Record<string, unknown> = {}) =>
  ({
    release_id: "r1",
    friend_id: 3,
    title: "Corazón Amazónico",
    artist: "Los Mirlos",
    label: "Discos Eternos",
    year: "2022",
    country: "Peru",
    library_identifier: "LP0029",
    track_count: 3,
    genres: ["Latin"],
    styles: ["Cumbia"],
    date_added: "2026-06-03T00:00:00Z",
    ...overrides,
  }) as unknown as AlbumEntity;

const track = (position: string, bpm: number | null, key: string | null, duration: string) =>
  ({ track_id: position, friend_id: 3, position, bpm, key, duration, duration_seconds: null }) as unknown as Track;

const tracks = [track("A1", 94, "A minor", "3:00"), track("A2", 150, "C major", "2:00"), track("B1", null, null, "1:00")];

function renderHeader(props: Partial<React.ComponentProps<typeof AlbumHeader>> = {}) {
  const handlers = {
    onRate: vi.fn(),
    onPlay: vi.fn(),
    onAddToPlaylist: vi.fn(),
    onLogSpin: vi.fn(),
    onChangeArtwork: vi.fn(),
  };
  const view = renderWithProviders(
    <AlbumHeader
      album={album()}
      tracks={tracks}
      sides={summarizeSides(tracks)}
      spins={{ count: 1, capped: false, lastPlayedAt: "2026-06-05T19:43:00Z" }}
      artworkSrc="/cover.jpg"
      rating={0}
      isMobile={false}
      menu={<button aria-label="Album actions">menu</button>}
      {...handlers}
      {...props}
    />
  );
  view.queryClient.setQueryData(queryKeys.genreTree(), []);
  return { ...view, ...handlers };
}

const stats = () => within(screen.getByTestId("album-stats"));

beforeEach(() => vi.clearAllMocks());

describe("AlbumHeader", () => {
  it("names the album, links its artist and gives the overline and byline", () => {
    renderHeader();
    expect(screen.getByRole("heading", { level: 2, name: "Corazón Amazónico" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Los Mirlos" }).getAttribute("href")).toContain("Los%20Mirlos");
    expect(screen.getByText(/Album · Vinyl/).textContent).toContain("LP0029");
    expect(screen.getByText("Discos Eternos · 2022 · Peru")).toBeTruthy();
    expect(screen.getByText("Latin")).toBeTruthy();
    expect(screen.getByText("Cumbia")).toBeTruthy();
  });

  it("computes the stat panel from the tracks and spins", () => {
    renderHeader();
    expect(stats().getByText("3")).toBeTruthy();
    expect(stats().getByText("2 sides · 2 + 1")).toBeTruthy();
    expect(stats().getByText("6:00")).toBeTruthy();
    expect(stats().getByText("A 5:00 · B 1:00")).toBeTruthy();
    expect(stats().getByText("94–150")).toBeTruthy();
    expect(stats().getByText("Opens in 8A · A minor")).toBeTruthy();
    expect(stats().getByText(/^Last .*2026.*· Added /)).toBeTruthy();
  });

  it("shows dashes while spins are unknown and for an album with no tracks", () => {
    renderHeader({ spins: null, tracks: [], sides: [], album: album({ track_count: 0, date_added: null, year: "0" }) });
    expect(stats().getAllByLabelText("Unknown").length).toBe(4);
    expect(screen.getByText("Discos Eternos · Peru")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Play album/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("marks a capped spin count and a spin-less album", () => {
    renderHeader({ spins: { count: 8, capped: true, lastPlayedAt: null } });
    expect(stats().getByText("8+")).toBeTruthy();
  });

  it("runs the card's actions", async () => {
    const { user, onPlay, onAddToPlaylist, onLogSpin, onChangeArtwork } = renderHeader();
    await user.click(screen.getByRole("button", { name: /Play album/ }));
    await user.click(screen.getByRole("button", { name: /Add to playlist/ }));
    await user.click(screen.getByRole("button", { name: /Log spin/ }));
    await user.click(screen.getByRole("button", { name: "Change cover art" }));
    expect(onPlay).toHaveBeenCalled();
    expect(onAddToPlaylist).toHaveBeenCalled();
    expect(onLogSpin).toHaveBeenCalled();
    expect(onChangeArtwork).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Album actions" })).toBeTruthy();
  });

  it("rates the album", async () => {
    const { user, onRate } = renderHeader({ rating: 0 });
    expect(screen.getByText("Not rated")).toBeTruthy();
    await user.click(screen.getAllByRole("radio", { hidden: true })[2]);
    expect(onRate).toHaveBeenCalledWith(3);
  });

  it("falls back to the catalogue number and a placeholder cover", () => {
    renderHeader({ artworkSrc: null, album: album({ library_identifier: null, catalog_number: "DE-9", genres: [], styles: [] }) });
    expect(screen.getByText(/Album · Vinyl/).textContent).toContain("DE-9");
    expect(screen.queryByRole("img", { name: /cover/ })).toBeNull();
  });

  it("shows notes, price and condition behind the notes icon", async () => {
    const { user } = renderHeader({ album: album({ album_notes: "Signed", purchase_price: "20", condition: "VG+" }) });
    await user.click(screen.getByRole("button", { name: "Album notes" }));
    expect(await screen.findByText("Signed")).toBeTruthy();
    expect(screen.getByText("Price: $20")).toBeTruthy();
    expect(screen.getByText("VG+")).toBeTruthy();
  });

  it("stacks the phone's actions below, with Playlist and Log spin as equal buttons", async () => {
    const { user, onAddToPlaylist, onLogSpin } = renderHeader({ isMobile: true, rating: 4 });
    const below = within(screen.getByTestId("album-actions-below"));
    expect(screen.queryByTestId("album-actions-card")).toBeNull();
    expect(screen.queryByText("Not rated")).toBeNull();
    await user.click(below.getByRole("button", { name: /Playlist/ }));
    await user.click(below.getByRole("button", { name: /Log spin/ }));
    expect(onAddToPlaylist).toHaveBeenCalled();
    expect(onLogSpin).toHaveBeenCalled();
  });
});
