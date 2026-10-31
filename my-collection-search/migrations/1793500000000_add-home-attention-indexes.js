/** Small friend-scoped indexes for the counts read on every Home visit. */
export const up = (pgm) => {
  pgm.createIndex("tracks", "friend_id", {
    name: "idx_tracks_friend_missing_audio",
    where: "local_audio_url IS NULL OR local_audio_url = ''",
  });
  pgm.createIndex("tracks", "friend_id", {
    name: "idx_tracks_friend_missing_analysis",
    where: "bpm IS NULL OR key IS NULL",
  });
};
export const down = (pgm) => {
  pgm.dropIndex("tracks", "friend_id", { name: "idx_tracks_friend_missing_analysis" });
  pgm.dropIndex("tracks", "friend_id", { name: "idx_tracks_friend_missing_audio" });
};
