/**
 * Playlist owners and private playlists (#1284, epic #569).
 *
 * Every playlist belongs to one household profile and is visible to the whole
 * household (`household`, the default) or only to its owner (`private`).
 *
 * Backfill: every existing playlist is the owner's and stays `household`, so
 * the upgrade changes nothing anyone sees. The owner row is created here if
 * the app has not seeded it yet, as the track-ratings migration does.
 *
 * `owner_id` defaults to the household owner (`household_owner_id()`), so an
 * older image still running between this migration and the app restart keeps
 * creating playlists, owned by the owner as before. The app always passes the
 * current profile.
 */
export const up = (pgm) => {
  pgm.sql(`
    INSERT INTO users (name, is_owner) VALUES ('Owner', true)
    ON CONFLICT (is_owner) WHERE is_owner DO NOTHING;

    CREATE FUNCTION household_owner_id() RETURNS uuid
      LANGUAGE sql STABLE AS $$ SELECT id FROM users WHERE is_owner $$;

    ALTER TABLE playlists
      ADD COLUMN owner_id uuid REFERENCES users(id),
      ADD COLUMN visibility text NOT NULL DEFAULT 'household'
        CONSTRAINT playlists_visibility_check CHECK (visibility IN ('household', 'private'));

    UPDATE playlists SET owner_id = household_owner_id();

    ALTER TABLE playlists
      ALTER COLUMN owner_id SET DEFAULT household_owner_id(),
      ALTER COLUMN owner_id SET NOT NULL;

    CREATE INDEX playlists_owner ON playlists (owner_id);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX playlists_owner;
    ALTER TABLE playlists DROP COLUMN visibility, DROP COLUMN owner_id;
    DROP FUNCTION household_owner_id();
  `);
};
