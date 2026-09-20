export const shorthands = undefined;

export function up(pgm) {
  // Create sequences
  pgm.createSequence("playlists_id_seq");
  pgm.createSequence("tracks_id_seq");
  pgm.createSequence("id_seq");

  // Create playlists table
  pgm.createTable("playlists", {
    id: {
      type: "integer",
      primaryKey: true,
      default: pgm.func("nextval('playlists_id_seq')"),
    },
    name: {
      type: "varchar(255)",
      notNull: true,
    },
    created_at: {
      type: "timestamp",
      default: pgm.func("current_timestamp"),
    },
  });

  // Create tracks table
  pgm.createTable("tracks", {
    id: {
      type: "integer",
      notNull: true,
      default: pgm.func("nextval('id_seq')"),
    },
    track_id: {
      type: "varchar(255)",
      primaryKey: true,
      default: pgm.func("nextval('tracks_id_seq')"),
      notNull: true,
    },
    title: {
      type: "varchar(255)",
      notNull: true,
    },
    artist: {
      type: "varchar(255)",
      notNull: true,
    },
    album: "varchar(255)",
    year: "varchar(10)",
    styles: {
      type: "text[]",
    },
    genres: {
      type: "text[]",
    },
    duration: "varchar(20)",
    position: "varchar(20)",
    discogs_url: "text",
    apple_music_url: "text",
    album_thumbnail: "text",
    local_tags: "text",
    bpm: {
      type: "varchar(10)",
      default: null,
    },
    key: {
      type: "varchar(10)",
      default: null,
    },
    duration_seconds: "integer",
    notes: {
      type: "text",
      default: "",
    },
    apple_music_persistent_id: "varchar(32)",
    scale: "text",
    danceability: "real",
    mood_happy: "real",
    mood_sad: "real",
    mood_relaxed: "real",
    mood_aggressive: "real",
    youtube_url: "text",
    local_audio_url: "text",
    star_rating: {
      type: "integer",
      default: 0,
    },
    soundcloud_url: "text",
    username: "text",
  });

  // Create playlist_tracks table
  pgm.createTable("playlist_tracks", {
    playlist_id: {
      type: "integer",
      notNull: true,
    },
    track_id: {
      type: "varchar(255)",
      notNull: true,
    },
    position: "integer",
  });
}

export function down(pgm) {
  pgm.dropTable("playlist_tracks");
  pgm.dropTable("tracks");
  pgm.dropTable("playlists");
  pgm.dropSequence("tracks_id_seq");
  pgm.dropSequence("playlists_id_seq");
  pgm.dropSequence("id_seq");
}
