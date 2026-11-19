// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useRankingProfiles", async () => {
  const { rankingProfileMock } = await import("@/test/rankingProfileMock");
  return rankingProfileMock.module;
});
vi.mock("@/hooks/useSuggestionScope", () => ({
  useSuggestionScope: () => ({
    scope: "library",
    libraryFriendId: 4,
    ready: true,
    setScope: vi.fn(),
  }),
}));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ replacePlaylist: vi.fn() }),
}));
vi.mock("@/hooks/useRecommendations", () => ({
  useRecommendationsQuery: () => ({ data: [], isLoading: false }),
}));

import PlaylistActionsMenu from "./PlaylistActionsMenu";
import SuggestionsPanel from "./SuggestionsPanel";

const track = { track_id: "p1", friend_id: 4, title: "T", artist: "A", bpm: "120" } as Track;

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PlaylistActionsMenu
        onSortGreedy={vi.fn()}
        onSortGenetic={vi.fn()}
        onSortCohesiveBlocks={vi.fn()}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onExportPdf={vi.fn()}
        onOpenSaveDialog={vi.fn()}
        enqueuePlaylist={vi.fn()}
        onOpenRecommendations={() => setOpen(true)}
      />
      {open && (
        <SuggestionsPanel
          playlist={[track]}
          seed={null}
          onSeedChange={vi.fn()}
          onAdd={vi.fn()}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

beforeEach(() => setViewportWidth(390));
afterEach(() => setViewportWidth(1280));

describe("Suggestions from the phone actions sheet (#1234)", () => {
  it("stays open after the actions sheet closes", async () => {
    const { user } = renderWithProviders(<Harness />);
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Suggestions" }));
    // The actions sheet finishes closing, then the suggestions sheet must still be there.
    await waitFor(() => expect(screen.queryByText("Playlist actions")).toBeNull());
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByTestId("suggestions-sheet")).toBeTruthy();
  });
});
