export const up = (pgm) =>
  pgm.sql(`
  ALTER TABLE server_players
    ADD COLUMN availability_policy text NOT NULL DEFAULT 'ask'
    CHECK (availability_policy IN ('ask', 'allow_unknown', 'always'));
`);

export const down = (pgm) => pgm.dropColumn("server_players", "availability_policy");
