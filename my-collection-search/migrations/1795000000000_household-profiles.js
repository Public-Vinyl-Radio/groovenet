export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
      is_owner boolean NOT NULL DEFAULT false,
      discogs_username text,
      tailscale_login text UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX users_one_owner ON users (is_owner) WHERE is_owner;
    CREATE TABLE profile_devices (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE api_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
      scope text NOT NULL CHECK (scope IN ('read', 'write', 'ingest')),
      token_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz,
      revoked_at timestamptz
    );
  `);
};
export const down = (pgm) => {
  pgm.dropTable("api_tokens");
  pgm.dropTable("profile_devices");
  pgm.dropTable("users");
};
