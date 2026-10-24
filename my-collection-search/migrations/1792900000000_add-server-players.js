/**
 * Named server players own independent queues/checkpoints, not speaker sessions.
 * assigned_output is a fenced worker claim and is cleared on worker startup;
 * desired_output remains in state. Queue references survive collection deletion
 * and are resolved against tracks again at playback time.
 */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE server_players (
      id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
      name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
      engine_id text NOT NULL UNIQUE CHECK (engine_id ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
      revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
      assigned_output text UNIQUE,
      state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object' AND jsonb_typeof(state->'queue') = 'array'),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
};
export const down = (pgm) => pgm.dropTable("server_players");
