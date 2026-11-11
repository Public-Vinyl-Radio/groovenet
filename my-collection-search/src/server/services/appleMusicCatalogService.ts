import jwt from "jsonwebtoken";
import { normalizeIsrc } from "@/lib/isrc";

const API_ROOT = "https://api.music.apple.com/v1/catalog";
/** The songs endpoint accepts up to 300 ids; 100 keeps the URL short. */
export const SONGS_PER_REQUEST = 100;
const MAX_ATTEMPTS = 4;
const MAX_RETRY_WAIT_MS = 30_000;

/** Developer token for the Apple Music catalog API; throws when the credentials are not configured. */
export function generateAppleMusicDeveloperToken(): string {
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const privateKeyRaw = process.env.APPLE_MUSIC_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKeyRaw) {
    throw new Error(
      "Missing Apple Music credentials (APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, or APPLE_MUSIC_PRIVATE_KEY)",
    );
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: teamId, iat: now, exp: now + 60 * 60 * 24 * 180 }, privateKey, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: keyId },
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Seconds from a `Retry-After` header, or null when absent or not a number. */
function retryAfterMs(res: Response): number | null {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, MAX_RETRY_WAIT_MS)
    : null;
}

type SongsResponse = { data?: { id: string; attributes?: { isrc?: string } }[] };

/**
 * Resolve Apple Music catalog song ids to ISRCs (#1156).
 *
 * One request per `SONGS_PER_REQUEST` ids. A 429 or 5xx is retried with the
 * server's `Retry-After` (or exponential backoff) before giving up, so a long
 * backfill rides out rate limiting rather than failing a whole batch.
 */
export class AppleMusicCatalogService {
  constructor(
    private readonly wait: (ms: number) => Promise<void> = sleep,
    private readonly getToken: () => string = generateAppleMusicDeveloperToken,
  ) {}

  /** Throws when credentials are missing, so a run can fail before it starts. */
  assertConfigured(): void {
    this.getToken();
  }

  /**
   * ISRC per requested id. An id Apple does not return, or returns without a
   * valid ISRC, maps to null; an HTTP failure throws.
   */
  async fetchIsrcs(ids: string[], storefront = "us"): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    const unique = [...new Set(ids)];
    const token = this.getToken();
    for (let i = 0; i < unique.length; i += SONGS_PER_REQUEST) {
      const chunk = unique.slice(i, i + SONGS_PER_REQUEST);
      const body = await this.getSongs(chunk, storefront, token);
      for (const id of chunk) result.set(id, null);
      for (const song of body.data ?? []) {
        if (result.has(song.id)) result.set(song.id, normalizeIsrc(song.attributes?.isrc));
      }
    }
    return result;
  }

  private async getSongs(ids: string[], storefront: string, token: string): Promise<SongsResponse> {
    const url = `${API_ROOT}/${encodeURIComponent(storefront)}/songs?ids=${ids.join(",")}`;
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) return (await res.json()) as SongsResponse;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw new Error(`Apple Music API ${res.status} for ${storefront} songs`);
      }
      await this.wait(retryAfterMs(res) ?? Math.min(1000 * 2 ** attempt, MAX_RETRY_WAIT_MS));
    }
  }
}

export const appleMusicCatalogService = new AppleMusicCatalogService();
