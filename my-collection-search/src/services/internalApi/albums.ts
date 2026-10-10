import { z } from "zod";
import {
  albumCreateResponseSchema,
  albumDetailResponseSchema,
  albumDiscogsRawResponseSchema,
  albumPlayableStructureResponseSchema,
  albumSearchQuerySchema,
  albumSearchResponseSchema,
  albumUpdateBodySchema,
  albumUpdateResponseSchema,
  albumUpsertWithTracksResponseSchema,
  queueAlbumDownloadsResponseSchema,
} from "@/api-contract/schemas";
import type {
  CreateAlbumRequest,
  UpdateAlbumWithTracksParams,
} from "@/types/albumMetadata";
import type { Album, Track } from "@/types/track";
import { http } from "@/services/http";

export type AlbumDiscogsRawResponse = z.infer<
  typeof albumDiscogsRawResponseSchema
>;
export type AlbumPlayableStructureResponse = z.infer<
  typeof albumPlayableStructureResponseSchema
>;
export type CreateAlbumApiResponse = z.infer<typeof albumCreateResponseSchema>;
export type CreateAlbumResponse = Omit<CreateAlbumApiResponse, "album" | "tracks"> & {
  album: Album;
  tracks: Track[];
};
// `genre` and `similar_exclude` are preprocessed in the schema, so their
// input types would be `unknown`.
export type AlbumSearchParams = Omit<
  z.input<typeof albumSearchQuerySchema>,
  "genre" | "similar_exclude"
> & {
  /** Genre slugs (#375); any of them matches, each with its subgenres. */
  genre?: string[];
  /** Related-genre ids already removed by the caller (#485); never re-added. */
  similar_exclude?: string[];
};
export type AlbumSearchApiResponse = z.infer<typeof albumSearchResponseSchema>;
export type AlbumSearchResponse = Omit<AlbumSearchApiResponse, "hits"> & {
  hits: Album[];
};
export type AlbumDetailApiResponse = z.infer<typeof albumDetailResponseSchema>;
export type AlbumDetailResponse = Omit<AlbumDetailApiResponse, "album" | "tracks"> & {
  album: Album;
  tracks: Track[];
};
export type AlbumUpdateParams = z.input<typeof albumUpdateBodySchema>;
export type AlbumUpdateApiResponse = z.infer<typeof albumUpdateResponseSchema>;
export type AlbumUpdateResponse = Omit<AlbumUpdateApiResponse, "album"> & {
  album: Album;
};
export type QueueAlbumDownloadsResponse = z.infer<
  typeof queueAlbumDownloadsResponseSchema
>;
export type UpsertAlbumWithTracksApiResponse = z.infer<
  typeof albumUpsertWithTracksResponseSchema
>;
export type UpsertAlbumWithTracksResponse = Omit<
  UpsertAlbumWithTracksApiResponse,
  "album" | "tracks"
> & {
  album: Album;
  tracks: Track[];
};

export async function fetchAlbumDiscogsRawRelease(
  releaseId: string,
  friendId: number
): Promise<AlbumDiscogsRawResponse> {
  return await http<AlbumDiscogsRawResponse>(
    `/api/albums/${encodeURIComponent(releaseId)}/discogs-raw?friend_id=${friendId}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
}

export async function createAlbum(
  data: CreateAlbumRequest
): Promise<CreateAlbumResponse> {
  const formData = new FormData();
  formData.append("album", JSON.stringify(data.album));
  formData.append("tracks", JSON.stringify(data.tracks));
  formData.append("friend_id", data.friend_id.toString());
  if (data.coverArt) {
    formData.append("cover_art", data.coverArt);
  }

  return await http<CreateAlbumResponse>("/api/albums/create", {
    method: "POST",
    body: formData,
  });
}

export async function searchAlbums(
  params: AlbumSearchParams
): Promise<AlbumSearchResponse> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.append("q", params.q);
  if (params.sort) searchParams.append("sort", params.sort);
  if (typeof params.friend_id === "number") {
    searchParams.append("friend_id", String(params.friend_id));
  }
  if (typeof params.limit === "number") searchParams.append("limit", String(params.limit));
  if (typeof params.offset === "number") searchParams.append("offset", String(params.offset));
  if (params.missing_library_identifier) searchParams.append("missing_library_identifier", "1");
  if (params.missing_audio) searchParams.append("missing_audio", "1");
  if (params.missing_local_cover_art_url) {
    searchParams.append("missing_local_cover_art_url", "1");
  }
  for (const genre of params.genre ?? []) searchParams.append("genre", genre);
  if (params.include_similar) searchParams.append("include_similar", "1");
  if (typeof params.similar_limit === "number") {
    searchParams.append("similar_limit", String(params.similar_limit));
  }
  for (const id of params.similar_exclude ?? []) searchParams.append("similar_exclude", id);

  const query = searchParams.toString();
  const path = query ? `/api/albums?${query}` : "/api/albums";
  return await http<AlbumSearchResponse>(path, {
    method: "GET",
    cache: "no-store",
  });
}

export async function getAlbumWithTracks(
  releaseId: string,
  friendId: number
): Promise<AlbumDetailResponse> {
  return await http<AlbumDetailResponse>(
    `/api/albums/${encodeURIComponent(releaseId)}?friend_id=${friendId}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
}

export async function getAlbumPlayableStructure(
  releaseId: string,
  friendId: number
): Promise<AlbumPlayableStructureResponse> {
  return await http<AlbumPlayableStructureResponse>(
    `/api/albums/${encodeURIComponent(releaseId)}/playable-structure?friend_id=${friendId}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
}

export async function updateAlbum(
  params: AlbumUpdateParams
): Promise<AlbumUpdateResponse> {
  return await http<AlbumUpdateResponse>("/api/albums", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function queueAlbumDownloads(
  releaseId: string,
  friendId: number
): Promise<QueueAlbumDownloadsResponse> {
  return await http<QueueAlbumDownloadsResponse>(
    `/api/albums/${encodeURIComponent(releaseId)}/download?friend_id=${friendId}`,
    {
      method: "POST",
    }
  );
}

export async function upsertAlbumWithTracks(
  params: UpdateAlbumWithTracksParams
): Promise<UpsertAlbumWithTracksResponse> {
  const formData = new FormData();
  formData.append("release_id", params.release_id);
  formData.append("album", JSON.stringify(params.album));
  formData.append("tracks", JSON.stringify(params.tracks));
  formData.append("friend_id", params.friend_id.toString());

  if (params.coverArt) {
    formData.append("cover_art", params.coverArt);
  }

  return await http<UpsertAlbumWithTracksResponse>("/api/albums/upsert", {
    method: "POST",
    body: formData,
  });
}
