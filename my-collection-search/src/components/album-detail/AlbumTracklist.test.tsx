// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { queryKeys } from "@/lib/queryKeys";
import { summarizeSides } from "@/lib/albumStats";
import { sampleTrack } from "@/stories/fixtures/track";
import type { Track } from "@/types/track";

vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack: vi.fn() }) }));

import AlbumTracklist from "./AlbumTracklist";

const track = (position: string, overrides: Partial<Track> = {}) =>
  ({
    ...sampleTrack,
    track_id: `t-${position}`,
    friend_id: 1,
    position,
    title: `Song ${position}`,
    artist: "Los Mirlos",
    duration: "3:00",
    duration_seconds: undefined,
    bpm: 100,
    key: "A minor",
    local_audio_url: `/audio/${position}.mp3`,
    notes: "",
    ...overrides,
  }) as Track;

const tracks = [track("A1"), track("A2", { local_audio_url: undefined, notes: "Open with this" }), track("B1", { artist: "Guest" })];

function setup(isMobile: boolean, list: Track[] = tracks) {
  const onPlayTrack = vi.fn();
  const onPlaySide = vi.fn();
  const view = renderWithProviders(
    <AlbumTracklist
      sides={summarizeSides(list)}
      albumArtist="Los Mirlos"
      isMobile={isMobile}
      onPlayTrack={onPlayTrack}
      onPlaySide={onPlaySide}
      renderActions={(t) => <button aria-label={`Actions for ${t.title}`}>menu</button>}
    />
  );
  view.queryClient.setQueryData(queryKeys.genreTree(), []);
  return { ...view, onPlayTrack, onPlaySide };
}

beforeEach(() => vi.clearAllMocks());

describe("AlbumTracklist table", () => {
  it("constrains long titles while keeping metadata and the notes button available", async () => {
    const title = "You Probably Couldn't See For The Lights But You Were Staring Straight At Me";
    const { user } = setup(false, [track("A5", {
      title,
      notes: "Open with this",
      local_tags: "Garage Rock, Indie Rock",
    })]);
    const table = screen.getByRole("table");
    expect(getComputedStyle(table).tableLayout).toBe("fixed");
    for (const name of ["Time", "BPM", "Key", "Genre", "Rating"]) {
      expect(getComputedStyle(within(table).getByRole("columnheader", { name })).width).toMatch(/^\d+px$/);
    }
    const link = screen.getByRole("link", { name: title });
    expect(link.title).toBe(title);
    expect(getComputedStyle(link).textOverflow).toBe("ellipsis");
    expect(getComputedStyle(link).display).toBe("block");
    expect(getComputedStyle(link).minWidth).toBe("0px");
    const genre = screen.getByText("Garage Rock");
    expect(getComputedStyle(genre).display).toBe("block");
    expect(getComputedStyle(genre).textOverflow).toBe("ellipsis");
    expect(screen.getByText("+1")).toBeTruthy();
    expect(within(table).getByLabelText("Rated 3 of 5")).toBeTruthy();
    const notes = screen.getByRole("button", { name: "Has notes" });
    expect(getComputedStyle(notes).flexShrink).toBe("0");
    await user.click(notes);
    expect(await screen.findByText("Open with this")).toBeTruthy();
  });

  it("groups rows by side with a header showing count and runtime", () => {
    setup(false);
    const table = screen.getByTestId("album-track-table");
    expect(within(table).getByText("Side A")).toBeTruthy();
    expect(within(table).getByText("2 tracks · 6:00")).toBeTruthy();
    expect(within(table).getByText("1 track · 3:00")).toBeTruthy();
    expect(within(table).getByRole("link", { name: "Song A1" }).getAttribute("href")).toBe("/tracks/t-A1?friend_id=1");
    expect(screen.getByText("3 tracks")).toBeTruthy();
  });

  it("names the artist only where it differs from the album's, and flags notes", () => {
    setup(false);
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(screen.queryAllByText("Los Mirlos")).toHaveLength(0);
    expect(screen.getAllByLabelText("Has notes").length).toBe(1);
  });

  it("plays one track or one side, and disables a track with no audio", async () => {
    const { user, onPlayTrack, onPlaySide } = setup(false);
    await user.click(screen.getByRole("button", { name: "Play Song A1" }));
    expect(onPlayTrack).toHaveBeenCalledWith(expect.objectContaining({ track_id: "t-A1" }));
    expect((screen.getByRole("button", { name: "Play Song A2" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Play side B" }));
    expect(onPlaySide).toHaveBeenCalledWith(expect.objectContaining({ key: "B" }));
  });

  it("filters to one side from the segmented control and back", async () => {
    const { user } = setup(false);
    const group = screen.getByRole("radiogroup", { name: "Show side" });
    await user.click(within(group).getByText("Side B"));
    expect(screen.queryByRole("link", { name: "Song A1" })).toBeNull();
    expect(screen.getByRole("link", { name: "Song B1" })).toBeTruthy();
    await user.click(within(group).getByText("All"));
    expect(screen.getByRole("link", { name: "Song A1" })).toBeTruthy();
  });

  it("shows dashes for a track with no key or time", () => {
    setup(false, [track("A1", { key: null, duration: "", duration_seconds: undefined, bpm: undefined })]);
    expect(screen.getAllByText("–").length).toBeGreaterThanOrEqual(3);
  });

  it("has no side headers or filter for an undivided tracklist, and a message for none", () => {
    const { unmount } = setup(false, [track("1"), track("2")]);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: /Play side/i })).toBeNull();
    unmount();
    setup(false, []);
    expect(screen.getByText("No tracks found for this album.")).toBeTruthy();
  });
});

describe("AlbumTracklist phone", () => {
  it("stacks rows with the position as a play button and a play-side button", async () => {
    const { user, onPlayTrack, onPlaySide } = setup(true);
    const list = screen.getByTestId("album-track-list");
    const play = within(list).getByRole("button", { name: "Play Song A1" });
    expect(play.textContent).toBe("A1");
    await user.click(play);
    expect(onPlayTrack).toHaveBeenCalled();
    await user.click(within(list).getByRole("button", { name: "Play side A" }));
    expect(onPlaySide).toHaveBeenCalledWith(expect.objectContaining({ key: "A" }));
    expect(within(list).getByRole("button", { name: "Actions for Song B1" })).toBeTruthy();
  });
});
