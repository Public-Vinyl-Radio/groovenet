// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Album } from "@/types/track";

const state = vi.hoisted(() => ({
  album: {} as Album,
  mutate: vi.fn(), push: vi.fn(),
  tracks: [{ track_id: "t", title: "Song", artist: "Artist" }],
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ releaseId: "r" }), useSearchParams: () => new URLSearchParams("friend_id=7"), useRouter: () => ({ push: state.push }) }));
vi.mock("@/hooks/useAlbumsQuery", () => ({ useAlbumDetailQuery: () => ({ error: null }) }));
vi.mock("@/hooks/useAlbum", () => ({ useAlbum: () => state.album, useAlbumHydrated: () => true }));
vi.mock("@/hooks/useTrack", () => ({ useTracksByRelease: () => state.tracks, useTracksByReleaseHydrated: () => true }));
vi.mock("@/hooks/useUpdateAlbumWithTracksMutation", () => ({ useUpdateAlbumWithTracksMutation: () => ({ mutateAsync: state.mutate, isPending: false }) }));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: { id: 7 } }) }));
vi.mock("@/components/CoverArtUpload", () => ({ default: () => null }));
vi.mock("@/components/TrackListBuilder", () => ({ default: () => null }));
vi.mock("@/hooks/useGenreTaxonomyQuery", () => ({
  useGenreTaxonomyQuery: () => ({ genres: [{ id: "fusion", name: "Fusion", slug: "fusion", parent_id: null, parent_name: null }], isLoading: false, isError: false }),
  useGenreLookup: () => new Map(),
}));
vi.mock("@/components/GenrePicker", () => ({ default: ({ label, onChange }: { label: string; onChange: (genres: []) => void }) => <button onClick={() => onChange([])}>Clear {label}</button> }));
import Page from "./page";
beforeEach(() => {
  state.mutate.mockReset().mockResolvedValue({});
  state.push.mockReset();
  state.album = { release_id: "r", friend_id: 7, title: "Album", artist: "Artist", track_count: 1, genres: ["Jazz"], styles: ["Source Style"], genre_override_ids: [], style_override_ids: ["fusion"] };
});
describe("album edit replacement submission", () => {
  it("hydrates replacements, stages reset and empty selections, and submits no source writes", async () => {
    const { user } = renderWithProviders(<Page />);
    expect(screen.queryByDisplayValue("Jazz")).toBeNull();
    expect(screen.getByText("Discogs styles: Source Style")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reset styles to Discogs" }));
    await user.click(screen.getByRole("button", { name: "Clear Your genres" }));
    await user.click(screen.getAllByRole("button", { name: "Save Changes" })[0]);
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ release_id: "r", friend_id: 7, album: expect.objectContaining({ genre_override_ids: [], style_override_ids: null }) }));
    expect(state.mutate.mock.calls[0][0].album).not.toHaveProperty("genres");
    expect(state.mutate.mock.calls[0][0].album).not.toHaveProperty("styles");
    expect(state.push).toHaveBeenCalledWith("/albums/r?friend_id=7");
  });
  it("keeps a collection with no overrides following Discogs on a metadata-only save", async () => {
    state.album = { ...state.album, genre_override_ids: undefined, style_override_ids: null, genres: null, styles: [] };
    const { user } = renderWithProviders(<Page />);
    await user.click(screen.getAllByRole("button", { name: "Save Changes" })[0]);
    expect(state.mutate.mock.calls[0][0].album).toMatchObject({ genre_override_ids: null, style_override_ids: null });
  });
  it("puts Cancel and Save in the page header, and Cancel returns to the album", async () => {
    const { user } = renderWithProviders(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: "Edit Album" })).toBeTruthy();
    await user.click(within(screen.getByTestId("page-header")).getByRole("button", { name: "Cancel", hidden: true }));
    expect(state.push).toHaveBeenCalledWith("/albums/r?friend_id=7");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("saves from the header action", async () => {
    const { user } = renderWithProviders(<Page />);
    await user.click(within(screen.getByTestId("page-header")).getByRole("button", { name: "Save Changes", hidden: true }));
    expect(state.mutate).toHaveBeenCalledTimes(1);
  });
});
