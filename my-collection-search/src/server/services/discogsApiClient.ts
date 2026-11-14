import type { DiscogsReleaseDetails } from "@/types/discogs";
import { http } from "@/services/http";
export type {
  DiscogsArtist,
  DiscogsLabel,
  DiscogsCompany,
  DiscogsFormat,
  DiscogsCommunity,
  DiscogsIdentifier,
  DiscogsApiTrack,
  DiscogsVideo,
  DiscogsExtraArtist,
  DiscogsImage,
  DiscogsReleaseDetails,
} from "@/types/discogs";

const DISCOGS_USER_TOKEN = process.env.DISCOGS_USER_TOKEN;
const FOLDER_ID = process.env.DISCOGS_FOLDER_ID || 0; // 0 means "All" folder

type DiscogsCollectionPage = {
  releases: Array<{
    basic_information: { id: number };
    date_added?: string;
  }>;
  pagination: { page: number; pages: number };
};

export async function getCollectionPage(username: string, page: number = 1, perPage = 100) {
  const urlBase = `https://api.discogs.com/users/${username}/collection/folders/${FOLDER_ID}/releases`;
  const url = `${urlBase}?page=${page}&per_page=${perPage}`;
  return await http<DiscogsCollectionPage>(url, {
    headers: { Authorization: `Discogs token=${DISCOGS_USER_TOKEN}` },
  });
}

/** Waits before each retry of a rate-limited (429) release fetch, when Discogs sends no Retry-After. */
export const RELEASE_RETRY_BACKOFF_MS = [5_000, 10_000, 20_000];
/** The longest Retry-After honoured, so an absurd value can't stall a sync. */
const MAX_RETRY_AFTER_MS = 60_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retry-After in milliseconds, when it is a number of seconds. */
function retryAfterMs(headers: Headers | undefined): number | null {
  const value = headers?.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/**
 * One release's details. A 429 is retried up to
 * `RELEASE_RETRY_BACKOFF_MS.length` times, after Retry-After when Discogs sends
 * it and the backoff otherwise; then it throws like any other failure.
 */
export async function getReleaseDetails(
  releaseId: string,
  { sleep = wait }: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<DiscogsReleaseDetails> {
  const url = `https://api.discogs.com/releases/${releaseId}`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await http<DiscogsReleaseDetails>(url, {
        headers: { Authorization: `Discogs token=${DISCOGS_USER_TOKEN}` },
      });
    } catch (error) {
      const { status, headers } = error as { status?: number; headers?: Headers };
      if (status !== 429 || attempt >= RELEASE_RETRY_BACKOFF_MS.length) throw error;
      await sleep(retryAfterMs(headers) ?? RELEASE_RETRY_BACKOFF_MS[attempt]);
    }
  }
}

export type DiscogsUserLookup = { found: true; releaseCount: number } | { found: false };

/**
 * Whether a Discogs user exists and how many releases their whole collection
 * ("All" folder) holds. One request, made only when someone asks. A 404 is an
 * unknown user and a 403 a private collection: both are "not found", because
 * neither can be synced. Any other failure throws.
 */
export async function lookupDiscogsUser(username: string): Promise<DiscogsUserLookup> {
  const url = `https://api.discogs.com/users/${encodeURIComponent(username)}/collection/folders/0`;
  try {
    const folder = await http<{ count?: number }>(url, {
      headers: { Authorization: `Discogs token=${DISCOGS_USER_TOKEN}` },
    });
    return { found: true, releaseCount: folder.count ?? 0 };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || status === 403) return { found: false };
    throw error;
  }
}
