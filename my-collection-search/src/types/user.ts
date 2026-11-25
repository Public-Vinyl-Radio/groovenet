/** Household identity; independent of Discogs libraries and ranking profiles. */
export type User = {
  id: string;
  name: string;
  is_owner: boolean;
  discogs_username: string | null;
  tailscale_login: string | null;
};
export type TokenScope = "read" | "write" | "ingest";
export type TokenInfo = {
  id: string;
  user_id: string;
  name: string;
  scope: TokenScope;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};
