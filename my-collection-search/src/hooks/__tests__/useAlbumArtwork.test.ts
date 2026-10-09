import { describe, expect, it } from "vitest";
import { useAlbumStore } from "@/stores/albumStore";
import { useTrackStore } from "@/stores/trackStore";
import type { Album, Track } from "@/types/track";
import { syncArtworkIntoStores } from "../useAlbumArtwork";

describe("syncArtworkIntoStores", () => {
  it("clears a cover that no longer exists, so views fall back to the thumbnail", () => {
    useAlbumStore.getState().setAlbum({
      release_id: "r1",
      friend_id: 7,
      title: "Blue Lines",
      artist: "Massive Attack",
      track_count: 1,
      audio_file_album_art_url: "/uploads/album-covers/old.jpg",
    } as Album);
    useTrackStore.getState().setTracks([
      { track_id: "t1", friend_id: 7, release_id: "r1", audio_file_album_art_url: "/old.jpg" } as Track,
    ]);

    syncArtworkIntoStores({
      release_id: "r1",
      friend_id: 7,
      current_url: null,
      source: null,
      discogs_art_url: null,
      apple_music_art_url: null,
      art_match_status: null,
      art_match_distance: null,
      has_local_audio: false,
    });

    expect(useAlbumStore.getState().getAlbum("r1", 7)?.audio_file_album_art_url).toBe("");
    expect(useTrackStore.getState().getTrack("t1", 7)?.audio_file_album_art_url).toBe("");
  });
});
