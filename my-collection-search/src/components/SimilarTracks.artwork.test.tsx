// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";
const result = vi.hoisted(() => ({
  data: { tracks: [] as Track[], count: 1, filters: {} },
  isLoading: false,
  error: null,
}));
vi.mock("@/hooks/useSimilarTracks", () => ({ useSimilarTracks: () => result }));
vi.mock("@/hooks/useSimilarVibeTracks", () => ({ useSimilarVibeTracks: () => result }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ replacePlaylist: vi.fn(), appendToQueue: vi.fn() }),
}));
vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack: vi.fn() }) }));
vi.mock("@/components/TrackActionsMenu", () => ({ default: () => null }));
vi.mock("@/hooks/useGenreTaxonomyQuery", () => ({ useGenreLookup: () => new Map() }));
import SimilarTracks from "./SimilarTracks";
import SimilarVibeTracks from "./SimilarVibeTracks";
const seed = { track_id: "seed", friend_id: 7, title: "Seed", artist: "A" } as Track;
for (const Component of [SimilarTracks, SimilarVibeTracks]) {
  it.each([
    ["/chosen.jpg", "/discogs.jpg", "/chosen.jpg"],
    ["", "/discogs.jpg", "/discogs.jpg"],
    ["", "", "/images/placeholder-artwork.png"],
  ])(
    `${Component.name} displays chosen art then Discogs then placeholder (%s, %s)`,
    (chosen, discogs, expected) => {
      const item = {
        ...seed,
        track_id: "related",
        distance: 0.1,
        audio_file_album_art_url: chosen,
        album_thumbnail: discogs,
      };
      result.data.tracks = [item];
      const { container } = renderWithProviders(<Component track={seed} />);
      const src = container.querySelector("img")?.getAttribute("src");
      if (!chosen && !discogs) expect(src).toMatch(/^data:image\/svg\+xml,/);
      else expect(src).toBe(expected);
      expect(item.album_thumbnail).toBe(discogs);
    },
  );
}
