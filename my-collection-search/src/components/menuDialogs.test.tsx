// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// A link that "navigates" by running the page's route-change callback, as the router would.
vi.mock("next/link", () => ({
  default: ({ href, onClick, children, ...rest }: React.ComponentProps<"a">) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
        mocks.navigate();
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ appendToQueue: vi.fn(), replacePlaylist: vi.fn() }),
}));
vi.mock("@/hooks/useAddToPlaylistDialog", () => ({
  useAddToPlaylistDialog: () => ({ openForTrack: vi.fn(), playlistDialog: null, nameDialog: null }),
}));

import TrackActionsMenu from "./TrackActionsMenu";
import PlaylistActionsMenu from "./PlaylistActionsMenu";

const track = {
  track_id: "t1",
  friend_id: 7,
  title: "Full House",
  artist: "DJ Test",
  local_audio_url: "t1.m4a",
} as Track;

const expectNoScrollLock = () => {
  expect(document.body.hasAttribute("data-scroll-lock")).toBe(false);
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(document.body.style.pointerEvents).not.toBe("none");
};

beforeEach(() => setViewportWidth(390));
afterEach(() => {
  setViewportWidth(1280);
  mocks.navigate.mockReset();
});

const phoneTrigger = (name: string) => screen.getAllByRole("button", { name, hidden: true })[0];

describe("menu items on a phone run after the sheet closes (#1234)", () => {
  it("runs a Track menu action only once the sheet is gone", async () => {
    const onOpenFileInfo = vi.fn();
    const { user } = renderWithProviders(
      <TrackActionsMenu track={track} onOpenFileInfo={onOpenFileInfo} />,
    );
    await user.click(phoneTrigger("Track actions"));
    await user.click(await screen.findByRole("button", { name: "File info" }));
    await waitFor(() => expect(onOpenFileInfo).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "File info" })).toBeNull();
    expectNoScrollLock();
  });

  it("runs the playlist actions Rename, Duplicate, Create set and Import after closing", async () => {
    const onRename = vi.fn();
    const onDuplicate = vi.fn();
    const onCreateSet = vi.fn();
    const onImportJson = vi.fn();
    const { user } = renderWithProviders(
      <PlaylistActionsMenu
        onSortGreedy={vi.fn()}
        onSortGenetic={vi.fn()}
        onSortCohesiveBlocks={vi.fn()}
        onExportJson={vi.fn()}
        onImportJson={onImportJson}
        onExportPdf={vi.fn()}
        onOpenSaveDialog={vi.fn()}
        enqueuePlaylist={vi.fn()}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onCreateSet={onCreateSet}
      />,
    );
    const items: [string, ReturnType<typeof vi.fn>][] = [
      ["Rename", onRename],
      ["Duplicate", onDuplicate],
      ["Create set", onCreateSet],
      ["Import & append JSON", onImportJson],
    ];
    for (const [name, handler] of items) {
      await user.click(phoneTrigger("Playlist actions"));
      await user.click(await screen.findByRole("button", { name }));
      await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("button", { name })).toBeNull();
      expectNoScrollLock();
    }
  });

  it("releases the scroll lock when an item navigates away (Edit track)", async () => {
    function Page() {
      const [onPage, setOnPage] = useState(true);
      mocks.navigate.mockImplementation(() => setOnPage(false));
      return onPage ? <TrackActionsMenu track={track} /> : <p>Edit page</p>;
    }
    const { user } = renderWithProviders(<Page />);
    await user.click(phoneTrigger("Track actions"));
    await user.click(await screen.findByRole("link", { name: "Edit track" }));
    await screen.findByText("Edit page");
    await waitFor(expectNoScrollLock);
  });

  it("releases the scroll lock when the page stays mounted after a link item", async () => {
    const { user } = renderWithProviders(<TrackActionsMenu track={track} />);
    await user.click(phoneTrigger("Track actions"));
    await user.click(await screen.findByRole("link", { name: "Edit track" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Edit track" })).toBeNull());
    await waitFor(expectNoScrollLock);
  });
});
