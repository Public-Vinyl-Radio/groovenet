// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { queryKeys } from "@/lib/queryKeys";
import { sampleTrack } from "@/stories/fixtures/track";
import type { Track } from "@/types/track";

const player = vi.hoisted(() => ({ replacePlaylist: vi.fn(), appendToQueue: vi.fn() }));
const openForTrack = vi.hoisted(() => vi.fn());

vi.mock("@/providers/PlaylistPlayerProvider", () => ({ usePlaylistPlayer: () => player }));
vi.mock("@/hooks/useAddToPlaylistDialog", () => ({
  useAddToPlaylistDialog: () => ({
    openForTrack,
    playlistDialog: <div data-testid="playlist-dialog" />,
    nameDialog: null,
  }),
}));
vi.mock("@/components/TrackActionsMenu", () => ({
  default: (props: { prominent?: boolean; onOpenTrackDebug?: () => void; onChangeArtwork?: () => void }) => (
    <button aria-label="Track actions" data-prominent={String(Boolean(props.prominent))} onClick={props.onOpenTrackDebug}>
      menu
    </button>
  ),
}));

import TrackHeader from "./TrackHeader";

const track = (overrides: Partial<Track> = {}) =>
  ({ ...sampleTrack, track_id: "h1", friend_id: 6, ...overrides }) as Track;

function renderHeader(overrides: Partial<Track> = {}, props: Partial<React.ComponentProps<typeof TrackHeader>> = {}) {
  const fallbackTrack = track(overrides);
  const view = renderWithProviders(
    <TrackHeader trackId="h1" friendId={6} fallbackTrack={fallbackTrack} {...props} />
  );
  view.queryClient.setQueryData(queryKeys.genreTree(), []);
  return view;
}

const facts = () => within(screen.getByTestId("track-facts"));

beforeEach(() => vi.clearAllMocks());

describe("TrackHeader", () => {
  it("names the track, its artist and its album, linked", () => {
    renderHeader({ title: "El Poder Verde", artist: "Los Mirlos", album: "Corazón Amazónico", year: "2018", release_id: "r1" });

    expect(screen.getByRole("heading", { level: 1, name: "El Poder Verde" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Los Mirlos" }).getAttribute("href")).toContain("Los%20Mirlos");
    expect(screen.getByRole("link", { name: "Corazón Amazónico" }).getAttribute("href")).toBe("/albums/r1?friend_id=6");
    expect(screen.getByText(/2018/)).toBeTruthy();
  });

  it("shows notes only when the track has them, and drops a zero year", () => {
    renderHeader({ notes: "", year: "0" });
    expect(screen.queryByLabelText("Has notes")).toBeNull();
    expect(screen.queryByText(/ · 0/)).toBeNull();
  });

  it("shows the notes icon when there are notes", () => {
    renderHeader({ notes: "Good opener" });
    expect(screen.getByLabelText("Has notes")).toBeTruthy();
  });

  it("shows the username only when asked", () => {
    const { unmount } = renderHeader({ username: "ben" }, { showUsername: true });
    expect(screen.getByText("ben")).toBeTruthy();
    unmount();
    renderHeader({ username: "ben" }, { showUsername: false });
    expect(screen.queryByText("ben")).toBeNull();
  });

  it("shows BPM, key, duration and side in the facts block", () => {
    renderHeader({ bpm: "148", key: "A minor", duration_seconds: 224, position: "B2" });

    expect(facts().getByText("148")).toBeTruthy();
    expect(facts().getByText("8A")).toBeTruthy();
    expect(facts().getByText("A minor")).toBeTruthy();
    expect(facts().getByText("3:44")).toBeTruthy();
    expect(facts().getByText("B2")).toBeTruthy();
    expect(facts().getAllByRole("term").map((t) => t.textContent)).toEqual(["BPM", "Key", "Duration", "Side"]);
  });

  it("shows a dash, not a blank or zero, for a missing key, BPM, duration and side", () => {
    renderHeader({ bpm: undefined, key: undefined, duration: undefined, duration_seconds: undefined, position: "" });
    expect(facts().getAllByLabelText("Unknown")).toHaveLength(4);
  });

  it("treats an unrecognised key as unknown", () => {
    renderHeader({ key: "mystery" });
    expect(facts().queryByText("mystery")).toBeNull();
  });

  // jsdom evaluates no container queries, so the card's actions (hidden below the
  // wide breakpoint) and the ones under it are both in the DOM; query by placement.
  it("plays the track and opens add-to-playlist", async () => {
    const t = track({ local_audio_url: "x.m4a" });
    const { user } = renderWithProviders(<TrackHeader trackId="h1" friendId={6} fallbackTrack={t} />);

    // The actions render in the card and below it; a container query shows one.
    await user.click(within(screen.getByTestId("track-actions-card")).getByRole("button", { name: /Play/, hidden: true }));
    expect(player.replacePlaylist).toHaveBeenCalledWith([t], { autoplay: true, startIndex: 0 });

    await user.click(within(screen.getByTestId("track-actions-below")).getByRole("button", { name: /Add to playlist/, hidden: true }));
    expect(openForTrack).toHaveBeenCalledWith(t);
    expect(screen.getByTestId("playlist-dialog")).toBeTruthy();
  });

  it("disables Play for a track without audio", () => {
    renderHeader({ local_audio_url: undefined });
    for (const placement of ["card", "below"]) {
      const play = within(screen.getByTestId(`track-actions-${placement}`)).getByRole("button", { name: /Play/, hidden: true });
      expect((play as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("puts the actions below the card for phones with a full-size menu trigger", () => {
    renderHeader();
    const below = within(screen.getByTestId("track-actions-below"));
    const card = within(screen.getByTestId("track-actions-card"));
    expect(below.getByLabelText("Track actions", { selector: "button" }).dataset.prominent).toBe("true");
    expect(card.getByLabelText("Track actions", { selector: "button" }).dataset.prominent).toBe("false");
    expect(screen.getByRole("region", { name: "Track" }).contains(screen.getByTestId("track-actions-below"))).toBe(false);
  });

  it("hands the menu its callbacks", async () => {
    const onOpenTrackDebug = vi.fn();
    const { user } = renderHeader({}, { onOpenTrackDebug });
    await user.click(within(screen.getByTestId("track-actions-card")).getByLabelText("Track actions", { selector: "button" }));
    expect(onOpenTrackDebug).toHaveBeenCalled();
  });

  it("holds the genres in the header, once", () => {
    renderHeader({ track_genres: [{ id: "c", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null }] });
    expect(screen.getAllByTestId("track-genres-section")).toHaveLength(1);
    expect(screen.getByText("Cumbia")).toBeTruthy();
  });
});
