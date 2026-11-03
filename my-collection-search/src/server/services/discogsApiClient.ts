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

export async function getReleaseDetails(releaseId: string): Promise<DiscogsReleaseDetails> {
  const url = `https://api.discogs.com/releases/${releaseId}`;
  return await http<DiscogsReleaseDetails>(url, {
    headers: { Authorization: `Discogs token=${DISCOGS_USER_TOKEN}` },
  });
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
