import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { userRepository } from "@/server/repositories/userRepository";
import type { User, TokenScope } from "@/types/user";

export const PROFILE_COOKIE = "groovenet-profile";
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 365;
export const newSecret = () => randomBytes(32).toString("base64url");
export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
export function verifySecret(secret: string, hash: string): boolean {
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(hashSecret(secret), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function deviceSecret(req: Request): string | null {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${PROFILE_COOKIE}=`))
      ?.slice(PROFILE_COOKIE.length + 1) || null
  );
}
/** The existing player credential is compared directly, never password-hashed. */
export function matchesPlayerKey(req: Request, key: string): boolean {
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${key}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
/** Household configuration belongs to the owner, independent of the selected listener. */
export async function getHouseholdOwner(): Promise<User | null> {
  await userRepository.ensureOwner();
  return (await userRepository.list()).find((user) => user.is_owner) ?? null;
}
export async function bearerIdentity(
  req: Request,
): Promise<{ user: User; scope: TokenScope } | null> {
  const match = /^Bearer (\S+)$/i.exec(req.headers.get("authorization") || "");
  if (!match) return null;
  // Keep the existing player key confined to its original API surface. It is
  // a household owner credential there; arbitrary collection requests cannot use it.
  const path = new URL(req.url).pathname;
  const playerKey = process.env.PLAYER_API_KEY;
  if (
    (path === "/api/players" || path.startsWith("/api/players/")) &&
    playerKey &&
    playerKey.length >= 32 &&
    matchesPlayerKey(req, playerKey)
  ) {
    const owner = await getHouseholdOwner();
    return owner ? { user: owner, scope: "write" } : null;
  }
  const row = await userRepository.token(hashSecret(match[1]));
  if (!row || !verifySecret(match[1], row.token_hash)) return null;
  await userRepository.touchToken(row.token_id);
  const { token_id: _id, token_hash: _hash, scope, ...user } = row;
  return { user, scope };
}
export async function cookieIdentity(req: Request): Promise<User | null> {
  const secret = deviceSecret(req);
  return secret ? userRepository.device(hashSecret(secret)) : null;
}
/** Token > device > explicitly mapped tailnet identity > sole household profile. */
export async function getCurrentUser(req?: Request): Promise<User | null> {
  await userRepository.ensureOwner();
  if (req) {
    const token = await bearerIdentity(req);
    if (token) return token.user;
    const device = await cookieIdentity(req);
    if (device) return device;
  }
  const users = await userRepository.list();
  const login = req?.headers.get("Tailscale-User-Login");
  const mapped = login ? users.find((user) => user.tailscale_login === login) : undefined;
  return mapped ?? (users.length === 1 ? users[0] : null);
}
export async function selectProfile(req: Request, userId: string): Promise<NextResponse> {
  const secret = newSecret();
  const old = deviceSecret(req);
  await userRepository.select(
    hashSecret(secret),
    userId,
    new Date(Date.now() + DEVICE_MAX_AGE * 1000),
    old ? hashSecret(old) : null,
  );
  const response = NextResponse.json({ selected: true });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(PROFILE_COOKIE, secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: DEVICE_MAX_AGE,
  });
  return response;
}
