import { playerWebUnlockSchema } from "@/api-contract/schemas";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const cookieName = "__Secure-gn-player";
const lifetime = 8 * 60 * 60;
const cookieOptions = "Path=/api/players; HttpOnly; Secure; SameSite=Strict";

function config() {
  const passphrase = process.env.PLAYER_WEB_PASSPHRASE;
  const secret = process.env.PLAYER_WEB_SESSION_SECRET;
  const origin = process.env.PLAYER_WEB_ORIGIN;
  if (!passphrase || passphrase.length < 24 || !secret || secret.length < 32 || !origin ||
      passphrase === process.env.PLAYER_API_KEY || secret === process.env.PLAYER_API_KEY || secret === passphrase) return null;
  try { if (new URL(origin).origin !== origin || !origin.startsWith("https://")) return null; } catch { return null; }
  return { passphrase, secret, origin };
}

const equal = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const sign = (value: string, secret: string) => createHmac("sha256", secret).update(value).digest("base64url");

/** Returns the absolute expiry only for a valid player-only browser session. */
export function playerWebSession(request: Request): number | null {
  const settings = config();
  if (!settings) return null;
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if ((site && site !== "same-origin") || (origin && origin !== settings.origin)) return null;
  if (request.method !== "GET" && request.headers.get("origin") !== settings.origin) return null;
  const token = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token) return null;
  const [expiry, nonce, signature, extra] = token.split(".");
  if (!expiry || !nonce || !signature || extra !== undefined) return null;
  const expires = Number(expiry);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + lifetime || !equal(signature, sign(`${expiry}.${nonce}`, settings.secret))) return null;
  return expires;
}

// A bounded process-wide budget avoids trusting spoofable forwarded IP headers.
let budget = { since: 0, attempts: 0 };
export async function playerSessionRoute(request: Request): Promise<Response> {
  const settings = config();
  const headers = { "Cache-Control": "no-store" };
  if (!settings || !process.env.PLAYER_WORKER_URL || (process.env.PLAYER_API_KEY?.length ?? 0) < 32) return Response.json({ error: "Web player access is not configured", code: "PLAYERS_DISABLED" }, { status: 503, headers });
  if (request.method === "GET") return Response.json({ authorized: playerWebSession(request) !== null }, { headers });
  if (request.headers.get("origin") !== settings.origin || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Same-origin request required" }, { status: 403, headers });
  if (request.method === "DELETE") return Response.json({ authorized: false }, { headers: { ...headers, "Set-Cookie": `${cookieName}=; Max-Age=0; ${cookieOptions}` } });
  const now = Date.now();
  if (now < budget.since || now - budget.since >= 60000) budget = { since: now, attempts: 0 };
  if (++budget.attempts > 10) return Response.json({ error: "Too many unlock attempts. Try again in a minute." }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  // Only accept a small credential body. Never log or echo it.
  const reader = request.body?.getReader();
  let text = "";
  if (reader) {
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4096) { await reader.cancel(); return Response.json({ error: "Invalid credentials" }, { status: 400, headers }); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
  }
  let passphrase: unknown;
  try {
    const parsed = playerWebUnlockSchema.safeParse(JSON.parse(text));
    if (parsed.success) passphrase = parsed.data.passphrase;
  } catch { /* generic denial */ }
  if (typeof passphrase !== "string" || !equal(passphrase, settings.passphrase)) return Response.json({ error: "Invalid credentials" }, { status: 401, headers });
  const payload = `${Math.floor(now / 1000) + lifetime}.${randomBytes(24).toString("base64url")}`;
  return Response.json({ authorized: true }, { headers: { ...headers, "Set-Cookie": `${cookieName}=${payload}.${sign(payload, settings.secret)}; Max-Age=${lifetime}; ${cookieOptions}` } });
}
