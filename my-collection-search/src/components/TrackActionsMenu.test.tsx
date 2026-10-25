// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { chooseMenuItem, renderWithProviders } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  appendToQueue: vi.fn(),
  replacePlaylist: vi.fn(),
  openForTrack: vi.fn(),
  mutateAsync: vi.fn(),
  analyzeTrackAsync: vi.fn().mockResolvedValue({ jobId: "job1" }),
  saveTrack: vi.fn().mockResolvedValue({}),
  softDeleteTrack: vi.fn().mockResolvedValue({}),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({
    appendToQueue: mocks.appendToQueue,
    replacePlaylist: mocks.replacePlaylist,
  }),
}));
vi.mock("@/hooks/useAddToPlaylistDialog", () => ({
  useAddToPlaylistDialog: () => ({
    openForTrack: mocks.openForTrack,
    playlistDialog: null,
    nameDialog: null,
  }),
}));
vi.mock("@/hooks/useUploadTrackAudioMutation", () => ({
  useUploadTrackAudioMutation: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));
vi.mock("@/services/internalApi/tracks", () => ({
  analyzeTrackAsync: mocks.analyzeTrackAsync,
  saveTrack: mocks.saveTrack,
  softDeleteTrack: mocks.softDeleteTrack,
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import TrackActionsMenu from "./TrackActionsMenu";
import { TrackCardContext } from "./trackCardContext";

afterEach(() => vi.clearAllMocks());

const trackWithEverything = {
  track_id: "t1",
  friend_id: 7,
  title: "Full House",
  artist: "DJ Test",
  local_audio_url: "t1.m4a",
  apple_music_url: "https://music.apple.com/x",
  youtube_url: "https://youtube.com/x",
  soundcloud_url: "https://soundcloud.com/x",
} as Track;

const trackMinimal = {
  track_id: "t2",
  friend_id: 7,
  title: "Bare",
  artist: "DJ Test",
} as Track;

function setup(
  track: Track = trackWithEverything,
  props: Partial<React.ComponentProps<typeof TrackActionsMenu>> = {}
) {
  const rendered = renderWithProviders(<TrackActionsMenu track={track} {...props} />);
  const menuButton = screen.getAllByRole("button", { name: "Track actions", hidden: true })[1];
  return { ...rendered, menuButton };
}

describe("TrackActionsMenu phone trigger", () => {
  it("is compact by default and a full 44px target when prominent", () => {
    const { unmount } = renderWithProviders(<TrackActionsMenu track={trackMinimal} />);
    const compact = screen.getAllByRole("button", { name: "Track actions", hidden: true })[0];
    expect(getComputedStyle(compact).width).not.toBe("44px");
    unmount();

    renderWithProviders(<TrackActionsMenu track={trackMinimal} prominent />);
    const prominent = screen.getAllByRole("button", { name: "Track actions", hidden: true })[0];
    expect(getComputedStyle(prominent).width).toBe("44px");
    expect(getComputedStyle(prominent).height).toBe("44px");
  });
});

describe("TrackActionsMenu on a track card (#722)", () => {
  it("is a 44px touch target on a phone and a 32px outline button on desktop, via the card context or the prop", () => {
    const { unmount } = renderWithProviders(
      <TrackCardContext.Provider value={true}>
        <TrackActionsMenu track={trackMinimal} />
      </TrackCardContext.Provider>
    );
    const [phone, desktop] = screen.getAllByRole("button", { name: "Track actions", hidden: true });
    expect(getComputedStyle(phone).width).toBe("44px");
    expect(getComputedStyle(phone).height).toBe("44px");
    expect(getComputedStyle(desktop).width).toBe("32px");
    expect(getComputedStyle(desktop).height).toBe("32px");
    unmount();

    renderWithProviders(<TrackActionsMenu track={trackMinimal} compact />);
    expect(getComputedStyle(screen.getAllByRole("button", { name: "Track actions", hidden: true })[0]).width).toBe("44px");
  });

  it("puts the star rating in the phone sheet and saves it", async () => {
    const rendered = renderWithProviders(
      <TrackCardContext.Provider value={true}>
        <TrackActionsMenu track={{ ...trackMinimal, star_rating: 2 }} />
      </TrackCardContext.Provider>
    );
    await rendered.user.click(screen.getAllByRole("button", { name: "Track actions", hidden: true })[0]);
    await screen.findByText("Playlist");

    expect(screen.getByText("Rating")).toBeTruthy();
    await rendered.user.click(screen.getByRole("radio", { name: "5 stars", hidden: true }));

    expect(mocks.saveTrack).toHaveBeenCalledWith({ track_id: "t2", friend_id: 7, star_rating: 5 });
  });

  it("has no rating row outside a card", async () => {
    const rendered = renderWithProviders(<TrackActionsMenu track={trackMinimal} />);
    await rendered.user.click(screen.getAllByRole("button", { name: "Track actions", hidden: true })[0]);
    await screen.findByText("Playlist");

    expect(screen.queryByText("Rating")).toBeNull();
  });
});

describe("TrackActionsMenu desktop dropdown — conditional items", () => {
  it("shows Play and Remove Audio only when the track has local audio", async () => {
    const { user, menuButton } = setup(trackWithEverything);
    await user.click(menuButton);
    expect(await screen.findByRole("menuitem", { name: /^Play$/, hidden: true })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Remove Audio/, hidden: true })).toBeTruthy();
  });

  it("hides Play and Remove Audio without local audio, but still offers Fetch Audio with a streaming link", async () => {
    const { user, menuButton } = setup({
      ...trackMinimal,
      apple_music_url: "https://music.apple.com/x",
    });
    await user.click(menuButton);
    await screen.findByRole("menuitem", { name: /Add to Playlist/, hidden: true });
    expect(screen.queryByRole("menuitem", { name: /^Play$/, hidden: true })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Remove Audio/, hidden: true })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Fetch Audio/, hidden: true })).toBeTruthy();
  });

  it("omits Fetch Audio and streaming links without any streaming URL", async () => {
    const { user, menuButton } = setup({ ...trackMinimal, local_audio_url: "t2.m4a" });
    await user.click(menuButton);
    await screen.findByRole("menuitem", { name: /Delete Track/, hidden: true });
    expect(screen.queryByRole("menuitem", { name: /Fetch Audio/, hidden: true })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Apple Music/, hidden: true })).toBeNull();
  });

  it("lists only the streaming links the track actually has", async () => {
    const { user, menuButton } = setup({
      ...trackMinimal,
      apple_music_url: "https://music.apple.com/x",
    });
    await user.click(menuButton);
    expect(await screen.findByRole("menuitem", { name: /Apple Music/, hidden: true })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /YouTube/, hidden: true })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /SoundCloud/, hidden: true })).toBeNull();
  });

  it("hides Edit Track when hideEdit is set, and Track Debug without a handler", async () => {
    const { user, menuButton } = setup(trackWithEverything, { hideEdit: true });
    await user.click(menuButton);
    await screen.findByRole("menuitem", { name: /Add to Playlist/, hidden: true });
    expect(screen.queryByRole("menuitem", { name: /Edit Track/, hidden: true })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Track Debug/, hidden: true })).toBeNull();
  });

  it("offers Track Debug when a handler is given", async () => {
    const { user, menuButton } = setup(trackWithEverything, { onOpenTrackDebug: vi.fn() });
    await user.click(menuButton);
    expect(await screen.findByRole("menuitem", { name: /Track Debug/, hidden: true })).toBeTruthy();
  });
});

describe("TrackActionsMenu desktop dropdown — selecting an item", () => {
  it("plays the track", async () => {
    const { user, menuButton } = setup(trackWithEverything);
    await chooseMenuItem(user, menuButton, /^Play$/);
    expect(mocks.replacePlaylist).toHaveBeenCalledWith([trackWithEverything], {
      autoplay: true,
      startIndex: 0,
    });
  });

  it("opens the add-to-playlist dialog", async () => {
    const { user, menuButton } = setup(trackWithEverything);
    await chooseMenuItem(user, menuButton, /Add to Playlist/);
    expect(mocks.openForTrack).toHaveBeenCalledWith(trackWithEverything);
  });

  it("queues enrichment and navigates to /enrich", async () => {
    const { user, menuButton } = setup(trackWithEverything);
    await chooseMenuItem(user, menuButton, /Enrich Track/);
    expect(mocks.push).toHaveBeenCalledWith("/enrich");
  });

  it("adds the track to the play queue", async () => {
    const { user, menuButton } = setup(trackWithEverything);
    await chooseMenuItem(user, menuButton, /Add to Queue/);
    expect(mocks.appendToQueue).toHaveBeenCalledWith(trackWithEverything);
  });

  it("fetches audio from streaming links", async () => {
    const { user, menuButton } = setup(trackWithEverything);
    await chooseMenuItem(user, menuButton, /Fetch Audio/);
    expect(mocks.analyzeTrackAsync).toHaveBeenCalledWith(
      expect.objectContaining({ track_id: "t1", friend_id: 7 })
    );
  });

  it("opens the remove-audio confirmation", async () => {
    const { user, menuButton } = setup(trackWithEverything);
    await chooseMenuItem(user, menuButton, /Remove Audio/);
    expect(await screen.findByRole("alertdialog", { name: "Remove audio" })).toBeTruthy();
  });

  it("opens the delete-track confirmation", async () => {
    const { user, menuButton } = setup(trackWithEverything);
    await chooseMenuItem(user, menuButton, /Delete Track/);
    expect(await screen.findByRole("alertdialog", { name: "Delete track" })).toBeTruthy();
  });
});

describe("TrackActionsMenu desktop dropdown — grouping", () => {
  it("orders primary, audio, destructive (adjacent) and external-link groups", async () => {
    const { user, menuButton } = setup(trackWithEverything, {
      onOpenTrackDebug: vi.fn(),
      onChangeArtwork: vi.fn(),
    });
    await user.click(menuButton);
    await screen.findByRole("menuitem", { name: /^Play$/, hidden: true });
    const names = screen
      .getAllByRole("menuitem", { hidden: true })
      .map((el) => el.textContent?.trim());
    expect(names).toEqual([
      "Play",
      "Add to Queue",
      "Add to Playlist",
      "Edit Track",
      "Enrich Track",
      "Cover Art...",
      "Track Debug",
      "Fetch Audio",
      "Upload Audio",
      "Remove Audio",
      "Delete Track",
      "Apple Music",
      "YouTube",
      "SoundCloud",
    ]);
  });
});

describe("TrackActionsMenu desktop dropdown — optional items", () => {
  // One menu opening per test: reopening straight after a selection races the
  // closing menu's focus restore, and flaked on a loaded CI runner.
  it("opens cover art from its item", async () => {
    const onChangeArtwork = vi.fn();
    const { user, menuButton } = setup(trackWithEverything, { onChangeArtwork, onOpenTrackDebug: vi.fn() });
    await chooseMenuItem(user, menuButton, /Cover Art/);
    expect(onChangeArtwork).toHaveBeenCalled();
  });

  it("opens track debug from its item", async () => {
    const onOpenTrackDebug = vi.fn();
    const { user, menuButton } = setup(trackWithEverything, { onChangeArtwork: vi.fn(), onOpenTrackDebug });
    await chooseMenuItem(user, menuButton, /Track Debug/);
    expect(onOpenTrackDebug).toHaveBeenCalled();
  });
});

describe("TrackActionsMenu phone modal (#735)", () => {
  async function openModal(
    track: Track = trackWithEverything,
    props: Partial<React.ComponentProps<typeof TrackActionsMenu>> = {}
  ) {
    const rendered = renderWithProviders(<TrackActionsMenu track={track} {...props} />);
    const trigger = screen.getAllByRole("button", { name: "Track actions", hidden: true })[0];
    await rendered.user.click(trigger);
    await screen.findByText("Playlist");
    return { ...rendered, trigger };
  }

  it("is a labelled dialog headed by the track and its catalogue line", async () => {
    await openModal({
      ...trackWithEverything,
      library_identifier: "LP-350",
      position: "B5",
      bpm: "124.2",
      key: "F# major",
      album_thumbnail: "https://img.test/cover.jpg",
    });
    expect(document.querySelector('img[src="https://img.test/cover.jpg"]')).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Full House" })).toBeTruthy();
    expect(screen.getByText("DJ Test")).toBeTruthy();
    expect(screen.getByText(/LP-350 · Side B5 · 124 BPM · /)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("leaves the catalogue line out when the track has nothing for it", async () => {
    await openModal(trackMinimal);
    expect(screen.queryByText(/BPM|Side/)).toBeNull();
  });

  it("groups the actions under Library, Audio, Open in and Danger, in that order", async () => {
    await openModal(trackWithEverything, { onOpenTrackDebug: vi.fn(), onChangeArtwork: vi.fn() });
    const labels = [
      "Play", "Queue", "Playlist", "Library", "Edit track", "Enrich track", "Cover art...", "Track debug",
      "Audio", "Fetch audio", "Upload audio", "Open in", "Apple Music", "YouTube", "SoundCloud",
      "Danger", "Remove audio", "Delete track",
    ];
    for (let i = 1; i < labels.length; i++) {
      const prev = screen.getByText(labels[i - 1]);
      const next = screen.getByText(labels[i]);
      expect(prev.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("drops what the track cannot do: no Play, Fetch, Open in or Remove audio", async () => {
    await openModal(trackMinimal, { hideEdit: true });
    for (const label of ["Play", "Fetch audio", "Open in", "Apple Music", "Remove audio", "Edit track"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByText("Delete track")).toBeTruthy();
  });

  it("links Edit track and opens streaming links in a new tab", async () => {
    await openModal();
    expect(screen.getByText("Edit track").closest("a")?.getAttribute("href")).toBe("/tracks/t1/edit?friend_id=7");
    const apple = screen.getByText("Apple Music").closest("a");
    expect(apple?.getAttribute("href")).toBe("https://music.apple.com/x");
    expect(apple?.getAttribute("target")).toBe("_blank");
  });

  it.each([
    ["Play", () => expect(mocks.replacePlaylist).toHaveBeenCalled()],
    ["Queue", () => expect(mocks.appendToQueue).toHaveBeenCalledWith(trackWithEverything)],
    ["Playlist", () => expect(mocks.openForTrack).toHaveBeenCalledWith(trackWithEverything)],
    ["Enrich track", () => expect(mocks.push).toHaveBeenCalledWith("/enrich")],
    ["Fetch audio", () => expect(mocks.analyzeTrackAsync).toHaveBeenCalled()],
  ])("runs %s and closes the modal", async (label, assertion) => {
    const { user } = await openModal();
    await user.click(screen.getByText(label));
    await vi.waitFor(assertion);
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Full House", hidden: true })).toBeNull());
  });

  it("runs cover art and track debug", async () => {
    const onChangeArtwork = vi.fn();
    const onOpenTrackDebug = vi.fn();
    const { user, trigger } = await openModal(trackWithEverything, { onChangeArtwork, onOpenTrackDebug });
    await user.click(screen.getByText("Cover art..."));
    expect(onChangeArtwork).toHaveBeenCalled();
    await user.click(trigger);
    await user.click(await screen.findByText("Track debug"));
    expect(onOpenTrackDebug).toHaveBeenCalled();
  });

  it("closes from the close button", async () => {
    const { user } = await openModal();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Full House", hidden: true })).toBeNull());
  });

  it("confirms Remove audio and removes on confirm", async () => {
    const { user } = await openModal();
    await user.click(screen.getByText("Remove audio"));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove audio" });
    await user.click(within(dialog).getByRole("button", { name: "Remove audio" }));
    await vi.waitFor(() =>
      expect(mocks.saveTrack).toHaveBeenCalledWith({ track_id: "t1", friend_id: 7, local_audio_url: null })
    );
  });

  it("deletes the track after confirming, and cancelling deletes nothing", async () => {
    const { user } = await openModal();
    await user.click(screen.getByText("Delete track"));
    let dialog = await screen.findByRole("alertdialog", { name: "Delete track" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mocks.softDeleteTrack).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Track actions", hidden: true })[0]);
    await user.click(await screen.findByText("Delete track"));
    dialog = await screen.findByRole("alertdialog", { name: "Delete track" });
    await user.click(within(dialog).getByRole("button", { name: "Delete track" }));
    await vi.waitFor(() =>
      expect(mocks.softDeleteTrack).toHaveBeenCalledWith({ track_id: "t1", friend_id: 7 })
    );
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "Track deleted", type: "success" }));
  });

  it("keeps the delete prompt open and reports a failure", async () => {
    mocks.softDeleteTrack.mockRejectedValueOnce(new Error("nope"));
    const { user } = await openModal();
    await user.click(screen.getByText("Delete track"));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete track" });
    await user.click(within(dialog).getByRole("button", { name: "Delete track" }));
    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Failed to delete track", type: "error" }))
    );
    expect(screen.getByRole("alertdialog", { name: "Delete track" })).toBeTruthy();
  });

  it("refuses to delete a track without a friend_id", async () => {
    const { user } = await openModal({ ...trackMinimal, friend_id: undefined } as unknown as Track);
    await user.click(screen.getByText("Delete track"));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete track" });
    await user.click(within(dialog).getByRole("button", { name: "Delete track" }));
    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({ title: "Track missing friend_id", type: "error" })
    );
    expect(mocks.softDeleteTrack).not.toHaveBeenCalled();
  });

  it("uploads chosen audio with the track's friend_id", async () => {
    mocks.mutateAsync.mockResolvedValue({ analysis: {}, local_audio_url: "a.m4a" });
    await openModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "song.mp3", { type: "audio/mpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ file, track_id: "t1", friend_id: 7 })
      )
    );
  });

  it("opens the upload picker from Upload audio", async () => {
    await openModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    const { user } = { user: (await import("@testing-library/user-event")).default.setup() };
    await user.click(screen.getByText("Upload audio"));
    expect(click).toHaveBeenCalled();
  });
});
