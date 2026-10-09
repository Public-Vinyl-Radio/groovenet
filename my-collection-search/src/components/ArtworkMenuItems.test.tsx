// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ appendToQueue: vi.fn(), replacePlaylist: vi.fn() }),
}));
vi.mock("@/hooks/useAddToPlaylistDialog", () => ({
  useAddToPlaylistDialog: () => ({ openForTrack: vi.fn(), playlistDialog: null, nameDialog: null }),
}));
vi.mock("@/hooks/useUploadTrackAudioMutation", () => ({
  useUploadTrackAudioMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import AlbumActionsMenu from "./AlbumActionsMenu";
import TrackActionsMenu from "./TrackActionsMenu";

afterEach(() => vi.clearAllMocks());

const track = { track_id: "t1", friend_id: 7, title: "Safe", artist: "MA" } as Track;

// jsdom renders both layouts; the mobile drawer is the accessible one and the
// desktop dropdown is reachable with { hidden: true }. Selecting a dropdown
// item through Ark is timing-sensitive in jsdom, so the dropdown is only checked
// for the item; it passes the handler straight through.
describe("Cover Art menu items (#494)", () => {
  const menus = [
    ["Album actions", (fn: () => void) => <AlbumActionsMenu onChangeArtwork={fn} />],
    ["Track actions", (fn: () => void) => <TrackActionsMenu track={track} onChangeArtwork={fn} />],
  ] as const;

  it.each(menus)("%s: opens cover art from the drawer", async (trigger, render) => {
    const onChangeArtwork = vi.fn();
    const { user } = renderWithProviders(render(onChangeArtwork));

    await user.click(screen.getAllByRole("button", { name: trigger, hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: /Cover Art/, hidden: true }));

    expect(onChangeArtwork).toHaveBeenCalledTimes(1);
  });

  it.each(menus)("%s: lists cover art in the dropdown", async (trigger, render) => {
    const { user } = renderWithProviders(render(vi.fn()));

    await user.click(screen.getAllByRole("button", { name: trigger, hidden: true })[1]);

    expect(await screen.findByRole("menuitem", { name: /Cover Art/, hidden: true })).toBeTruthy();
  });

  it("offers no cover art item without a handler", async () => {
    const { user } = renderWithProviders(<AlbumActionsMenu onLogCare={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "Album actions", hidden: true })[0]);
    await screen.findByRole("button", { name: /Log Care/ });
    expect(screen.queryByRole("button", { name: /Cover Art/ })).toBeNull();
  });
});
