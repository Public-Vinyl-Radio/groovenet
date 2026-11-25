import { http } from "@/services/http";
import type { User, TokenInfo, TokenScope } from "@/types/user";
export type PublicProfile = Pick<User, "id" | "name" | "is_owner">;
export type ProfilesResponse = { users: PublicProfile[]; current: User | null; selected: boolean };
const send = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const profilesApi = {
  list: () => http<ProfilesResponse>("/api/profiles"),
  select: (user_id: string) => http("/api/profiles/select", send("POST", { user_id })),
  create: (name: string, tailscale_login: string | null) =>
    http("/api/profiles", send("POST", { name, tailscale_login })),
  rename: (id: string, name: string, tailscale_login: string | null) =>
    http("/api/profiles", send("PATCH", { id, name, tailscale_login })),
  tokens: () => http<{ tokens: TokenInfo[]; users: User[] }>("/api/profiles/tokens"),
  createToken: (name: string, user_id: string, scope: TokenScope) =>
    http<TokenInfo & { token: string }>(
      "/api/profiles/tokens",
      send("POST", { name, user_id, scope }),
    ),
  revoke: (id: string) => http("/api/profiles/tokens", send("DELETE", { id })),
};
