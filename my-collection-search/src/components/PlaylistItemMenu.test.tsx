// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const mocks = vi.hoisted(() => ({
  openForTrack: vi.fn(),
  analyzeTrackAsync: vi.fn().mockResolvedValue({ jobId: "j1" }),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAddToPlaylistDialog", () => ({
  useAddToPlaylistDialog: () => ({ openForTrack: mocks.openForTrack, playlistDialog: null }),
}));
vi.mock("@/services/internalApi/tracks", () => ({ analyzeTrackAsync: mocks.analyzeTrackAsync }));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));
vi.mock("./PlaylistRecommendations", () => ({ default: () => <div>recs</div> }));

import PlaylistItemMenu from "./PlaylistItemMenu";

afterEach(() => vi.clearAllMocks());

const track = {
  track_id: "t1",
  friend_id: 7,
  title: "Full House",
  artist: "DJ Test",
  youtube_url: "https://youtube.com/x",
} as Track;

function setup(props: Partial<React.ComponentProps<typeof PlaylistItemMenu>> = {}) {
  const moveTrack = vi.fn();
  const removeFromPlaylist = vi.fn();
  const rendered = renderWithProviders(
    <PlaylistItemMenu
      idx={1}
      total={5}
      track={track}
      moveTrack={moveTrack}
      removeFromPlaylist={removeFromPlaylist}
      {...props}
    />,
  );
  return { ...rendered, moveTrack, removeFromPlaylist };
}

async function openModal(user: ReturnType<typeof setup>["user"]) {
  await user.click(screen.getAllByRole("button", { name: "Track actions", hidden: true })[0]);
  await screen.findByText("Position");
}

describe("PlaylistItemMenu phone modal (#751)", () => {
  it("shows the position and moves the track with the stepper", async () => {
    const { user, moveTrack } = setup();
    await openModal(user);
    expect(screen.getByText("02 / 05")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Move down" }));
    expect(moveTrack).toHaveBeenCalledWith(1, 2);
  });

  it("moves up", async () => {
    const { user, moveTrack } = setup();
    await openModal(user);
    await user.click(screen.getByRole("button", { name: "Move up" }));
    expect(moveTrack).toHaveBeenCalledWith(1, 0);
  });

  it("disables the arrow at either end", async () => {
    const first = setup({ idx: 0 });
    await openModal(first.user);
    expect((screen.getByRole("button", { name: "Move up" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Move down" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    first.unmount();

    const last = setup({ idx: 4 });
    await openModal(last.user);
    expect((screen.getByRole("button", { name: "Move down" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("adds to a playlist, fetches audio and removes from the playlist", async () => {
    const { user, removeFromPlaylist } = setup();
    await openModal(user);
    await user.click(screen.getByRole("button", { name: "Add to playlist" }));
    expect(mocks.openForTrack).toHaveBeenCalledWith(track);

    await openModal(user);
    await user.click(screen.getByRole("button", { name: "Fetch audio" }));
    expect(mocks.analyzeTrackAsync).toHaveBeenCalledWith(
      expect.objectContaining({ track_id: "t1", friend_id: 7 }),
    );

    await openModal(user);
    await user.click(screen.getByRole("button", { name: "Remove from playlist" }));
    expect(removeFromPlaylist).toHaveBeenCalledWith(1);
  });

  it("omits Fetch audio when the track has audio or no streaming link", async () => {
    const { user } = setup({ track: { ...track, local_audio_url: "a.m4a" } });
    await openModal(user);
    expect(screen.queryByRole("button", { name: "Fetch audio" })).toBeNull();
  });

  it("links Edit to the track edit page and opens recommendations", async () => {
    const { user } = setup();
    await openModal(user);
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
      "/tracks/t1/edit?friend_id=7",
    );
    await user.click(screen.getByRole("button", { name: "AI recommendations" }));
    expect(await screen.findByText("recs")).toBeTruthy();
  });
});

describe("PlaylistItemMenu desktop dropdown", () => {
  it("opens recommendations from the menu", async () => {
    const { user } = setup();
    await user.click(screen.getAllByRole("button", { name: "Track actions", hidden: true })[1]);
    await user.click(
      await screen.findByRole("menuitem", { name: /AI Recommendations/, hidden: true }),
    );
    expect(await screen.findByText("recs")).toBeTruthy();
  });
});
