/** Durable, per-queue-entry delivery of digital server-player plays. */
export const up = (pgm) => pgm.sql(`
  CREATE TABLE server_player_plays (
    entry_id uuid PRIMARY KEY,
    player_id text NOT NULL REFERENCES server_players(id),
    track_id text NOT NULL,
    friend_id integer NOT NULL,
    release_id text NOT NULL,
    started_at timestamptz NOT NULL,
    logged_at timestamptz
  );
  CREATE INDEX server_player_plays_pending ON server_player_plays (started_at) WHERE logged_at IS NULL;
`);

export const down = (pgm) => pgm.dropTable("server_player_plays");
