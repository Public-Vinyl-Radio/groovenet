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
