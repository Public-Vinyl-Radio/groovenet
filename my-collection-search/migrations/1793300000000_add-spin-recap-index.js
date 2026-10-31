export const up = (pgm) => {
  pgm.createIndex("track_spin_events", ["friend_id", "played_at"], {
    name: "idx_track_spin_events_friend_played_at",
  });
};
export const down = (pgm) => {
  pgm.dropIndex("track_spin_events", ["friend_id", "played_at"], {
    name: "idx_track_spin_events_friend_played_at",
  });
};
