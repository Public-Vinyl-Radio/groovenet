import { NextResponse } from "next/server";
import { bearerIdentity, cookieIdentity } from "./currentUser";
import type { TokenScope } from "@/types/user";

/** Deliberately exact: ingest credentials cannot administer indexing or read the library. */
export function scopeAllows(scope: TokenScope, method: string, path: string): boolean {
  if (scope === "write") return true;
  if (scope === "read") return ["GET", "HEAD", "OPTIONS"].includes(method);
  return (
    (method === "POST" && path === "/api/audio/ingest") ||
    (method === "POST" && /^\/api\/audio\/ingest\/[^/]+\/(?:claim|result)$/.test(path)) ||
    (method === "POST" && /^\/api\/set-derivations\/[^/]+\/(?:claim|result)$/.test(path)) ||
    (["GET", "POST", "PATCH"].includes(method) && path === "/api/fingerprints")
  );
}
/** The picker must work on a fresh device even when machine token enforcement is enabled. */
export async function enforceApiAuth(req: Request): Promise<NextResponse | null> {
  if (process.env.AUTH_REQUIRE_TOKENS !== "true") return null;
  const path = new URL(req.url).pathname.replace(/\/$/, "");
  const token = await bearerIdentity(req);
  // A supplied bearer takes precedence over a cookie, including scope restrictions.
  if (token)
    return scopeAllows(token.scope, req.method, path)
      ? null
      : NextResponse.json({ error: "Token scope does not allow this request" }, { status: 403 });
  if (
    (path === "/api/profiles" && req.method === "GET") ||
    (path === "/api/profiles/select" && req.method === "POST")
  )
    return null;
  if (await cookieIdentity(req)) return null;
  return NextResponse.json({ error: "Select a profile or supply an API token" }, { status: 401 });
}
