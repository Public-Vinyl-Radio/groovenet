// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

// Only the record-care wiring is under test; everything else is stubbed.
vi.mock("next/navigation", () => ({
  useParams: () => ({ releaseId: "rel" }),
  useSearchParams: () => new URLSearchParams("friend_id=7"),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/hooks/useAlbumsQuery", () => ({
  useAlbumDetailQuery: () => ({ error: null }),
  useUpdateAlbumMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useAlbum", () => ({
  useAlbum: () => ({ release_id: "rel", friend_id: 7, title: "Blue Lines", artist: "Massive Attack", track_count: 0 }),
  useAlbumHydrated: () => true,
}));
vi.mock("@/hooks/useTrack", () => ({
  useTracksByRelease: () => [],
  useTracksByReleaseHydrated: () => true,
}));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ replacePlaylist: vi.fn() }),
}));
vi.mock("@/services/internalApi/albums", () => ({
  fetchAlbumDiscogsRawRelease: vi.fn(() => new Promise(() => {})),
  queueAlbumDownloads: vi.fn(),
}));
vi.mock("@/components/spins/AlbumSpinPanel", () => ({ default: () => null }));
vi.mock("@/components/records/AlbumRecordCarePanel", () => ({
  default: (props: { releaseId: string; friendId: number }) => (
    <section aria-label="Copies & care">{props.releaseId}:{props.friendId}</section>
  ),
}));
vi.mock("@/components/records/RecordActionDialog", () => ({
  default: (props: { open: boolean; releaseId: string; onOpenChange: (open: boolean) => void }) =>
    props.open ? (
      <div role="dialog" aria-label="Log care">
        <button onClick={() => props.onOpenChange(false)}>Close care</button>
      </div>
    ) : null,
}));

import AlbumDetailPage from "./page";

afterEach(() => vi.clearAllMocks());

describe("album page record care", () => {
  it("shows the copies panel and logs care from the album menu", async () => {
    const { user } = renderWithProviders(<AlbumDetailPage />);

    expect((await screen.findByRole("region", { name: "Copies & care" })).textContent).toBe("rel:7");

    await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Log Care/ }));
    expect(await screen.findByRole("dialog", { name: "Log care" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close care" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log care" })).toBeNull());
  });
});
