import { dbQuery } from "@/lib/serverDb";
import type { User, TokenInfo, TokenScope } from "@/types/user";

export const userRepository = {
  async ensureOwner(): Promise<void> {
    const username = process.env.DISCOGS_USERNAME?.trim() || null;
    await dbQuery(
      `INSERT INTO users (name, is_owner, discogs_username) VALUES ($1, true, $2)
       ON CONFLICT (is_owner) WHERE is_owner DO UPDATE
       SET discogs_username = EXCLUDED.discogs_username
       WHERE users.discogs_username IS DISTINCT FROM EXCLUDED.discogs_username`,
      [username || "Owner", username],
    );
  },
  async list(): Promise<User[]> {
    const { rows } = await dbQuery<User>(
      "SELECT * FROM users ORDER BY is_owner DESC, created_at, id",
    );
    return rows;
  },
  async create(name: string, tailscaleLogin: string | null): Promise<User> {
    const { rows } = await dbQuery<User>(
      "INSERT INTO users (name, tailscale_login) VALUES ($1, $2) RETURNING *",
      [name, tailscaleLogin],
    );
    return rows[0];
  },
  async rename(id: string, name: string, tailscaleLogin: string | null): Promise<User | null> {
    const { rows } = await dbQuery<User>(
      "UPDATE users SET name = $2, tailscale_login = $3 WHERE id = $1 RETURNING *",
      [id, name, tailscaleLogin],
    );
    return rows[0] ?? null;
  },
  async device(hash: string): Promise<User | null> {
    const { rows } = await dbQuery<User>(
      `SELECT u.* FROM profile_devices d JOIN users u ON u.id = d.user_id
       WHERE d.token_hash = $1 AND d.expires_at > now()`,
      [hash],
    );
    return rows[0] ?? null;
  },
  async select(
    hash: string,
    userId: string,
    expires: Date,
    previousHash: string | null,
  ): Promise<void> {
    await dbQuery("DELETE FROM profile_devices WHERE expires_at <= now() OR token_hash = $1", [
      previousHash,
    ]);
    await dbQuery(
      "INSERT INTO profile_devices (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [hash, userId, expires],
    );
  },
  async token(
    hash: string,
  ): Promise<(User & { token_id: string; token_hash: string; scope: TokenScope }) | null> {
    const { rows } = await dbQuery<
      User & { token_id: string; token_hash: string; scope: TokenScope }
    >(
      `SELECT u.*, t.id AS token_id, t.token_hash, t.scope FROM api_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.revoked_at IS NULL`,
      [hash],
    );
    return rows[0] ?? null;
  },
  async touchToken(id: string): Promise<void> {
    await dbQuery("UPDATE api_tokens SET last_used_at = now() WHERE id = $1", [id]);
  },
  async tokens(): Promise<TokenInfo[]> {
    const { rows } = await dbQuery<TokenInfo>(
      "SELECT id, user_id, name, scope, created_at, last_used_at, revoked_at FROM api_tokens ORDER BY created_at DESC",
    );
    return rows;
  },
  async createToken(
    userId: string,
    name: string,
    scope: TokenScope,
    hash: string,
  ): Promise<TokenInfo> {
    const { rows } = await dbQuery<TokenInfo>(
      `INSERT INTO api_tokens (user_id, name, scope, token_hash) VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, name, scope, created_at, last_used_at, revoked_at`,
      [userId, name, scope, hash],
    );
    return rows[0];
  },
  async revokeToken(id: string): Promise<void> {
    await dbQuery("UPDATE api_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1", [
      id,
    ]);
  },
};
