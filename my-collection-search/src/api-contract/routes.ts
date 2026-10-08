import { z } from "zod";
import { exampleFromSchema } from "./exampleFromSchema";
import {
  aiPromptSettingsGetResponseSchema,
  aiPromptSettingsPutBodySchema,
  aiPromptSettingsPutResponseSchema,
  aiPromptSettingsQuerySchema,
  recommendationSettingsPutBodySchema,
  recommendationSettingsQuerySchema,
  recommendationSettingsResponseSchema,
  albumCreateResponseSchema,
  albumDetailResponseSchema,
  albumDiscogsRawResponseSchema,
  albumPlayableStructureResponseSchema,
  albumFriendQuerySchema,
  albumReleaseParamsSchema,
  albumSearchQuerySchema,
  albumSearchResponseSchema,
  albumUpdateBodySchema,
  albumUpdateResponseSchema,
  albumUpsertWithTracksResponseSchema,
  apiErrorSchema,
  backupPolicyGetResponseSchema,
  backupPolicyPutBodySchema,
  backupPolicyPutResponseSchema,
  backupCreateResponseSchema,
  backupCreateCustomResponseSchema,
  backupStatusGetResponseSchema,
  defaultLibrarySettingsGetResponseSchema,
  defaultLibrarySettingsPutBodySchema,
  defaultLibrarySettingsPutResponseSchema,
  discogsLookupQuerySchema,
  discogsLookupResponseSchema,
  discogsDeleteReleasesBodySchema,
  discogsDeleteReleasesResponseSchema,
  providerAppleMusicSearchBodySchema,
  providerAppleMusicSearchResponseSchema,
  providerTrackMetadataBodySchema,
  providerTrackMetadataResponseSchema,
  providerYouTubeMusicSearchBodySchema,
  providerYouTubeMusicSearchResponseSchema,
  fingerprintIndexBodySchema,
  fingerprintListResponseSchema,
  acceptedIngestSchema,
  ingestResultBodySchema,
  ingestRetentionStatusSchema,
  ingestRecentResponseSchema,
  ingestPipelineStatsSchema,
  detectionsRecentResponseSchema,
  fingerprintIndexRunSchema,
  fingerprintFileStatsBodySchema,
  fingerprintUpsertBodySchema,
  fingerprintUpsertResponseSchema,
  embeddingsBackfillBodySchema,
  embeddingsBackfillDryRunSchema,
  embeddingsBackfillRunSchema,
  embeddingsStatusQuerySchema,
  embeddingsStatusSchema,
  embeddingQueueStatusSchema,
  embeddingQueueRetryBodySchema,
  embeddingQueueRetryResponseSchema,
  embeddingModelSettingsListSchema,
  embeddingModelSettingsSchema,
  embeddingModelUpdateBodySchema,
  friendDeleteQuerySchema,
  friendMutationBodySchema,
  friendMutationResponseSchema,
  friendsListQuerySchema,
  friendsListResponseSchema,
  manifestCleanupResponseSchema,
  manifestVerificationResponseSchema,
  gamdlCookieUploadResponseSchema,
  gamdlSettingsGetResponseSchema,
  gamdlSettingsPutBodySchema,
  gamdlSettingsPutResponseSchema,
  gamdlSettingsQuerySchema,
  genreTreeResponseSchema,
  genrePageQuerySchema,
  genrePageResponseSchema,
  trackGenreFacetsResponseSchema,
  genreCreateBodySchema,
  genreUpdateBodySchema,
  genreAliasBodySchema,
  genreMergeBodySchema,
  genreParamsSchema,
  genreMutationResponseSchema,
  genreAliasResponseSchema,
  genreMergeResponseSchema,
  genreReconciliationRunBodySchema,
  genreReconciliationRunSchema,
  genreReconciliationCoverageSchema,
  genreReconciliationCoverageQuerySchema,
  genreProposalListQuerySchema,
  genreProposalListResponseSchema,
  genreProposalUpdateBodySchema,
  genreProposalSchema,
  genreProposalApplyBodySchema,
  genreProposalApplyResponseSchema,
  genreProposalDecisionsBodySchema,
  genreProposalDecisionsResponseSchema,
  genreProposalRestoreBodySchema,
  genreProposalRestoreResponseSchema,
  genreProposalTracksQuerySchema,
  genreProposalTracksResponseSchema,
  jobDetailsResponseSchema,
  jobsClearResponseSchema,
  jobsEventsSseResponseSchema,
  jobsListQuerySchema,
  jobsListResponseSchema,
  playlistCreateBodySchema,
  playlistDeleteQuerySchema,
  playlistDetailParamsSchema,
  playlistDetailResponseSchema,
  playlistGeneticBodySchema,
  playlistGeneticResponseSchema,
  playlistPatchBodySchema,
  playlistSchema,
  playlistSpinsBodySchema,
  playlistSpinsResponseSchema,
  queueAlbumDownloadsResponseSchema,
  recommendationsQuerySchema,
  recommendationsBatchBodySchema,
  recommendationsResponseSchema,
  spinAggregateBodySchema,
  spinAggregateResponseSchema,
  spinCreateBodySchema,
  spinCreateResponseSchema,
  spinDeleteQuerySchema,
  spinDeleteResponseSchema,
  spinListQuerySchema,
  spinListResponseSchema,
  spinTopTracksQuerySchema,
  spinTopTracksResponseSchema,
  spinSessionParamsSchema,
  spinUpdateBodySchema,
  spinUpdateResponseSchema,
  trackSearchGetQuerySchema,
  trackSearchGetResponseSchema,
  setDerivationCreateBodySchema,
  setDerivationResultBodySchema,
  setDerivationViewQuerySchema,
  recordActionCreateBodySchema,
  recordActionListQuerySchema,
  recordActionListResponseSchema,
  recordActionMutationResponseSchema,
  recordActionParamsSchema,
  recordActionVoidResponseSchema,
  recordCareQuerySchema,
  recordCareResponseSchema,
  recordCareSummaryQuerySchema,
  recordCareSummaryResponseSchema,
  recordCopyCreateBodySchema,
  recordCopyDefaultUpdateBodySchema,
  recordCopyDeleteResponseSchema,
  recordCopyListQuerySchema,
  recordCopyListResponseSchema,
  recordCopyParamsSchema,
  recordCopyResponseSchema,
  recordCopyUpdateBodySchema,
  recordFriendQuerySchema,
} from "@/api-contract/schemas";

export type HttpMethod = "get" | "head" | "post" | "patch" | "put" | "delete";

export type ApiContractRoute = {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary: string;
  tags: string[];
  querySchema?: z.ZodTypeAny;
  paramsSchema?: z.ZodTypeAny;
  bodySchema?: z.ZodTypeAny;
  successSchema: z.ZodTypeAny;
  errorSchema: z.ZodTypeAny;
  openapi: {
    parameters?: Array<Record<string, unknown>>;
    requestBody?: Record<string, unknown>;
    responses: Record<string, unknown>;
    security?: Array<Record<string, string[]>>;
  };
};

const errorResponseSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
  required: ["error"],
  additionalProperties: true,
};

const playlistTrackObjectSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    track_id: { type: "string" },
    friend_id: { type: "integer" },
    position: { type: "integer" },
  },
  required: ["track_id", "friend_id"],
  additionalProperties: true,
};

const playlistObjectSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    created_at: { type: "string" },
    tracks: {
      type: "array",
      items: playlistTrackObjectSchema,
    },
  },
  required: ["id", "name", "created_at", "tracks"],
  additionalProperties: true,
};

const trackSearchResponseBase: Record<string, unknown> = {
  type: "object",
  properties: {
    estimatedTotalHits: { type: "integer" },
    offset: { type: "integer" },
    limit: { type: "integer" },
    processingTimeMs: { type: "integer" },
  },
  required: ["estimatedTotalHits", "offset", "limit", "processingTimeMs"],
  additionalProperties: true,
};

const trackGenreSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    slug: { type: "string" },
    parent_id: { type: ["string", "null"], format: "uuid" },
    parent_name: { type: ["string", "null"] },
  },
  required: ["id", "name", "slug", "parent_id", "parent_name"],
};

const trackEntitySchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    id: { type: "integer" },
    track_id: { type: "string" },
    friend_id: { type: "integer" },
    title: { type: "string" },
    artist: { type: "string" },
    album: { type: "string" },
    year: { type: ["string", "number", "null"] },
    genres: { type: "array", items: { type: "string" } },
    styles: { type: "array", items: { type: "string" } },
    bpm: { type: ["number", "string", "null"] },
    key: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
    local_tags: { type: ["string", "null"] },
    track_genres: {
      type: "array",
      description: "Track-level DJ genres, linked to the genre taxonomy.",
      items: trackGenreSchemaObject,
    },
    descriptors: {
      type: "array",
      description: "Normalised mood and description words that are not genres.",
      items: { type: "string" },
    },
    local_audio_url: { type: ["string", "null"] },
    audio_file_album_art_url: { type: ["string", "null"] },
    library_identifier: { type: ["string", "null"] },
  },
  required: ["track_id", "friend_id"],
  additionalProperties: true,
};

const recommendationSettingsSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    friend_id: { type: "integer" },
    scope: { type: "string", enum: ["library", "all"] },
    isDefault: { type: "boolean" },
  },
  required: ["friend_id", "scope", "isDefault"],
};

const recommendationCandidateSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    trackId: { type: "string" },
    friendId: { type: "integer" },
    simIdentity: { type: ["number", "null"] },
    simAudio: { type: ["number", "null"] },
    metadata: {
      type: "object",
      additionalProperties: true,
      properties: {
        title: { type: "string" },
        artist: { type: "string" },
        album: { type: "string" },
        bpm: { type: ["number", "null"] },
        key: { type: ["string", "null"] },
        genres: { type: "array", items: { type: "string" } },
        styles: { type: "array", items: { type: "string" } },
      },
    },
  },
  required: ["trackId", "friendId", "simIdentity", "simAudio", "metadata"],
  additionalProperties: true,
};

const playlistsListExample = [
  {
    id: 42,
    name: "Warmup Set",
    created_at: "2026-02-17T12:00:00.000Z",
    tracks: [
      { track_id: "trk_001", friend_id: 1, position: 0 },
      { track_id: "trk_099", friend_id: 1, position: 1 },
    ],
  },
];

const playlistDetailExample = {
  playlist_id: 42,
  playlist_name: "Warmup Set",
  tracks: [
    { track_id: "trk_001", friend_id: 1, position: 0 },
    { track_id: "trk_099", friend_id: 1, position: 1 },
  ],
};

const playlistGeneticRequestExample = {
  playlist: [
    {
      track_id: "trk_001",
      friend_id: 1,
      bpm: 122,
    },
    {
      track_id: "trk_099",
      friend_id: 1,
      bpm: "124.5",
    },
    {
      track_id: "trk_143",
      friend_id: 1,
      bpm: 126,
    },
  ],
  mode: "cohesive_blocks",
};

const trackSearchGetExample = {
  hits: [
    {
      id: 9211,
      track_id: "trk_001",
      friend_id: 1,
      title: "Move Through",
      artist: "Night Driver",
      album: "Neon Junction",
      year: "2021",
      genres: ["Electronic"],
      styles: ["Deep House"],
      bpm: 124,
      key: "Am",
      notes: null,
      local_tags: "warmup,groovy",
      local_audio_url: "/audio/Night Driver - Move Through.mp3",
      audio_file_album_art_url: "/uploads/album-covers/trk_001.jpg",
      library_identifier: "friend-1",
    },
  ],
  estimatedTotalHits: 128,
  offset: 0,
  limit: 20,
  processingTimeMs: 4,
};

const recommendationsExample = {
  seedTrackId: "trk_001",
  seedFriendId: 1,
  seedEmbeddings: { identity: true, audio: true },
  scope: "library",
  libraryFriendId: 1,
  candidates: [
    {
      trackId: "trk_910",
      friendId: 1,
      simIdentity: 0.92,
      simAudio: 0.83,
      metadata: {
        title: "Echo Runner",
        artist: "Parallel City",
        album: "Night Transit",
        bpm: 124,
        key: "Am",
        genres: ["House"],
        styles: ["Deep House"],
      },
    },
  ],
  stats: {
    identityCount: 200,
    audioCount: 200,
    unionCount: 310,
    timingMs: { identityQuery: 18, audioQuery: 17, total: 41 },
  },
};

const manifestVerifyExample = {
  message: "Manifest verification complete",
  results: [
    {
      username: "dj_alex",
      totalReleaseIds: 42,
      missingFiles: ["12345", "23456"],
      validFiles: ["10001", "10002"],
    },
  ],
  summary: {
    totalManifests: 1,
    totalMissingFiles: 2,
    totalValidFiles: 40,
  },
};

const manifestCleanupExample = {
  message: "Manifests cleaned successfully",
  results: [
    {
      username: "dj_alex",
      before: 42,
      after: 40,
      removed: ["12345", "23456"],
    },
  ],
  summary: {
    totalManifests: 1,
    totalRemoved: 2,
    totalKept: 40,
  },
};

function buildPathParameters(path: string): Array<Record<string, unknown>> {
  const params = Array.from(path.matchAll(/\{([^}]+)\}/g));
  return params.map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

type TrackRouteOptions = {
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses?: Record<string, unknown>;
};


function withExamples(responses: Record<string, unknown>): Record<string, unknown> {
  const cloned = structuredClone(responses);
  for (const response of Object.values(cloned)) {
    if (!response || typeof response !== "object") continue;
    const responseObj = response as Record<string, unknown>;
    const content =
      responseObj.content && typeof responseObj.content === "object"
        ? (responseObj.content as Record<string, unknown>)
        : undefined;
    if (!content) continue;

    const appJson = content["application/json"];
    if (!appJson || typeof appJson !== "object") continue;

    const media = appJson as Record<string, unknown>;
    if (media.example !== undefined || media.examples !== undefined) continue;
    if (!media.schema) continue;
    media.example = exampleFromSchema(media.schema);
  }
  return cloned;
}

function makeTrackRoute(
  method: HttpMethod,
  path: string,
  summary: string,
  options: TrackRouteOptions = {}
): ApiContractRoute {
  const responses =
    options.responses ??
    {
      "200": {
        description: "Successful response",
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
      "400": {
        description: "Validation or request error",
        content: {
          "application/json": { schema: errorResponseSchemaObject },
        },
      },
      "500": {
        description: "Server error",
        content: {
          "application/json": { schema: errorResponseSchemaObject },
        },
      },
    };

  return {
    operationId: `${method}${path.replace(/[\/{}-]+/g, "_")}`,
    method,
    path,
    summary,
    tags: ["Tracks"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: options.parameters ?? buildPathParameters(path),
      requestBody: options.requestBody,
      responses: withExamples(responses),
    },
  };
}

const remainingTracksContracts: ApiContractRoute[] = [
  makeTrackRoute("get", "/api/tracks/deleted", "List soft-deleted tracks", {
    parameters: [
      { name: "friend_id", in: "query", required: false, schema: { type: "integer" } },
      { name: "limit", in: "query", required: false, schema: { type: "integer", default: 100 } },
      { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
    ],
    responses: {
      "200": {
        description: "Soft-deleted tracks with a total count",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                tracks: { type: "array", items: trackEntitySchemaObject },
                total: { type: "integer" },
              },
              required: ["tracks", "total"],
            },
          },
        },
      },
      "400": {
        description: "Invalid query parameter",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "500": {
        description: "Server error",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
    },
  }),
  makeTrackRoute("patch", "/api/tracks", "Update track fields", {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              track_id: { type: "string" },
              friend_id: { type: "integer" },
              genres: {
                type: "array",
                description:
                  "Replaces the track's genres. Each entry is a genre id, or a name resolved through the taxonomy's names and aliases. An unknown name fails the whole update with 400; it never creates a genre.",
                items: { type: "string" },
              },
              descriptors: {
                type: "array",
                description: "Replaces the track's descriptors: free text, normalised and de-duplicated.",
                items: { type: "string" },
              },
              genre_source: {
                type: "string",
                enum: ["manual", "enrichment"],
                default: "manual",
                description:
                  "Recorded on genre links this update adds. Links the track already has keep their original source.",
              },
            },
            required: ["track_id", "friend_id"],
            additionalProperties: true,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Updated track",
        content: {
          "application/json": {
            schema: trackEntitySchemaObject,
          },
        },
      },
      "400": {
        description: "Malformed genres or descriptors, or an unknown genre name",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                error: { type: "string" },
                unknown_genres: { type: "array", items: { type: "string" } },
              },
              required: ["error"],
            },
          },
        },
      },
      "404": {
        description: "Track not found",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "500": {
        description: "Update error",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
    },
  }),
  makeTrackRoute("post", "/api/tracks/upload", "Upload track audio", {
    requestBody: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: { type: "string", format: "binary" },
              track_id: { type: "string" },
              friend_id: { type: "string" },
            },
            required: ["file", "track_id"],
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Audio uploaded and analyzed",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                file: { type: "string" },
                track_id: { type: "string" },
                local_audio_url: { type: "string" },
                format: { type: "string" },
                analysis: { type: "object", additionalProperties: true },
              },
              required: ["success", "file", "track_id", "local_audio_url", "format", "analysis"],
            },
          },
        },
      },
      "400": { description: "Invalid upload payload", content: { "application/json": { schema: errorResponseSchemaObject } } },
      "500": { description: "Upload/processing error", content: { "application/json": { schema: errorResponseSchemaObject } } },
    },
  }),
  makeTrackRoute("post", "/api/tracks/analyze-async", "Queue async track analysis", {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              track_id: { type: "string" },
              friend_id: { type: "integer" },
              apple_music_url: { type: "string" },
              youtube_url: { type: "string" },
              soundcloud_url: { type: "string" },
              preferred_downloader: { type: "string" },
            },
            required: ["track_id", "friend_id"],
            additionalProperties: true,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Job queued",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                jobId: { type: "string" },
                message: { type: "string" },
              },
              required: ["success", "jobId", "message"],
            },
          },
        },
      },
      "400": { description: "Invalid request", content: { "application/json": { schema: errorResponseSchemaObject } } },
      "500": { description: "Queueing error", content: { "application/json": { schema: errorResponseSchemaObject } } },
    },
  }),
  makeTrackRoute("post", "/api/tracks/batch", "Fetch ordered batch of tracks", {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              tracks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    track_id: { type: "string" },
                    friend_id: { type: "integer" },
                    position: { type: "integer" },
                  },
                  required: ["track_id", "friend_id"],
                },
              },
              include_vectors: {
                type: "boolean",
                description:
                  "When true, include each track's `audio_vibe` vector (at the serving model) in `_vectors.default`. Omitted by default to keep payloads small; tracks with no vector get no `_vectors`.",
              },
            },
            required: ["tracks"],
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Tracks in input order",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: trackEntitySchemaObject,
            },
          },
        },
      },
      "500": { description: "Batch query error", content: { "application/json": { schema: errorResponseSchemaObject } } },
    },
  }),
  makeTrackRoute("post", "/api/tracks/playlist_counts", "Get playlist counts for tracks", {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              track_refs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    track_id: { type: "string" },
                    friend_id: { type: "integer" },
                  },
                  required: ["track_id", "friend_id"],
                },
              },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Track playlist counts keyed by track_id:friend_id",
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: { type: "integer" },
            },
            examples: {
              counts: {
                summary: "Count map",
                value: {
                  "track_123:1": 2,
                  "track_999:1": 1,
                },
              },
            },
          },
        },
      },
    },
  }),
  makeTrackRoute("get", "/api/tracks/{id}", "Get track by id", {
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
    ],
    responses: {
      "200": {
        description: "Track details",
        content: {
          "application/json": {
            schema: {
              ...trackEntitySchemaObject,
            },
          },
        },
      },
      "400": { description: "Missing required parameters", content: { "application/json": { schema: errorResponseSchemaObject } } },
      "404": { description: "Track not found", content: { "application/json": { schema: errorResponseSchemaObject } } },
    },
  }),
  makeTrackRoute("delete", "/api/tracks/{id}", "Soft delete track by id", {
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
    ],
    responses: {
      "200": {
        description: "Track soft deleted",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                track_id: { type: "string" },
                friend_id: { type: "integer" },
              },
              required: ["success", "track_id", "friend_id"],
            },
          },
        },
      },
      "400": { description: "Missing or invalid parameters", content: { "application/json": { schema: errorResponseSchemaObject } } },
      "404": { description: "Track not found or already deleted", content: { "application/json": { schema: errorResponseSchemaObject } } },
      "500": { description: "Server error", content: { "application/json": { schema: errorResponseSchemaObject } } },
    },
  }),
  makeTrackRoute("get", "/api/tracks/{id}/audio-metadata", "Get local audio metadata for track", {
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
    ],
    responses: {
      "200": {
        description: "Audio metadata/probe result",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                track_id: { type: "string" },
                friend_id: { type: "integer" },
                local_audio_url: { type: "string" },
                audio_file_album_art_url: { type: ["string", "null"] },
                has_embedded_cover: { type: "boolean" },
                embedded_cover: { type: ["object", "null"], additionalProperties: true },
                probe: { type: "object", additionalProperties: true },
              },
              required: ["track_id", "friend_id", "local_audio_url", "has_embedded_cover", "embedded_cover", "probe"],
            },
          },
        },
      },
      "400": { description: "Missing required parameters", content: { "application/json": { schema: errorResponseSchemaObject } } },
      "404": { description: "Track or audio not found", content: { "application/json": { schema: errorResponseSchemaObject } } },
    },
  }),
  makeTrackRoute("post", "/api/tracks/{id}/audio-metadata", "Extract embedded audio cover art", {
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { friend_id: { type: "integer" } },
            required: ["friend_id"],
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Cover extracted",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                audio_file_album_art_url: { type: "string" },
                message: { type: "string" },
              },
              required: ["success", "audio_file_album_art_url", "message"],
            },
          },
        },
      },
      "400": { description: "Missing required parameters", content: { "application/json": { schema: errorResponseSchemaObject } } },
      "404": { description: "No embedded artwork / track not found", content: { "application/json": { schema: errorResponseSchemaObject } } },
    },
  }),
  makeTrackRoute("get", "/api/tracks/{id}/embedding-preview", "Preview track embedding data", {
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
      {
        name: "type",
        in: "query",
        required: false,
        schema: { type: "string", enum: ["identity", "audio_vibe", "context"], default: "identity" },
      },
    ],
    responses: {
      "200": {
        description: "Embedding preview payload",
        content: {
          "application/json": {
            schema: {
              oneOf: [
                {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["identity"] },
                    text: { type: "string" },
                    data: { type: "object", additionalProperties: true },
                  },
                  required: ["type", "text", "data"],
                },
                {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["audio_vibe"] },
                    text: { type: "string" },
                    data: { type: "object", additionalProperties: true },
                  },
                  required: ["type", "text", "data"],
                },
                {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["context"] },
                    text: { type: "string" },
                    data: { type: "object", additionalProperties: true },
                  },
                  required: ["type", "text", "data"],
                },
              ],
            },
          },
        },
      },
      "400": { description: "Missing required parameters", content: { "application/json": { schema: errorResponseSchemaObject } } },
      "404": { description: "Track not found", content: { "application/json": { schema: errorResponseSchemaObject } } },
    },
  }),
  makeTrackRoute("get", "/api/tracks/{id}/essentia", "Get essentia analysis", {
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
    ],
    responses: {
      "200": {
        description: "Essentia analysis payload",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                track_id: { type: "string" },
                friend_id: { type: "integer" },
                file_path: { type: "string" },
                data: { type: "object", additionalProperties: true },
              },
              required: ["track_id", "friend_id", "file_path", "data"],
            },
          },
        },
      },
      "400": { description: "Missing required parameters", content: { "application/json": { schema: errorResponseSchemaObject } } },
      "404": { description: "Analysis not found", content: { "application/json": { schema: errorResponseSchemaObject } } },
    },
  }),
  makeTrackRoute("get", "/api/tracks/{id}/playlists", "Get playlists containing track", {
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
    ],
    responses: {
      "200": {
        description: "Track playlist memberships",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                playlists: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      name: { type: "string" },
                      position: { type: "integer" },
                    },
                    required: ["id", "name", "position"],
                  },
                },
              },
              required: ["playlists"],
            },
          },
        },
      },
      "400": { description: "Missing required parameters", content: { "application/json": { schema: errorResponseSchemaObject } } },
    },
  }),
];

const backupStatusSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    started_at: { type: "string" },
    finished_at: { type: "string" },
    stored_at: { type: "string" },
    status: { type: "string", enum: ["success", "failed", "skipped"] },
    reason: { type: "string", example: "no_changes_since_last_snapshot" },
    backed_up_paths: { type: "array", items: { type: "string" } },
    snapshot: { type: ["object", "null"], additionalProperties: true },
    error: { type: "string" },
    missing_env: {
      type: "array",
      items: { type: "string", example: "RESTIC_PASSWORD" },
    },
  },
  required: [
    "started_at",
    "finished_at",
    "stored_at",
    "status",
    "reason",
    "backed_up_paths",
    "snapshot",
  ],
  additionalProperties: true,
};

const backupHealthSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    healthy: { type: "boolean" },
    status: { type: "string", enum: ["ok", "disabled", "unhealthy"] },
    reason: {
      type: "string",
      enum: ["no-backup-status", "backup-failed", "backup-overdue", "status-unavailable"],
    },
    age_hours: { type: "number" },
    finished_at: { type: "string" },
    max_age_hours: { type: "number" },
  },
  required: ["status"],
  additionalProperties: true,
};

const fingerprintContracts: ApiContractRoute[] = [
  {
    operationId: "storeTrackFingerprint",
    method: "post",
    path: "/api/fingerprints",
    summary: "Store a reference fingerprint for a library track",
    tags: ["Fingerprints"],
    bodySchema: fingerprintUpsertBodySchema,
    successSchema: fingerprintUpsertResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                track_id: { type: "string" },
                friend_id: { type: "integer" },
                fingerprint_type: { type: "string", example: "chromaprint" },
                fingerprint_version: { type: "string", example: "1" },
                fingerprint_data: {
                  type: ["string", "null"],
                  format: "byte",
                  description:
                    "Base64 engine payload, or null when the engine stores none.",
                },
                audio_sha256: { type: "string" },
                audio_duration_seconds: { type: ["number", "null"] },
                audio_size_bytes: {
                  type: ["integer", "null"],
                  description: "Size of the audio file fingerprinted, for cheap re-checks (#303)",
                },
                audio_mtime_ms: {
                  type: ["integer", "null"],
                  description: "Its modification time, epoch milliseconds",
                },
              },
              required: [
                "track_id",
                "friend_id",
                "fingerprint_type",
                "fingerprint_version",
                "audio_sha256",
              ],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "The stored fingerprint, without its payload",
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        "400": {
          description: "Invalid fingerprint",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "409": {
          description: "The track no longer exists",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "recordFingerprintFileStats",
    method: "patch",
    path: "/api/fingerprints",
    summary: "Record that a fingerprint's audio was re-checked and is unchanged",
    tags: ["Fingerprints"],
    bodySchema: fingerprintFileStatsBodySchema,
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                track_id: { type: "string" },
                friend_id: { type: "integer" },
                fingerprint_type: { type: "string" },
                fingerprint_version: { type: "string" },
                audio_sha256: {
                  type: "string",
                  description: "Only recorded if this still matches the stored hash",
                },
                audio_size_bytes: { type: "integer" },
                audio_mtime_ms: { type: "integer", description: "Epoch milliseconds" },
              },
              required: [
                "track_id",
                "friend_id",
                "fingerprint_type",
                "fingerprint_version",
                "audio_sha256",
                "audio_size_bytes",
                "audio_mtime_ms",
              ],
            },
          },
        },
      },
      responses: {
        "200": {
          description:
            "`updated: false` when the stored hash no longer matches — re-fingerprinted meanwhile",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { updated: { type: "boolean" } },
                required: ["updated"],
              },
            },
          },
        },
        "400": {
          description: "Invalid file stats",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "listReferenceFingerprints",
    method: "get",
    path: "/api/fingerprints",
    summary: "Stored reference fingerprints for one engine and version",
    tags: ["Fingerprints"],
    successSchema: fingerprintListResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "fingerprint_type", in: "query", required: true, schema: { type: "string" } },
        { name: "fingerprint_version", in: "query", required: true, schema: { type: "string" } },
        { name: "friend_id", in: "query", required: false, schema: { type: "integer" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", default: 500 } },
        { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
      ],
      responses: {
        "200": {
          description: "A page of fingerprints, blobs base64-encoded",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  fingerprints: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
                required: ["fingerprints", "limit", "offset"],
              },
            },
          },
        },
        "400": {
          description: "Missing engine or version",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "startFingerprintIndexRun",
    method: "post",
    path: "/api/fingerprints/index",
    summary: "Queue a reference-library indexing run",
    tags: ["Fingerprints"],
    bodySchema: fingerprintIndexBodySchema,
    successSchema: fingerprintIndexRunSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                scope: {
                  type: "string",
                  enum: ["missing", "changed", "all", "track", "release"],
                },
                track_id: { type: "string" },
                release_id: { type: "string" },
                friend_id: { type: "integer" },
                force: { type: "boolean" },
              },
              required: ["scope"],
            },
          },
        },
      },
      responses: {
        "202": {
          description: "Run queued",
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        "400": {
          description: "Invalid scope",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "503": {
          description: "No fingerprint engine registered",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getFingerprintIndexRun",
    method: "get",
    path: "/api/fingerprints/index/{runId}",
    summary: "Progress and summary for one indexing run",
    tags: ["Fingerprints"],
    successSchema: fingerprintIndexRunSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: buildPathParameters("/api/fingerprints/index/{runId}"),
      responses: {
        "200": {
          description: "Run counters",
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        "404": {
          description: "Run not found or expired",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
];

const embeddingsBackfillContracts: ApiContractRoute[] = [
  {
    operationId: "startEmbeddingBackfill",
    method: "post",
    path: "/api/embeddings/backfill",
    summary: "Queue a backfill run for missing embeddings",
    tags: ["Embeddings"],
    bodySchema: embeddingsBackfillBodySchema,
    successSchema: z.union([embeddingsBackfillRunSchema, embeddingsBackfillDryRunSchema]),
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                scope: {
                  type: "string",
                  enum: ["missing", "all", "release", "track"],
                },
                types: {
                  type: "array",
                  items: { type: "string", enum: ["identity", "audio_vibe", "context"] },
                },
                friend_id: { type: "integer" },
                release_id: { type: "string" },
                track_ids: { type: "array", items: { type: "string" } },
                limit: { type: "integer" },
                force: { type: "boolean" },
                dry_run: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Dry run: counts only, nothing enqueued",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "202": {
          description: "Run queued",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "400": {
          description: "Invalid scope",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getEmbeddingBackfillRun",
    method: "get",
    path: "/api/embeddings/backfill/{runId}",
    summary: "Progress and summary for one embeddings backfill run",
    tags: ["Embeddings"],
    successSchema: embeddingsBackfillRunSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: buildPathParameters("/api/embeddings/backfill/{runId}"),
      responses: {
        "200": {
          description: "Run counters",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "404": {
          description: "Run not found or expired",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getEmbeddingStatus",
    method: "get",
    path: "/api/embeddings/status",
    summary: "Counts of tracks missing each embedding type",
    tags: ["Embeddings"],
    querySchema: embeddingsStatusQuerySchema,
    successSchema: embeddingsStatusSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "friend_id",
          in: "query",
          required: false,
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "Missing-embedding counts",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
];

const embeddingsQueueContracts: ApiContractRoute[] = [
  {
    operationId: "getEmbeddingQueueStatus",
    method: "get",
    path: "/api/embeddings/queue",
    summary: "Embedding queue depth, failures and backfill runs (#451)",
    tags: ["Embeddings"],
    successSchema: embeddingQueueStatusSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Lane depths, retry/paused/failed state, drain rate and ETA, kind breakdown and active backfill runs",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "retryFailedEmbeddingJobs",
    method: "post",
    path: "/api/embeddings/queue/retry",
    summary: "Re-enqueue selected entries from the embedding failed list",
    tags: ["Embeddings"],
    bodySchema: embeddingQueueRetryBodySchema,
    successSchema: embeddingQueueRetryResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ids: { type: "array", items: { type: "string" } },
              },
              required: ["ids"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Retried ids and any that were no longer in the failed list",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "400": {
          description: "Invalid body",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
];

const embeddingModelSettingsContracts: ApiContractRoute[] = [
  {
    operationId: "listEmbeddingModelSettings",
    method: "get",
    path: "/api/settings/embedding-model",
    summary: "Target and serving model for identity, audio_vibe and context embeddings",
    tags: ["Embeddings"],
    successSchema: embeddingModelSettingsListSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "One row per kind",
          content: {
            "application/json": { schema: { type: "array", items: { type: "object", additionalProperties: true } } },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "updateEmbeddingModelSettings",
    method: "patch",
    path: "/api/settings/embedding-model",
    summary: "Switch a kind's target or serving model (#386)",
    tags: ["Embeddings"],
    bodySchema: embeddingModelUpdateBodySchema,
    successSchema: embeddingModelSettingsSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["embedding_type", "field", "model", "dims"],
              properties: {
                embedding_type: { type: "string", enum: ["identity", "audio_vibe", "context"] },
                field: { type: "string", enum: ["target", "serving"] },
                model: { type: "string" },
                dims: { type: "integer" },
                template_version: {
                  type: "integer",
                  minimum: 1,
                  description:
                    "Serving only: the template version reads switch to (#407). Omit to keep the current one.",
                },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Updated row",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "400": {
          description: "Invalid body",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
];

const audioIngestContracts: ApiContractRoute[] = [
  {
    operationId: "ingestAudioChunk",
    method: "post",
    path: "/api/audio/ingest",
    summary: "Accept one audio chunk from a vinyl listener device",
    tags: ["Audio Ingest"],
    successSchema: acceptedIngestSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                audio: {
                  type: "string",
                  format: "binary",
                  description:
                    "WAV, FLAC or Ogg/Opus. Validated by inspecting the media, not the filename.",
                },
                source_id: { type: "string", example: "living-room-vinyl" },
                session_id: { type: "string" },
                sequence: { type: "integer" },
                captured_at: { type: "string", format: "date-time" },
              },
              required: ["audio", "source_id"],
            },
          },
        },
      },
      responses: {
        "202": {
          description: "Chunk accepted and queued for matching",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["accepted"] },
                  ingest_id: { type: "string", format: "uuid" },
                  source_id: { type: "string" },
                  duration_seconds: { type: "number" },
                  sample_rate: { type: ["integer", "null"] },
                  channels: { type: ["integer", "null"] },
                  captured_at: { type: ["string", "null"], format: "date-time" },
                },
                required: ["status", "ingest_id", "source_id", "duration_seconds"],
              },
            },
          },
        },
        "400": {
          description:
            "Rejected. `error` is one of missing_audio_file, missing_source_id, unsupported_audio_format, invalid_audio_stream, audio_too_short, audio_too_long.",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "413": {
          description: "Upload exceeds the configured size limit (audio_too_large)",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "claimAudioIngest",
    method: "post",
    path: "/api/audio/ingest/{ingestId}/claim",
    summary: "fingerprint-service announcing it has picked up a chunk",
    tags: ["Audio Ingest"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: buildPathParameters("/api/audio/ingest/{ingestId}/claim"),
      responses: {
        "200": {
          description: "The ingest's status after the claim",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ingest_id: { type: "string", format: "uuid" },
                  status: { type: "string", enum: ["processing", "processed", "failed"] },
                },
                required: ["ingest_id", "status"],
              },
            },
          },
        },
        "404": {
          description: "No such ingest",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "reportAudioIngestResult",
    method: "post",
    path: "/api/audio/ingest/{ingestId}/result",
    summary: "fingerprint-service reporting what a chunk turned out to be",
    tags: ["Audio Ingest"],
    bodySchema: ingestResultBodySchema,
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: buildPathParameters("/api/audio/ingest/{ingestId}/result"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["processed", "failed"] },
                error: { type: ["string", "null"] },
                window_start_at: { type: ["string", "null"], format: "date-time" },
                duration_seconds: { type: ["number", "null"] },
                sample_rate: { type: ["integer", "null"] },
                level_dbfs: {
                  type: ["number", "null"],
                  description: "RMS level of the window, dBFS",
                },
                fingerprint_type: { type: ["string", "null"] },
                fingerprint_version: { type: ["string", "null"] },
                candidates: {
                  type: "array",
                  description:
                    "Zero or one entry. An empty list with status `processed` is a recorded no-match window, not a failure.",
                  items: {
                    type: "object",
                    properties: {
                      track_id: { type: "string" },
                      friend_id: { type: "integer" },
                      confidence: { type: "number" },
                      offset_seconds: { type: "number" },
                    },
                    required: ["track_id", "friend_id", "confidence", "offset_seconds"],
                  },
                },
              },
              required: ["status"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Result recorded and the ingest closed out",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ingest_id: { type: "string", format: "uuid" },
                  status: { type: "string", enum: ["processed", "failed"] },
                  detections: { type: "integer" },
                },
                required: ["ingest_id", "status", "detections"],
              },
            },
          },
        },
        "400": {
          description: "Malformed result",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "No such ingest",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "listRecentIngests",
    method: "get",
    path: "/api/audio/ingest/recent",
    summary: "Recent audio chunks and what became of them",
    tags: ["Audio Ingest"],
    successSchema: ingestRecentResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "source_id", in: "query", required: false, schema: { type: "string" } },
        { name: "session_id", in: "query", required: false, schema: { type: "string" } },
        { name: "status", in: "query", required: false,
          schema: { type: "string", enum: ["received", "processing", "processed", "failed"] } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
        { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
      ],
      responses: {
        "200": {
          description: "Recent ingests, newest first",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ingests: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        ingest_id: { type: "string" },
                        source_id: { type: "string" },
                        session_id: { type: ["string", "null"] },
                        sequence: { type: ["integer", "null"] },
                        status: {
                          type: "string",
                          enum: ["received", "processing", "processed", "failed"],
                        },
                        error: { type: ["string", "null"] },
                        duration_seconds: { type: ["number", "null"] },
                        sample_rate: { type: ["integer", "null"] },
                        channels: { type: ["integer", "null"] },
                        codec: { type: ["string", "null"] },
                        file_path: {
                          type: ["string", "null"],
                          description:
                            "Non-null in a terminal state means the raw audio is still on the volume, worth a look.",
                        },
                        captured_at: { type: ["string", "null"], format: "date-time" },
                        received_at: { type: "string", format: "date-time" },
                        updated_at: { type: "string", format: "date-time" },
                      },
                      required: [
                        "ingest_id", "source_id", "session_id", "sequence", "status",
                        "error", "duration_seconds", "sample_rate", "channels", "codec",
                        "file_path", "captured_at", "received_at", "updated_at",
                      ],
                    },
                  },
                  count: { type: "integer" },
                },
                required: ["ingests", "count"],
              },
            },
          },
        },
        "400": {
          description: "Unknown status filter",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getIngestPipelineStats",
    method: "get",
    path: "/api/audio/ingest/stats",
    summary: "Whether the vinyl pipeline is working: index, queue, match rate",
    tags: ["Audio Ingest"],
    successSchema: ingestPipelineStatsSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "minutes", in: "query", required: false, schema: { type: "integer", default: 60 } },
        { name: "source_id", in: "query", required: false, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description:
            "Pipeline health. `index.empty` true means nothing can match, however healthy the rest looks.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  since: { type: "string", format: "date-time" },
                  window_minutes: { type: "integer" },
                  source_id: { type: ["string", "null"] },
                  ingest_writable: {
                    type: "boolean",
                    description: "False means every upload fails with EACCES — check this first.",
                  },
                  index: {
                    type: "object",
                    properties: {
                      engine_registered: { type: "boolean" },
                      fingerprint_type: { type: ["string", "null"] },
                      fingerprint_version: { type: ["string", "null"] },
                      indexed_tracks: { type: "integer" },
                      empty: {
                        type: "boolean",
                        description: "True means nothing can ever match, however healthy the rest looks.",
                      },
                      missing_fingerprint_tracks: { type: "integer" },
                    },
                    required: [
                      "engine_registered", "fingerprint_type", "fingerprint_version",
                      "indexed_tracks", "empty", "missing_fingerprint_tracks",
                    ],
                  },
                  queue_depth: {
                    type: ["integer", "null"],
                    description: "Null when redis is unreachable — different from a genuine 0.",
                  },
                  ingests: {
                    type: "object",
                    properties: {
                      by_status: { type: "object", additionalProperties: { type: "integer" } },
                      failures: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            error: { type: "string" },
                            count: { type: "integer" },
                          },
                          required: ["error", "count"],
                        },
                      },
                      oldest_in_flight: {
                        type: ["object", "null"],
                        properties: {
                          ingest_id: { type: "string" },
                          status: { type: "string" },
                          received_at: { type: "string", format: "date-time" },
                        },
                      },
                    },
                    required: ["by_status", "failures", "oldest_in_flight"],
                  },
                  detections: {
                    type: "object",
                    properties: {
                      windows: { type: "integer" },
                      matched: { type: "integer" },
                      no_match: { type: "integer" },
                      match_rate: {
                        type: ["number", "null"],
                        description: "Null when the window recorded no detections at all.",
                      },
                      confidence_bands: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            band: { type: "string" },
                            count: { type: "integer" },
                          },
                          required: ["band", "count"],
                        },
                      },
                    },
                    required: ["windows", "matched", "no_match", "match_rate", "confidence_bands"],
                  },
                  spins: {
                    type: "object",
                    properties: {
                      pending: {
                        type: ["integer", "null"],
                        description:
                          "Confidently-detected plays not yet aggregated into a spin session (#304). Null when it could not be computed.",
                      },
                    },
                    required: ["pending"],
                  },
                },
                required: [
                  "since", "window_minutes", "source_id", "ingest_writable", "index",
                  "queue_depth", "ingests", "detections", "spins",
                ],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "listRecentDetections",
    method: "get",
    path: "/api/detections/recent",
    summary: "Recent matcher windows, with the track resolved",
    tags: ["Audio Ingest"],
    successSchema: detectionsRecentResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "source_id", in: "query", required: false, schema: { type: "string" } },
        { name: "session_id", in: "query", required: false, schema: { type: "string" } },
        { name: "matched", in: "query", required: false,
          schema: { type: "boolean" },
          description: "Omit for both. A no-match window is a recorded result, not an absence." },
        { name: "since", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
        { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
      ],
      responses: {
        "200": {
          description: "Recent windows, newest first, including no-match windows",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  detections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        ingest_id: { type: "string" },
                        source_id: { type: "string" },
                        session_id: { type: ["string", "null"] },
                        window_start_at: { type: ["string", "null"], format: "date-time" },
                        matched: {
                          type: "boolean",
                          description: "False is a recorded no-match window, not an absence.",
                        },
                        track_id: { type: ["string", "null"] },
                        friend_id: { type: ["integer", "null"] },
                        title: { type: ["string", "null"] },
                        artist: { type: ["string", "null"] },
                        album: { type: ["string", "null"] },
                        confidence: { type: ["number", "null"] },
                        offset_seconds: { type: ["number", "null"] },
                        level_dbfs: {
                          type: ["number", "null"],
                          description: "RMS level of the window, dBFS; null on older rows",
                        },
                        fingerprint_type: { type: ["string", "null"] },
                        fingerprint_version: { type: ["string", "null"] },
                        created_at: { type: "string", format: "date-time" },
                      },
                      required: [
                        "id", "ingest_id", "source_id", "session_id", "window_start_at",
                        "matched", "track_id", "friend_id", "title", "artist", "album",
                        "confidence", "offset_seconds", "level_dbfs", "fingerprint_type",
                        "fingerprint_version", "created_at",
                      ],
                    },
                  },
                  count: { type: "integer" },
                },
                required: ["detections", "count"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getIngestRetentionStatus",
    method: "get",
    path: "/api/audio/ingest/retention",
    summary: "Ingest volume usage and what the next sweep would delete",
    tags: ["Audio Ingest"],
    successSchema: ingestRetentionStatusSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Current usage, sweep candidates and the active policy",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  files: { type: "integer" },
                  bytes: { type: "integer" },
                  sweepable: { type: "integer" },
                  orphans: { type: "integer" },
                  inFlight: {
                    type: "integer",
                    description:
                      "Files held by a received/processing record. Never swept until they exceed the max age.",
                  },
                  lastSweptAt: { type: ["string", "null"], format: "date-time" },
                  policy: { type: "object", additionalProperties: true },
                },
                required: [
                  "files",
                  "bytes",
                  "sweepable",
                  "orphans",
                  "inFlight",
                  "lastSweptAt",
                  "policy",
                ],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
];

const sha256Param = {
  name: "sha256",
  in: "path",
  required: true,
  description: "Lowercase hex sha256 of the recording's bytes",
  schema: { type: "string", pattern: "^[0-9a-f]{64}$" },
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

const setRecordingSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    sha256: { type: "string" },
    file_path: { type: "string" },
    original_filename: { type: ["string", "null"] },
    format_name: { type: ["string", "null"] },
    duration_seconds: { type: ["number", "null"] },
    size_bytes: { type: ["integer", "string"] },
    created_at: { type: "string", format: "date-time" },
  },
  required: ["sha256", "file_path", "size_bytes"],
};

const setDerivationSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    recording_sha256: { type: "string" },
    fingerprint_type: { type: "string" },
    fingerprint_version: { type: "string" },
    window_seconds: { type: "number" },
    step_seconds: { type: "number" },
    status: { type: "string", enum: ["queued", "processing", "processed", "failed"] },
    error: { type: ["string", "null"] },
    duration_seconds: { type: ["number", "null"] },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    completed_at: { type: ["string", "null"], format: "date-time" },
  },
  required: ["id", "recording_sha256", "status"],
};

const setTrackRefSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    track_id: { type: "string" },
    friend_id: { type: "integer" },
    title: { type: ["string", "null"] },
    artist: { type: ["string", "null"] },
    release_id: { type: ["string", "null"] },
    position: { type: ["string", "null"] },
  },
};

const plannedEntrySchemaObject: Record<string, unknown> = {
  ...setTrackRefSchemaObject,
  properties: {
    ...(setTrackRefSchemaObject.properties as Record<string, unknown>),
    index: { type: "integer", description: "0-based position in the playlist" },
    fingerprinted: {
      type: "boolean",
      description: "Whether this track is in the reference index at all",
    },
  },
};

const setDerivationViewSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    derivation: setDerivationSchemaObject,
    recording: setRecordingSchemaObject,
    summary: {
      type: ["object", "null"],
      properties: {
        plays: { type: "integer" },
        duration_seconds: { type: ["number", "null"] },
        identified_seconds: { type: "number" },
        identified_fraction: { type: ["number", "null"] },
      },
    },
    tracklist: {
      type: "array",
      items: {
        type: "object",
        properties: {
          track_id: { type: "string" },
          friend_id: { type: "integer" },
          start_seconds: { type: "number" },
          end_seconds: { type: "number" },
          confidence: { type: "number" },
          windows: { type: "integer" },
          rate: {
            type: ["number", "null"],
            description: "Track seconds per recording second; ~1.0 is a record at pitch",
          },
          track: { ...setTrackRefSchemaObject, type: ["object", "null"] },
        },
      },
    },
    unidentified: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start_seconds: { type: "number" },
          end_seconds: { type: "number" },
          unindexed_neighbours: { type: "array", items: setTrackRefSchemaObject },
        },
      },
    },
    diff: {
      type: ["object", "null"],
      description: "Present when playlist_id or live_set_id is given. `play` indexes into tracklist.",
      properties: {
        playlist_id: { type: "integer" },
        played_as_planned: {
          type: "array",
          items: {
            type: "object",
            properties: {
              play: { type: "integer" },
              planned: plannedEntrySchemaObject,
              out_of_order: { type: "boolean" },
            },
          },
        },
        played_instead_of: {
          type: "array",
          items: {
            type: "object",
            properties: { play: { type: "integer" }, planned: plannedEntrySchemaObject },
          },
        },
        played_not_planned: {
          type: "array",
          items: { type: "object", properties: { play: { type: "integer" } } },
        },
        planned_not_played: { type: "array", items: plannedEntrySchemaObject },
      },
    },
  },
  required: ["derivation", "recording", "tracklist", "unidentified"],
};

const jsonError = (description: string) => ({
  description,
  content: { "application/json": { schema: errorResponseSchemaObject } },
});

const setDerivationContracts: ApiContractRoute[] = [
  {
    operationId: "headSetRecording",
    method: "head",
    path: "/api/set-recordings/{sha256}",
    summary: "Does the server already hold this recording?",
    tags: ["Set Derivation"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [sha256Param],
      responses: {
        "200": { description: "Held; Content-Length is its size" },
        "404": { description: "Not held; upload it with PUT" },
      },
    },
  },
  {
    operationId: "uploadSetRecording",
    method: "put",
    path: "/api/set-recordings/{sha256}",
    summary: "Stream a whole set recording, stored under its sha256",
    tags: ["Set Derivation"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        sha256Param,
        {
          name: "X-Filename",
          in: "header",
          required: false,
          description: "The file's original name, kept for display only",
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: true,
        description:
          "The raw bytes of the recording, not multipart. Kept only if they hash to the sha256 in the path.",
        content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
      },
      responses: {
        "200": {
          description: "Already held; the body was not read",
          content: { "application/json": { schema: setRecordingSchemaObject } },
        },
        "201": {
          description: "Stored",
          content: { "application/json": { schema: setRecordingSchemaObject } },
        },
        "400": jsonError("Bad sha256, empty body, or not audio ffprobe can read"),
        "413": jsonError("Over SET_RECORDING_MAX_BYTES"),
        "422": jsonError("The body did not hash to the sha256 in the path; send it again"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "downloadSetRecording",
    method: "get",
    path: "/api/set-recordings/{sha256}",
    summary: "Download a stored set recording",
    tags: ["Set Derivation"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [sha256Param],
      responses: {
        "200": {
          description: "The recording's bytes",
          content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
        },
        "404": jsonError("No such recording"),
      },
    },
  },
  {
    operationId: "createSetDerivation",
    method: "post",
    path: "/api/set-derivations",
    summary: "Derive a tracklist from an uploaded set recording",
    tags: ["Set Derivation"],
    bodySchema: setDerivationCreateBodySchema,
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                recording_sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
                window_seconds: { type: "number", default: 15 },
                step_seconds: { type: "number", default: 15 },
                force: {
                  type: "boolean",
                  description: "Start a new run even if an equivalent one exists",
                },
                live_set_id: {
                  type: ["integer", "null"],
                  description: "Also list the recording in this live set's media",
                },
              },
              required: ["recording_sha256"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "An equivalent run already exists and is returned (`reused: true`)",
          content: { "application/json": { schema: setDerivationSchemaObject } },
        },
        "202": {
          description: "Queued; poll GET /api/set-derivations/{id}",
          content: { "application/json": { schema: setDerivationSchemaObject } },
        },
        "400": jsonError("Invalid request"),
        "404": jsonError("No such recording; upload it first"),
        "503": jsonError("No fingerprint engine registered, or the queue is unreachable"),
      },
    },
  },
  {
    operationId: "getSetDerivation",
    method: "get",
    path: "/api/set-derivations/{id}",
    summary: "A derived tracklist, its unidentified regions and a diff against a plan",
    tags: ["Set Derivation"],
    querySchema: setDerivationViewQuerySchema,
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        idParam,
        {
          name: "playlist_id",
          in: "query",
          required: false,
          description: "Diff against this playlist",
          schema: { type: "integer" },
        },
        {
          name: "live_set_id",
          in: "query",
          required: false,
          description: "Diff against this live set's playlist",
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "The derivation; tracklist and summary are empty until it is processed",
          content: { "application/json": { schema: setDerivationViewSchemaObject } },
        },
        "404": jsonError("No such derivation, playlist or live set"),
      },
    },
  },
  {
    operationId: "claimSetDerivation",
    method: "post",
    path: "/api/set-derivations/{id}/claim",
    summary: "fingerprint-set-worker announcing it has picked up a run",
    tags: ["Set Derivation"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [idParam],
      responses: {
        "200": {
          description: "The run's status after the claim",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  derivation_id: { type: "string", format: "uuid" },
                  status: { type: "string" },
                },
              },
            },
          },
        },
        "404": jsonError("No such derivation"),
      },
    },
  },
  {
    operationId: "reportSetDerivationResult",
    method: "post",
    path: "/api/set-derivations/{id}/result",
    summary: "fingerprint-set-worker reporting every window of a recording",
    tags: ["Set Derivation"],
    bodySchema: setDerivationResultBodySchema,
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["processed", "failed"] },
                error: { type: ["string", "null"] },
                duration_seconds: { type: ["number", "null"] },
                windows: {
                  type: "array",
                  description: "Every window; an empty candidates list is unidentified audio",
                  items: {
                    type: "object",
                    properties: {
                      start_seconds: { type: "number" },
                      duration_seconds: { type: "number" },
                      candidates: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            track_id: { type: "string" },
                            friend_id: { type: "integer" },
                            confidence: { type: "number" },
                            offset_seconds: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
              required: ["status"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Result stored and the run closed out",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  derivation_id: { type: "string", format: "uuid" },
                  status: { type: "string" },
                  windows: { type: "integer" },
                },
              },
            },
          },
        },
        "400": jsonError("Invalid result body"),
        "404": jsonError("No such derivation"),
      },
    },
  },
];

// ─── Record copies and care actions (#262) ───────────────────────────────────

const SLEEVE_TYPE_ENUM = ["original", "paper", "poly-rice-paper-poly", "poly"];
const nullableSleeveType = { type: ["string", "null"], enum: [...SLEEVE_TYPE_ENUM, null] };
const integerIdParam = { name: "id", in: "path", required: true, schema: { type: "integer" } };
const friendIdQueryParam = {
  name: "friend_id",
  in: "query",
  required: true,
  schema: { type: "integer" },
};
const pagingParams = [
  { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
  { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
];
const overdueDaysParam = {
  name: "overdue_days",
  in: "query",
  required: false,
  description: "Days since cleaning before a copy is overdue. Default RECORD_CLEANING_OVERDUE_DAYS (365).",
  schema: { type: "integer", minimum: 1 },
};
const needsSleeveParam = {
  name: "needs_sleeve",
  in: "query",
  required: false,
  description: "The sleeve every copy should be in. Default poly-rice-paper-poly.",
  schema: { type: "string", enum: SLEEVE_TYPE_ENUM },
};

const recordCopySchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    id: { type: "integer" },
    friend_id: { type: "integer" },
    release_id: { type: "string" },
    is_default: {
      type: "boolean",
      description: "The copy an action logged against the release lands on",
    },
    label: { type: ["string", "null"], example: "DJ copy" },
    notes: { type: ["string", "null"], example: "Light hairline on B2, plays through." },
    inner_sleeve_type: {
      ...nullableSleeveType,
      description: "From the latest sleeved action; null when none is logged",
    },
    last_cleaned_at: {
      type: ["string", "null"],
      format: "date-time",
      description: "From the latest cleaned action; null when never cleaned",
    },
    deleted_at: { type: ["string", "null"], format: "date-time", example: null },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
  required: [
    "id", "friend_id", "release_id", "is_default", "label", "notes", "inner_sleeve_type",
    "last_cleaned_at", "deleted_at", "created_at", "updated_at",
  ],
};

const recordCopyListItemSchemaObject: Record<string, unknown> = {
  ...recordCopySchemaObject,
  properties: {
    ...(recordCopySchemaObject.properties as Record<string, unknown>),
    id: { type: ["integer", "null"], description: "Null for a release's implicit default copy" },
    created_at: { type: ["string", "null"], format: "date-time" },
    updated_at: { type: ["string", "null"], format: "date-time" },
  },
};

const recordActionSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    id: { type: "integer" },
    copy_id: { type: "integer" },
    friend_id: { type: "integer" },
    action_type: { type: "string", enum: ["cleaned", "sleeved", "inspected", "repaired"] },
    occurred_at: { type: "string", format: "date-time" },
    notes: { type: ["string", "null"], example: "Two passes, air dried overnight." },
    sleeve_type: { ...nullableSleeveType, description: "Set only on a sleeved action" },
    details: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["dry-brush", "wet-manual", "vacuum", "ultrasonic", "other"],
        },
      },
      additionalProperties: false,
    },
    voided_at: { type: ["string", "null"], format: "date-time", example: null },
    created_at: { type: "string", format: "date-time" },
  },
  required: [
    "id", "copy_id", "friend_id", "action_type", "occurred_at", "notes", "sleeve_type",
    "details", "voided_at", "created_at",
  ],
};

const recordActionMutationSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: { action: recordActionSchemaObject, copy: recordCopySchemaObject },
  required: ["action", "copy"],
};

const recordCareItemSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    friend_id: { type: "integer" },
    release_id: { type: "string" },
    album_title: { type: "string" },
    album_artist: { type: "string" },
    album_thumbnail: { type: ["string", "null"] },
    copy_id: {
      type: ["integer", "null"],
      description: "Null for an album with no copy rows: its implicit default copy",
    },
    is_default: { type: "boolean" },
    label: { type: ["string", "null"], example: null },
    inner_sleeve_type: nullableSleeveType,
    last_cleaned_at: { type: ["string", "null"], format: "date-time" },
  },
  required: [
    "friend_id", "release_id", "album_title", "album_artist", "album_thumbnail", "copy_id",
    "is_default", "label", "inner_sleeve_type", "last_cleaned_at",
  ],
};

const recordCareContracts: ApiContractRoute[] = [
  {
    operationId: "listRecordCopies",
    method: "get",
    path: "/api/record-copies",
    summary: "List a friend's physical record copies",
    tags: ["Record Care"],
    querySchema: recordCopyListQuerySchema,
    successSchema: recordCopyListResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        friendIdQueryParam,
        { name: "release_id", in: "query", required: false, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description:
            "Live copies. With release_id, a release that has no copy rows lists its implicit default copy, with id, created_at and updated_at null. overdue_days is the cleaning threshold (RECORD_CLEANING_OVERDUE_DAYS).",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", items: recordCopyListItemSchemaObject },
                  overdue_days: { type: "integer" },
                },
                required: ["items", "overdue_days"],
              },
            },
          },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "createRecordCopy",
    method: "post",
    path: "/api/record-copies",
    summary: "Add a physical copy of a release",
    tags: ["Record Care"],
    bodySchema: recordCopyCreateBodySchema,
    successSchema: recordCopyResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                friend_id: { type: "integer" },
                release_id: { type: "string" },
                label: { type: ["string", "null"], maxLength: 100 },
                notes: { type: ["string", "null"] },
              },
              required: ["friend_id", "release_id"],
            },
            example: { friend_id: 1, release_id: "rel_4471", label: "Copy 2" },
          },
        },
      },
      responses: {
        "201": {
          description:
            "Created, as an extra copy. A release with no copy rows has its implicit default copy made real first, so this is always one copy more.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { copy: recordCopySchemaObject },
                required: ["copy"],
              },
            },
          },
        },
        "400": jsonError("Invalid payload"),
        "404": jsonError("Album not found"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "updateDefaultRecordCopy",
    method: "patch",
    path: "/api/record-copies/default",
    summary: "Label or annotate a release's default copy, making it real if implicit",
    tags: ["Record Care"],
    bodySchema: recordCopyDefaultUpdateBodySchema,
    successSchema: recordCopyResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                friend_id: { type: "integer" },
                release_id: { type: "string" },
                label: { type: ["string", "null"], maxLength: 100 },
                notes: { type: ["string", "null"] },
              },
              required: ["friend_id", "release_id"],
            },
            example: { friend_id: 1, release_id: "rel_4471", label: "DJ copy" },
          },
        },
      },
      responses: {
        "200": {
          description: "The default copy, updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { copy: recordCopySchemaObject },
                required: ["copy"],
              },
            },
          },
        },
        "400": jsonError("Invalid payload"),
        "404": jsonError("Album not found"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "updateRecordCopy",
    method: "patch",
    path: "/api/record-copies/{id}",
    summary: "Change a copy's label or notes",
    tags: ["Record Care"],
    paramsSchema: recordCopyParamsSchema,
    bodySchema: recordCopyUpdateBodySchema,
    successSchema: recordCopyResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [integerIdParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              description:
                "The sleeve is not set here: log a sleeved action, so it stays derivable from history.",
              properties: {
                friend_id: { type: "integer" },
                label: { type: ["string", "null"], maxLength: 100 },
                notes: { type: ["string", "null"] },
              },
              required: ["friend_id"],
            },
            example: { friend_id: 1, label: "DJ copy" },
          },
        },
      },
      responses: {
        "200": {
          description: "Updated copy",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { copy: recordCopySchemaObject },
                required: ["copy"],
              },
            },
          },
        },
        "400": jsonError("Invalid id or payload"),
        "404": jsonError("Record copy not found"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "deleteRecordCopy",
    method: "delete",
    path: "/api/record-copies/{id}",
    summary: "Soft-delete a copy, keeping its history",
    tags: ["Record Care"],
    paramsSchema: recordCopyParamsSchema,
    querySchema: recordFriendQuerySchema,
    successSchema: recordCopyDeleteResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [integerIdParam, friendIdQueryParam],
      responses: {
        "200": {
          description: "Deleted copy",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { success: { type: "boolean" }, copy: recordCopySchemaObject },
                required: ["success", "copy"],
              },
            },
          },
        },
        "400": jsonError("Invalid id or query"),
        "404": jsonError("Record copy not found"),
        "409": jsonError("The default copy cannot be deleted while the release has other copies"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "listRecordActions",
    method: "get",
    path: "/api/record-copies/{id}/actions",
    summary: "A copy's care history, newest first",
    tags: ["Record Care"],
    paramsSchema: recordCopyParamsSchema,
    querySchema: recordActionListQuerySchema,
    successSchema: recordActionListResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        integerIdParam,
        friendIdQueryParam,
        {
          name: "action_type",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["cleaned", "sleeved", "inspected", "repaired"] },
        },
        {
          name: "include_voided",
          in: "query",
          required: false,
          schema: { type: "boolean", default: false },
        },
        ...pagingParams,
      ],
      responses: {
        "200": {
          description: "Actions",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", items: recordActionSchemaObject },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
                required: ["items", "limit", "offset"],
              },
            },
          },
        },
        "400": jsonError("Invalid id or query"),
        "404": jsonError("Record copy not found"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "listRecordCare",
    method: "get",
    path: "/api/record-copies/care",
    summary: "Copies never cleaned, overdue for cleaning, or not in the wanted sleeve",
    tags: ["Record Care"],
    querySchema: recordCareQuerySchema,
    successSchema: recordCareResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        friendIdQueryParam,
        {
          name: "status",
          in: "query",
          required: false,
          description: "Omit for every copy",
          schema: { type: "string", enum: ["never_cleaned", "overdue", "needs_sleeve"] },
        },
        overdueDaysParam,
        needsSleeveParam,
        {
          name: "sleeve_type",
          in: "query",
          required: false,
          description: "Only copies in this sleeve; unknown for none logged",
          schema: { type: "string", enum: [...SLEEVE_TYPE_ENUM, "unknown"] },
        },
        ...pagingParams,
      ],
      responses: {
        "200": {
          description:
            "Copies, least recently cleaned first. An album with no copy rows appears once, as its implicit default copy (copy_id null).",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", items: recordCareItemSchemaObject },
                  total: { type: "integer" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                  overdue_days: { type: "integer", example: 365 },
                  needs_sleeve_type: { type: "string", enum: ["poly-rice-paper-poly", "original", "paper", "poly"] },
                },
                required: ["items", "total", "limit", "offset", "overdue_days", "needs_sleeve_type"],
              },
            },
          },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "getRecordCareSummary",
    method: "get",
    path: "/api/record-copies/care/summary",
    summary: "Counts of copies by care state and sleeve",
    tags: ["Record Care"],
    querySchema: recordCareSummaryQuerySchema,
    successSchema: recordCareSummaryResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [friendIdQueryParam, overdueDaysParam, needsSleeveParam],
      responses: {
        "200": {
          description: "Counts, with albums without copy rows counted as one copy each",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  total: { type: "integer", example: 812 },
                  never_cleaned: { type: "integer", example: 640 },
                  overdue: { type: "integer", example: 41 },
                  needs_sleeve: { type: "integer", example: 755 },
                  by_sleeve_type: {
                    type: "object",
                    properties: {
                      original: { type: "integer", example: 30 },
                      paper: { type: "integer", example: 12 },
                      "poly-rice-paper-poly": { type: "integer", example: 57 },
                      poly: { type: "integer", example: 8 },
                      unknown: { type: "integer", example: 705 },
                    },
                    required: ["original", "paper", "poly-rice-paper-poly", "poly", "unknown"],
                  },
                  overdue_days: { type: "integer", example: 365 },
                  needs_sleeve_type: { type: "string", enum: ["poly-rice-paper-poly", "original", "paper", "poly"] },
                },
                required: [
                  "total", "never_cleaned", "overdue", "needs_sleeve", "by_sleeve_type",
                  "overdue_days", "needs_sleeve_type",
                ],
              },
            },
          },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "logRecordAction",
    method: "post",
    path: "/api/record-actions",
    summary: "Log a care action against a copy or a release",
    tags: ["Record Care"],
    bodySchema: recordActionCreateBodySchema,
    successSchema: recordActionMutationResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              description:
                "Exactly one of copy_id or release_id. A release_id lands on the release's default copy, created if it has none.",
              properties: {
                friend_id: { type: "integer" },
                copy_id: { type: "integer" },
                release_id: { type: "string" },
                action_type: {
                  type: "string",
                  enum: ["cleaned", "sleeved", "inspected", "repaired"],
                },
                occurred_at: {
                  type: "string",
                  format: "date-time",
                  description: "Default now. May be backdated.",
                },
                notes: { type: ["string", "null"] },
                sleeve_type: {
                  type: "string",
                  enum: SLEEVE_TYPE_ENUM,
                  description: "Required for sleeved, and only for sleeved",
                },
                details: {
                  type: "object",
                  properties: {
                    method: {
                      type: "string",
                      enum: ["dry-brush", "wet-manual", "vacuum", "ultrasonic", "other"],
                      description: "Only for cleaned",
                    },
                  },
                  additionalProperties: false,
                },
              },
              required: ["friend_id", "action_type"],
            },
            example: {
              friend_id: 1,
              release_id: "rel_4471",
              action_type: "cleaned",
              occurred_at: "2026-09-30T19:00:00.000Z",
              notes: "Two passes, air dried overnight.",
              details: { method: "ultrasonic" },
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Logged, with the copy's updated care state",
          content: { "application/json": { schema: recordActionMutationSchemaObject } },
        },
        "400": jsonError("Invalid payload"),
        "404": jsonError("Album not found, or record copy not found"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "voidRecordAction",
    method: "delete",
    path: "/api/record-actions/{id}",
    summary: "Void an action; it stays in the history",
    tags: ["Record Care"],
    paramsSchema: recordActionParamsSchema,
    querySchema: recordFriendQuerySchema,
    successSchema: recordActionVoidResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [integerIdParam, friendIdQueryParam],
      responses: {
        "200": {
          description: "Voided, with the copy's recomputed care state. Voiding twice is a no-op.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  action: recordActionSchemaObject,
                  copy: recordCopySchemaObject,
                },
                required: ["success", "action", "copy"],
              },
            },
          },
        },
        "400": jsonError("Invalid id or query"),
        "404": jsonError("Record action not found"),
        "500": jsonError("Server error"),
      },
    },
  },
];

const backupContracts: ApiContractRoute[] = [
  {
    operationId: "listBackups",
    method: "get",
    path: "/api/backups",
    summary: "List available database backup files",
    tags: ["Backups"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Backup files, newest first",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  files: { type: "array", items: { type: "string" } },
                  backups: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        filename: { type: "string" },
                        size_bytes: { type: "integer" },
                        modified_at: { type: "string", format: "date-time" },
                      },
                      required: ["filename", "size_bytes", "modified_at"],
                    },
                  },
                },
                required: ["files", "backups"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "downloadBackup",
    method: "get",
    path: "/api/backups/{filename}",
    summary: "Download a database backup file",
    tags: ["Backups"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: buildPathParameters("/api/backups/{filename}"),
      responses: {
        "200": {
          description: "Backup file contents",
          content: {
            "application/octet-stream": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        "400": {
          description: "Missing or invalid filename",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "Backup file not found",
          content: { "text/plain": { schema: { type: "string" } } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "deleteBackup",
    method: "delete",
    path: "/api/backups/{filename}",
    summary: "Delete a database backup file",
    tags: ["Backups"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: buildPathParameters("/api/backups/{filename}"),
      responses: {
        "200": {
          description: "Backup deleted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { deleted: { type: "string" } },
                required: ["deleted"],
              },
            },
          },
        },
        "400": {
          description: "Invalid filename",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "Backup file not found",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "restoreDatabase",
    method: "post",
    path: "/api/restore",
    summary: "Restore the database from an uploaded backup file",
    tags: ["Backups"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "filename",
          in: "query",
          required: false,
          description:
            "Original filename of a raw-body upload; its extension selects pg_restore (.dump, .backup) or psql (.sql).",
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: true,
        description:
          "Prefer the raw file with ?filename=, which streams to disk. A multipart upload is buffered in server memory.",
        content: {
          "application/octet-stream": {
            schema: { type: "string", format: "binary" },
          },
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: { file: { type: "string", format: "binary" } },
              required: ["file"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Restore result with reindex summary",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  backupType: { type: "string", enum: ["schema+data", "data-only"] },
                  fileType: { type: "string", enum: ["sql", "dump"] },
                  reindex: {
                    type: "object",
                    properties: {
                      albumsIndexed: { type: "integer" },
                      tracksIndexed: { type: "integer" },
                      warning: { type: ["string", "null"] },
                    },
                    required: ["albumsIndexed", "tracksIndexed", "warning"],
                  },
                },
                required: ["message", "backupType", "fileType", "reindex"],
              },
            },
          },
        },
        "400": {
          description: "No file uploaded",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Restore error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "runBackupNow",
    method: "post",
    path: "/api/settings/backup/run",
    summary: "Trigger a manual backup run",
    tags: ["Settings", "Backups"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Latest backup status after the run",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { oneOf: [backupStatusSchemaObject, { type: "null" }] },
                },
                required: ["status"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getBackupHealth",
    method: "get",
    path: "/api/health/backup",
    summary: "Backup health check (200 healthy, 503 unhealthy)",
    tags: ["Health"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Backup is healthy",
          content: { "application/json": { schema: backupHealthSchemaObject } },
        },
        "503": {
          description: "Backup is unhealthy or its status is unavailable",
          content: { "application/json": { schema: backupHealthSchemaObject } },
        },
      },
    },
  },
];

export const genreTreeNodeSchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    slug: { type: "string" },
    parent_id: { type: ["string", "null"], format: "uuid" },
    source: { type: "string", enum: ["discogs", "custom"] },
    track_count: { type: "integer", minimum: 0, description: "Zero until track genre links are introduced" },
    album_count: { type: "integer", minimum: 0, description: "Zero until track genre links are introduced" },
    aliases: {
      type: "array",
      items: { type: "string" },
      description: "Normalised alias keys that resolve to this genre, for matching raw Discogs spellings",
    },
    children: { type: "array", items: { $ref: "#/components/schemas/GenreTreeNode" } },
  },
  required: ["id", "name", "slug", "parent_id", "source", "track_count", "album_count", "children"],
};

const genreUuid = { type: "string", format: "uuid" };

const genrePageRefObject = {
  type: "object",
  properties: {
    id: genreUuid,
    name: { type: "string" },
    slug: { type: "string" },
    track_count: { type: "integer", minimum: 0, description: "Tracks the genre filter returns, subgenres included" },
  },
  required: ["id", "name", "slug", "track_count"],
};
const genrePageSchemaObject = {
  type: "object",
  properties: {
    genre: {
      type: "object",
      properties: {
        id: genreUuid,
        name: { type: "string" },
        slug: { type: "string" },
        parent_id: { type: ["string", "null"], format: "uuid" },
        source: { type: "string", enum: ["discogs", "custom"] },
        aliases: { type: "array", items: { type: "string" } },
      },
      required: ["id", "name", "slug", "parent_id", "source", "aliases"],
    },
    ancestors: {
      type: "array",
      description: "Root first, ending with the parent",
      items: {
        type: "object",
        properties: { id: genreUuid, name: { type: "string" }, slug: { type: "string" } },
        required: ["id", "name", "slug"],
      },
    },
    children: { type: "array", items: genrePageRefObject },
    related: {
      type: "array",
      description: "Siblings under the same parent that the collection uses",
      items: genrePageRefObject,
    },
    counts: {
      type: "object",
      properties: {
        tracks: { type: "integer", minimum: 0, description: "Tracks linked to this genre itself" },
        albums: { type: "integer", minimum: 0, description: "Albums whose Discogs genres or styles name this genre" },
        tracks_total: { type: "integer", minimum: 0, description: "Tracks the genre filter returns" },
        albums_total: { type: "integer", minimum: 0, description: "Albums the genre filter returns" },
      },
      required: ["tracks", "albums", "tracks_total", "albums_total"],
    },
    top_tracks: {
      type: "array",
      description: "Most played first, then most recently added",
      items: { type: "object", properties: { play_count: { type: "integer", minimum: 0 } }, required: ["play_count"] },
    },
    top_albums: {
      type: "array",
      description: "Most played first, then most recently added",
      items: { type: "object", properties: { play_count: { type: "integer", minimum: 0 } }, required: ["play_count"] },
    },
  },
  required: ["genre", "ancestors", "children", "related", "counts", "top_tracks", "top_albums"],
};
const genreName = { type: "string", minLength: 1 };
const genreBodyObjects: Record<string, Record<string, unknown>> = {
  createGenre: { type: "object", properties: { name: genreName, parent_id: genreUuid }, required: ["name", "parent_id"] },
  updateGenre: { type: "object", properties: { name: genreName, parent_id: { type: ["string", "null"], format: "uuid" } }, anyOf: [{ required: ["name"] }, { required: ["parent_id"] }] },
  addGenreAlias: { type: "object", properties: { alias: genreName }, required: ["alias"] },
  mergeGenres: { type: "object", properties: { target_id: genreUuid }, required: ["target_id"] },
};
const genreResponseObjects: Record<string, Record<string, unknown>> = {
  createGenre: { type: "object", properties: {
    id: genreUuid, name: { type: "string" }, slug: { type: "string" },
    parent_id: { type: ["string", "null"], format: "uuid" }, source: { type: "string", enum: ["discogs", "custom"] },
  }, required: ["id", "name", "slug", "parent_id", "source"] },
  addGenreAlias: { type: "object", properties: { success: { type: "boolean", const: true } }, required: ["success"] },
  mergeGenres: { type: "object", properties: { success: { type: "boolean", const: true }, merged_genre_id: genreUuid, survivor_genre_id: genreUuid }, required: ["success", "merged_genre_id", "survivor_genre_id"] },
};
genreResponseObjects.updateGenre = genreResponseObjects.createGenre;

const genreMutationContracts: ApiContractRoute[] = ([
  {
    operationId: "createGenre", method: "post", path: "/api/genres",
    summary: "Create a custom genre under an existing parent",
    bodySchema: genreCreateBodySchema, successSchema: genreMutationResponseSchema,
  },
  {
    operationId: "updateGenre", method: "patch", path: "/api/genres/{id}",
    summary: "Rename or re-parent a genre; null parent moves it to the root",
    bodySchema: genreUpdateBodySchema, successSchema: genreMutationResponseSchema,
  },
  {
    operationId: "addGenreAlias", method: "post", path: "/api/genres/{id}/aliases",
    summary: "Add an alias without reassigning an existing alias",
    bodySchema: genreAliasBodySchema, successSchema: genreAliasResponseSchema,
  },
  {
    operationId: "mergeGenres", method: "post", path: "/api/genres/{id}/merge",
    summary: "Merge a genre into a survivor, moving children and aliases",
    bodySchema: genreMergeBodySchema, successSchema: genreMergeResponseSchema,
  },
] satisfies Array<Pick<ApiContractRoute, "operationId" | "method" | "path" | "summary" | "bodySchema" | "successSchema">>).map((operation): ApiContractRoute => {
  const hasId = operation.path.includes("{id}");
  const status = operation.operationId === "createGenre" || operation.operationId === "addGenreAlias" ? "201" : "200";
  return {
    ...operation, tags: ["Genres"], errorSchema: apiErrorSchema,
    paramsSchema: hasId ? genreParamsSchema : undefined,
    openapi: {
      parameters: hasId ? [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }] : [],
      requestBody: { required: true, content: { "application/json": {
        schema: genreBodyObjects[operation.operationId],
        example: operation.operationId === "createGenre" ? { name: "Cumbia Dub", parent_id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47" }
          : operation.operationId === "updateGenre" ? { name: "Cumbia Dub", parent_id: null }
          : operation.operationId === "addGenreAlias" ? { alias: "Cumbia-Dub" }
          : { target_id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47" },
      } } },
      responses: {
        [status]: { description: "Genre mutation succeeded", content: { "application/json": { schema: genreResponseObjects[operation.operationId] } } },
        ...Object.fromEntries([
          ["400", "Malformed request"], ["404", "Genre or parent not found"],
          ["409", "Name, slug, alias or tree conflict"], ["500", "Server error"],
        ].map(([code, description]) => [code, { description, content: { "application/json": { schema: errorResponseSchemaObject } } }])),
      },
    },
  };
});

// ─── Genre reconciliation (#372) ─────────────────────────────────────────────

const proposalActionEnum = { type: "string", enum: ["map", "new_genre", "descriptor", "drop"] };
const proposalMethodEnum = { type: "string", enum: ["exact", "ai", "manual"] };
const proposalStatusEnum = { type: "string", enum: ["pending", "accepted", "rejected", "edited"] };
const nullableUuid = { type: ["string", "null"], format: "uuid" };
const nullableString = { type: ["string", "null"] };
const dateTime = { type: "string", format: "date-time" };
const integer = { type: "integer" };

const genreReconciliationRunSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    id: genreUuid,
    status: { type: "string", enum: ["running", "completed", "failed"] },
    options: {
      type: "object",
      properties: {
        ai: { type: "boolean" }, new_genre_min_tracks: integer,
        limit: { type: ["integer", "null"] }, refresh: { type: "boolean" },
        friend_id: { type: ["integer", "null"], description: "The run's scope; null for every friend" },
      },
      required: ["ai", "new_genre_min_tracks", "limit", "refresh", "friend_id"],
    },
    model: nullableString,
    distinct_values: { ...integer, description: "Distinct normalised local_tags values" },
    exact_matches: { ...integer, description: "Values proposed by exact taxonomy name or alias match" },
    kept: { ...integer, description: "Values whose reviewed or pending proposal was kept" },
    ai_pending: { ...integer, description: "Values left for a later run (AI off, or over `limit`)" },
    ai_proposed: integer,
    ai_failed: integer,
    ai_batches: integer,
    input_tokens: integer,
    output_tokens: integer,
    cost_usd: { type: "number" },
    error: nullableString,
    started_at: dateTime,
    updated_at: dateTime,
    finished_at: { type: ["string", "null"], format: "date-time" },
  },
  required: [
    "id", "status", "options", "model", "distinct_values", "exact_matches", "kept", "ai_pending",
    "ai_proposed", "ai_failed", "ai_batches", "input_tokens", "output_tokens", "cost_usd", "error",
    "started_at", "updated_at", "finished_at",
  ],
};

const genreProposalSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    id: genreUuid,
    value_normalized: { type: "string" },
    raw_examples: { type: "array", items: { type: "string" } },
    track_count: integer,
    action: proposalActionEnum,
    target_genre_ids: { type: "array", items: genreUuid },
    target_genres: {
      type: "array",
      description: "Target genres that still exist, in order",
      items: {
        type: "object",
        properties: { id: genreUuid, name: { type: "string" }, parent_name: nullableString },
        required: ["id", "name", "parent_name"],
      },
    },
    proposed_genre_name: { ...nullableString, description: "For new_genre: the genre to create" },
    proposed_parent_id: nullableUuid,
    proposed_parent_name: nullableString,
    confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
    method: proposalMethodEnum,
    status: proposalStatusEnum,
    run_id: nullableUuid,
    created_genre_id: nullableUuid,
    applied_at: { type: ["string", "null"], format: "date-time" },
    created_at: dateTime,
    updated_at: dateTime,
  },
  required: [
    "id", "value_normalized", "raw_examples", "track_count", "action", "target_genre_ids",
    "target_genres", "proposed_genre_name", "proposed_parent_id", "proposed_parent_name",
    "confidence", "method", "status", "run_id", "created_genre_id", "applied_at", "created_at", "updated_at",
  ],
};

const genreProposalSnapshotSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    id: genreUuid, status: proposalStatusEnum, action: proposalActionEnum,
    target_genre_ids: { type: "array", items: genreUuid },
    proposed_genre_name: nullableString, proposed_parent_id: nullableUuid, method: proposalMethodEnum,
  },
  required: ["id", "status", "action", "target_genre_ids", "proposed_genre_name", "proposed_parent_id", "method"],
  additionalProperties: false,
};

const countsObject = (keys: string[]) => ({
  type: "object",
  properties: Object.fromEntries(keys.map((key) => [key, integer])),
  required: keys,
});

const genreReconciliationCoverageSchemaObject: Record<string, unknown> = {
  type: "object",
  properties: {
    tracks: {
      ...countsObject(["with_local_tags", "with_genres", "descriptors_only", "no_genre", "unresolved"]),
      description: "Every track with local_tags is in exactly one of the last four buckets",
    },
    values: {
      type: "object",
      properties: {
        distinct: integer, proposed: integer, exact: integer,
        exact_share: { type: "number", minimum: 0, maximum: 1 },
        by_status: countsObject(["pending", "accepted", "rejected", "edited"]),
        by_action: countsObject(["map", "new_genre", "descriptor", "drop"]),
      },
      required: ["distinct", "proposed", "exact", "exact_share", "by_status", "by_action"],
    },
  },
  required: ["tracks", "values"],
};

const reconciliationError = (description: string) => ({
  description,
  content: { "application/json": { schema: errorResponseSchemaObject } },
});
const reconciliationIdParam = { name: "id", in: "path", required: true, schema: genreUuid };

const genreReconciliationContracts: ApiContractRoute[] = [
  {
    operationId: "startGenreReconciliation",
    method: "post",
    path: "/api/genres/reconciliation/runs",
    summary: "Propose taxonomy mappings for local_tags values, in the background",
    tags: ["Genre Reconciliation"],
    bodySchema: genreReconciliationRunBodySchema,
    successSchema: genreReconciliationRunSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: false,
        content: { "application/json": { schema: {
          type: "object",
          properties: {
            ai: { type: "boolean", default: true, description: "false proposes exact matches only" },
            new_genre_min_tracks: { type: "integer", minimum: 1, default: 10, description: "Fewest tracks a value needs before the model may propose a new genre for it" },
            limit: { type: ["integer", "null"], minimum: 1, description: "Most values sent to the model this run" },
            refresh: { type: "boolean", default: false, description: "Re-ask the model for values with a pending AI proposal" },
            friend_id: { type: ["integer", "null"], minimum: 1, description: "Only this friend's tracks; omit or null for every friend. Proposals stay global, but their track counts then describe this scope." },
          },
          additionalProperties: false,
        } } },
      },
      responses: {
        "202": { description: "Started; poll GET /api/genres/reconciliation/runs/{id}", content: { "application/json": { schema: genreReconciliationRunSchemaObject } } },
        "400": reconciliationError("Invalid request"),
        "409": {
          description: "A run is already in progress; it is returned as `run`",
          content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" }, run: genreReconciliationRunSchemaObject }, required: ["error", "run"] } } },
        },
        "503": reconciliationError("AI requested but OPENAI_API_KEY is not set"),
      },
    },
  },
  {
    operationId: "getGenreReconciliationRun",
    method: "get",
    path: "/api/genres/reconciliation/runs/{id}",
    summary: "A reconciliation run's progress, counts and AI cost",
    tags: ["Genre Reconciliation"],
    paramsSchema: genreParamsSchema,
    successSchema: genreReconciliationRunSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [reconciliationIdParam],
      responses: {
        "200": { description: "The run", content: { "application/json": { schema: genreReconciliationRunSchemaObject } } },
        "400": reconciliationError("Invalid run ID"),
        "404": reconciliationError("No such run"),
      },
    },
  },
  {
    operationId: "getGenreReconciliationCoverage",
    method: "get",
    path: "/api/genres/reconciliation/coverage",
    summary: "How much of the local_tags backlog is reconciled, and the exact-match share",
    tags: ["Genre Reconciliation"],
    querySchema: genreReconciliationCoverageQuerySchema,
    successSchema: genreReconciliationCoverageSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "friend_id", in: "query", required: false, description: "Only this friend's tracks", schema: { type: "integer", minimum: 1 } },
      ],
      responses: {
        "200": { description: "Coverage", content: { "application/json": { schema: genreReconciliationCoverageSchemaObject } } },
        "400": reconciliationError("Invalid friend_id"),
      },
    },
  },
  {
    operationId: "listGenreProposals",
    method: "get",
    path: "/api/genres/proposals",
    summary: "Reconciliation proposals, most-used values first",
    tags: ["Genre Reconciliation"],
    querySchema: genreProposalListQuerySchema,
    successSchema: genreProposalListResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "status", in: "query", required: false, schema: proposalStatusEnum },
        { name: "action", in: "query", required: false, schema: proposalActionEnum },
        { name: "method", in: "query", required: false, schema: proposalMethodEnum },
        { name: "min_tracks", in: "query", required: false, description: "Only values on at least this many tracks, as counted by the latest run", schema: { type: "integer", minimum: 0 } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500, default: 50 } },
        { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, default: 0 } },
      ],
      responses: {
        "200": {
          description: "A page of proposals and the total matching",
          content: { "application/json": { schema: {
            type: "object",
            properties: { proposals: { type: "array", items: genreProposalSchemaObject }, total: integer },
            required: ["proposals", "total"],
          } } },
        },
        "400": reconciliationError("Invalid filter"),
      },
    },
  },
  {
    operationId: "updateGenreProposal",
    method: "patch",
    path: "/api/genres/proposals/{id}",
    summary: "Accept, reject or edit a reconciliation proposal",
    tags: ["Genre Reconciliation"],
    paramsSchema: genreParamsSchema,
    bodySchema: genreProposalUpdateBodySchema,
    successSchema: genreProposalSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [reconciliationIdParam],
      requestBody: {
        required: true,
        content: { "application/json": {
          schema: {
            type: "object",
            description: "Changing action, target_genres or the proposed genre marks the proposal `edited` (method `manual`), which apply treats like `accepted`.",
            properties: {
              status: proposalStatusEnum,
              action: proposalActionEnum,
              target_genres: { type: "array", maxItems: 10, items: { type: "string", minLength: 1 }, description: "Genre ids, or names resolved through the taxonomy's names and aliases" },
              proposed_genre_name: nullableString,
              proposed_parent_id: nullableUuid,
            },
            additionalProperties: false,
          },
          example: { action: "map", target_genres: ["Cumbia"] },
        } },
      },
      responses: {
        "200": { description: "The updated proposal", content: { "application/json": { schema: genreProposalSchemaObject } } },
        "400": reconciliationError("Invalid change, an unknown genre, or an incomplete map/new_genre proposal"),
        "404": reconciliationError("No such proposal"),
      },
    },
  },
  {
    operationId: "applyGenreProposals",
    method: "post",
    path: "/api/genres/proposals/apply",
    summary: "Write accepted and edited proposals to track genres, descriptors and aliases",
    tags: ["Genre Reconciliation"],
    bodySchema: genreProposalApplyBodySchema,
    successSchema: genreProposalApplyResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: false,
        content: { "application/json": { schema: {
          type: "object",
          properties: {
            ids: { type: "array", minItems: 1, items: genreUuid, description: "Only these proposals; all accepted and edited ones when omitted" },
            friend_id: { type: "integer", minimum: 1, description: "Only link this friend's tracks; aliases and created genres are global either way" },
          },
          additionalProperties: false,
        } } },
      },
      responses: {
        "200": {
          description: "What was written. Repeatable: a second apply adds only what is new.",
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              proposals_applied: integer, tracks_linked: integer, descriptors_added: integer,
              aliases_added: integer, genres_created: integer,
              skipped: { type: "array", items: { type: "object", properties: { id: genreUuid, value: { type: "string" }, reason: { type: "string" } }, required: ["id", "value", "reason"] } },
            },
            required: ["proposals_applied", "tracks_linked", "descriptors_added", "aliases_added", "genres_created", "skipped"],
          } } },
        },
        "400": reconciliationError("Invalid request"),
      },
    },
  },
  {
    operationId: "decideGenreProposals",
    method: "post",
    path: "/api/genres/proposals/decisions",
    summary: "Record several review decisions in one transaction",
    tags: ["Genre Reconciliation"],
    bodySchema: genreProposalDecisionsBodySchema,
    successSchema: genreProposalDecisionsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: { "application/json": {
          schema: {
            type: "object",
            properties: {
              decisions: {
                type: "array", minItems: 1, maxItems: 500,
                description: "Each is a PATCH /api/genres/proposals/{id} body plus the id. All or none are written.",
                items: {
                  type: "object",
                  properties: {
                    id: genreUuid, status: proposalStatusEnum, action: proposalActionEnum,
                    target_genres: { type: "array", maxItems: 10, items: { type: "string", minLength: 1 } },
                    proposed_genre_name: nullableString, proposed_parent_id: nullableUuid,
                  },
                  required: ["id"],
                  additionalProperties: false,
                },
              },
            },
            required: ["decisions"],
            additionalProperties: false,
          },
          example: { decisions: [{ id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47", status: "accepted" }] },
        } },
      },
      responses: {
        "200": {
          description: "Each proposal after the decision, and its state before for undo",
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              proposals: { type: "array", items: genreProposalSchemaObject },
              previous: { type: "array", items: genreProposalSnapshotSchemaObject },
            },
            required: ["proposals", "previous"],
          } } },
        },
        "400": reconciliationError("Invalid decision, an unknown genre, or an incomplete map/new_genre proposal; nothing written"),
        "404": reconciliationError("A proposal does not exist; nothing written"),
      },
    },
  },
  {
    operationId: "restoreGenreProposals",
    method: "post",
    path: "/api/genres/proposals/restore",
    summary: "Undo review decisions by restoring proposal snapshots",
    tags: ["Genre Reconciliation"],
    bodySchema: genreProposalRestoreBodySchema,
    successSchema: genreProposalRestoreResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: { "application/json": { schema: {
          type: "object",
          properties: { snapshots: { type: "array", minItems: 1, maxItems: 500, items: genreProposalSnapshotSchemaObject, description: "`previous` from a decisions response" } },
          required: ["snapshots"],
          additionalProperties: false,
        } } },
      },
      responses: {
        "200": { description: "How many proposals still existed and were restored", content: { "application/json": { schema: { type: "object", properties: { restored: integer }, required: ["restored"] } } } },
        "400": reconciliationError("Invalid snapshots"),
      },
    },
  },
  {
    operationId: "listGenreProposalTracks",
    method: "get",
    path: "/api/genres/proposals/{id}/tracks",
    summary: "A few tracks tagged with a proposal's value, for review",
    tags: ["Genre Reconciliation"],
    paramsSchema: genreParamsSchema,
    querySchema: genreProposalTracksQuerySchema,
    successSchema: genreProposalTracksResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        reconciliationIdParam,
        { name: "friend_id", in: "query", required: false, description: "Only this friend's tracks", schema: { type: "integer", minimum: 1 } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 20, default: 3 } },
      ],
      responses: {
        "200": {
          description: "Tracks whose local_tags contain the value",
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              tracks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    track_id: { type: "string" }, friend_id: integer, title: { type: "string" },
                    artist: { type: "string" }, album: nullableString,
                    styles: { type: "array", items: { type: "string" }, description: "The album's Discogs styles" },
                  },
                  required: ["track_id", "friend_id", "title", "artist", "album", "styles"],
                },
              },
            },
            required: ["tracks"],
          } } },
        },
        "400": reconciliationError("Invalid ID or query"),
        "404": reconciliationError("No such proposal"),
      },
    },
  },
];

/** `/api/tracks/search`'s query parameters, shared with its genre facets. */
const trackSearchParameters: Record<string, unknown>[] = [
  { name: "q", in: "query", required: false, schema: { type: "string" } },
  { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
  { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
  { name: "friend_id", in: "query", required: false, schema: { type: "integer" } },
  {
    name: "filter",
    in: "query",
    required: false,
    schema: {
      type: "string",
      description: "SQL-style filter expression. Multiple conditions joined with ' AND '. Supported values: 'local_audio_url IS NULL' (missing audio), '(bpm IS NULL OR key IS NULL)' (missing metadata), 'apple_music_url IS NULL' (missing Apple Music), 'youtube_url IS NULL' (missing YouTube), 'soundcloud_url IS NULL' (missing SoundCloud), '(apple_music_url IS NULL AND youtube_url IS NULL AND soundcloud_url IS NULL)' (missing all streaming URLs).",
    },
  },
  {
    name: "mode",
    in: "query",
    required: false,
    schema: { type: "string", enum: ["lexical", "semantic", "hybrid"], default: "lexical" },
    description:
      "'lexical' is full-text + trigram. 'semantic' ranks by the natural-language 'context' embedding of q; 'hybrid' fuses both with reciprocal rank fusion, exact title/artist/album matches first. Semantic and hybrid return a single page (offset 0, limit at most 50), at most three tracks per release, and honour friend_id and filter. With an empty q every mode lists lexically.",
  },
  { name: "bpm_min", in: "query", required: false, schema: { type: "number" }, description: "Minimum BPM, inclusive. Applied in every mode." },
  { name: "bpm_max", in: "query", required: false, schema: { type: "number" }, description: "Maximum BPM, inclusive. Must not be below bpm_min." },
  { name: "key", in: "query", required: false, schema: { type: "string" }, description: "Exact musical key, case-insensitive (e.g. 'A minor'). Enharmonic spellings are not merged." },
  { name: "star_rating", in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 5 }, description: "Minimum star rating." },
  {
    name: "genre",
    in: "query",
    required: false,
    style: "form",
    explode: true,
    schema: { type: "array", items: { type: "string" }, maxItems: 20 },
    description:
      "Genre slug, id or name (a name resolves through aliases); repeat for several, which combine with OR. Each includes its subgenres, so 'latin' finds 'cumbia'. A track with genres of its own matches on those; one without falls back to its album's Discogs genres and styles. Applied in every mode. An unknown genre is a 400."
  },
];

export const apiContractRoutes: ApiContractRoute[] = [
  ...genreMutationContracts,
  ...genreReconciliationContracts,
  {
    operationId: "listGenres",
    method: "get",
    path: "/api/genres",
    summary: "Canonical genre taxonomy tree",
    tags: ["Genres"],
    successSchema: genreTreeResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Genre roots with recursively nested children",
          content: {
            "application/json": {
              example: { genres: [{
                id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47", name: "Latin", slug: "latin",
                parent_id: null, source: "discogs", track_count: 0, album_count: 0, children: [],
              }] },
              schema: {
                type: "object",
                properties: {
                  genres: {
                    type: "array",
                    items: { $ref: "#/components/schemas/GenreTreeNode" },
                  },
                },
                required: ["genres"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getGenre",
    method: "get",
    path: "/api/genres/{id}",
    summary: "One genre's page: lineage, subgenres, counts and top tracks and albums",
    tags: ["Genres"],
    querySchema: genrePageQuerySchema,
    successSchema: genrePageResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "Genre slug or id",
          schema: { type: "string" },
        },
        {
          name: "friend_id",
          in: "query",
          required: false,
          description: "Scope counts and lists to one collection",
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description:
            "The genre. Counts and lists use the search genre filter, so they match what searching the genre returns",
          content: {
            "application/json": {
              schema: genrePageSchemaObject,
              example: {
                genre: {
                  id: "8c1d7f3e-2b6a-4d59-9f0e-3a7b5c2d1e40", name: "Cumbia", slug: "cumbia",
                  parent_id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47", source: "discogs", aliases: ["cumbia colombiana"],
                },
                ancestors: [{ id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47", name: "Latin", slug: "latin" }],
                children: [],
                related: [{ id: "1f6a2c9d-4e8b-4a3f-b7d1-5c0e9a8b7f62", name: "Salsa", slug: "salsa", track_count: 253 }],
                counts: { tracks: 412, albums: 108, tracks_total: 1029, albums_total: 108 },
                top_tracks: [{
                  track_id: "33415451-A1", friend_id: 6, title: "La Danza De Los Mirlos", artist: "Los Mirlos",
                  album: "La Danza De Los Mirlos", play_count: 4,
                }],
                top_albums: [{
                  release_id: "33415451", friend_id: 6, title: "La Danza De Los Mirlos", artist: "Los Mirlos",
                  play_count: 12,
                }],
              },
            },
          },
        },
        "400": {
          description: "Invalid friend_id",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "No genre has that slug or id",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "listFriends",
    method: "get",
    path: "/api/friends",
    summary: "List friends/libraries",
    tags: ["Friends"],
    querySchema: friendsListQuerySchema,
    successSchema: friendsListResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "showCurrentUser",
          in: "query",
          required: false,
          schema: { type: "boolean" },
        },
      ],
      responses: {
        "200": {
          description: "Friends list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        username: { type: "string" },
                      },
                      required: ["id", "username"],
                    },
                  },
                },
                required: ["results"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "addFriend",
    method: "post",
    path: "/api/friends",
    summary: "Add a friend/library by username",
    tags: ["Friends"],
    bodySchema: friendMutationBodySchema,
    successSchema: friendMutationResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                username: { type: "string" },
              },
              required: ["username"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Friend added",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
                required: ["message"],
              },
            },
          },
        },
        "400": {
          description: "Invalid username",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "removeFriend",
    method: "delete",
    path: "/api/friends",
    summary: "Remove a friend/library (streaming text progress)",
    tags: ["Friends"],
    querySchema: friendDeleteQuerySchema,
    successSchema: z.string(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "username",
          in: "query",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Progress stream",
          content: {
            "text/plain": {
              schema: { type: "string" },
            },
          },
        },
        "400": {
          description: "Invalid username",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "listJobs",
    method: "get",
    path: "/api/jobs",
    summary: "List background jobs",
    tags: ["Jobs"],
    querySchema: jobsListQuerySchema,
    successSchema: jobsListResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 500, default: 100 },
        },
        {
          name: "offset",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 0, default: 0 },
        },
        {
          name: "state",
          in: "query",
          required: false,
          schema: {
            type: "string",
            enum: ["all", "waiting", "active", "completed", "failed"],
            default: "all",
          },
        },
      ],
      responses: {
        "200": {
          description: "Jobs list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  jobs: { type: "array", items: { type: "object", additionalProperties: true } },
                  summary: {
                    type: "object",
                    properties: {
                      total: { type: "integer" },
                      waiting: { type: "integer" },
                      active: { type: "integer" },
                      completed: { type: "integer" },
                      failed: { type: "integer" },
                    },
                    required: ["total", "waiting", "active", "completed", "failed"],
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      limit: { type: "integer" },
                      offset: { type: "integer" },
                      total_filtered: { type: "integer" },
                      has_more: { type: "boolean" },
                    },
                    required: ["limit", "offset", "total_filtered", "has_more"],
                  },
                },
                required: ["jobs", "summary"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "clearAllJobs",
    method: "delete",
    path: "/api/jobs",
    summary: "Clear all queued and indexed jobs",
    tags: ["Jobs"],
    successSchema: jobsClearResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Jobs cleared",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                },
                required: ["success", "message"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getJobById",
    method: "get",
    path: "/api/jobs/{jobId}",
    summary: "Get a single job status by id",
    tags: ["Jobs"],
    successSchema: jobDetailsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "jobId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Job details",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "string", example: "job_8f21c4" },
                  name: { type: "string", example: "download-audio" },
                  state: {
                    type: "string",
                    // The handler maps queued -> waiting and processing ->
                    // active before returning; these are the only values.
                    enum: ["waiting", "active", "completed", "failed"],
                    example: "completed",
                  },
                  queue: {
                    type: "string",
                    description: "Always \"download\"; this API exposes one queue.",
                    example: "download",
                  },
                  data: {
                    type: "object",
                    description: "The job payload. Extra keys vary by job_type.",
                    properties: {
                      track_id: { type: "string", example: "trk_001" },
                      friend_id: { type: "integer", example: 1 },
                      release_id: { type: "string", example: "rel_4471" },
                      job_type: { type: "string", example: "download-audio" },
                      downloader: { type: "string", example: "gamdl" },
                      source_url_key: { type: "string", example: "apple_music_url" },
                    },
                    additionalProperties: true,
                  },
                  progress: { type: "number", example: 100 },
                  returnvalue: {
                    type: ["object", "array", "string", "number", "boolean", "null"],
                    example: { local_audio_url: "/audio/trk_001.m4a" },
                  },
                  finishedOn: {
                    type: "number",
                    description: "Epoch milliseconds.",
                    example: 1771329678000,
                  },
                  processedOn: {
                    type: "number",
                    description: "Epoch milliseconds.",
                    example: 1771329604000,
                  },
                  failedReason: { type: "string", example: "gamdl error: Track not found on Apple Music" },
                  attemptsMade: { type: "integer", example: 1 },
                  delay: { type: "number", example: 0 },
                  timestamp: {
                    type: "number",
                    description: "Epoch milliseconds when the job was enqueued.",
                    example: 1771329600000,
                  },
                  opts: { type: "object", additionalProperties: true },
                  logs: { type: "array", items: { type: "object", additionalProperties: true } },
                },
                required: ["id", "name", "state", "queue", "data", "progress", "attemptsMade"],
              },
            },
          },
        },
        "400": {
          description: "Missing job id",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "Job not found",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "reportJobOutcome",
    method: "post",
    path: "/api/jobs/{jobId}/outcome",
    summary: "download-worker announcing that a job has ended, for analytics",
    tags: ["Jobs"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    // No body: the job's record in Redis is authoritative (#345).
    openapi: {
      parameters: buildPathParameters("/api/jobs/{jobId}/outcome"),
      responses: {
        "200": {
          description: "Whether this call recorded the outcome",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reported: {
                    type: "boolean",
                    description:
                      "False for a job already reported, or one that downloaded nothing.",
                    example: true,
                  },
                },
              },
            },
          },
        },
        "404": jsonError("No such job"),
        "409": jsonError("The job has not finished"),
      },
    },
  },
  {
    operationId: "streamJobEvents",
    method: "get",
    path: "/api/jobs/events",
    summary: "Stream real-time job completion/error events (SSE)",
    tags: ["Jobs"],
    successSchema: jobsEventsSseResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description:
            "Server-sent events stream used by the UI to react to completed/failed jobs without polling. Initial event data is `connected`.",
          content: {
            "text/event-stream": {
              schema: {
                type: "string",
                example:
                  "data: connected\\n\\ndata: {\"type\":\"job_completed\",\"job_id\":\"123\",\"track_id\":\"abc\",\"friend_id\":1,\"timestamp\":1710000000000}\\n\\n",
              },
            },
          },
        },
      },
    },
  },
  {
    operationId: "uploadGamdlCookieFile",
    method: "put",
    path: "/api/settings/gamdl-cookies",
    summary: "Upload or replace GAMDL cookie file",
    tags: ["Settings"],
    successSchema: gamdlCookieUploadResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                cookieFile: { type: "string", format: "binary" },
              },
              required: ["cookieFile"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Cookie file uploaded",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  cookieInfo: { type: "object", additionalProperties: true },
                },
                required: ["success", "message", "cookieInfo"],
              },
            },
          },
        },
        "400": {
          description: "Invalid cookie upload",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "runGamdlAction",
    method: "post",
    path: "/api/settings/gamdl/actions",
    summary: "Run GAMDL action (cookie_status, delete_cookie, test_connection, reset_settings)",
    tags: ["Settings"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: [
                    "cookie_status",
                    "delete_cookie",
                    "test_connection",
                    "reset_settings",
                  ],
                },
                friend_id: { type: "integer" },
              },
              required: ["action"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Action result",
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        "400": {
          description: "Invalid action payload",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Action execution failed",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getGamdlSettings",
    method: "get",
    path: "/api/settings/gamdl",
    summary: "Get GAMDL settings for a friend",
    tags: ["Settings"],
    querySchema: gamdlSettingsQuerySchema,
    successSchema: gamdlSettingsGetResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "friend_id",
          in: "query",
          required: true,
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "GAMDL settings",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  settings: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      friend_id: { type: "integer" },
                      audio_quality: {
                        type: "string",
                        // Mirrors gamdlAudioQualitySchema; the OpenAPI copy had
                        // lost the enum and rendered as a bare string.
                        enum: ["best", "high", "standard", "lossless"],
                      },
                      audio_format: { type: "string" },
                      save_cover: { type: "boolean" },
                      cover_format: { type: "string" },
                      save_lyrics: { type: "boolean" },
                      lyrics_format: { type: "string" },
                      overwrite_existing: { type: "boolean" },
                      skip_music_videos: { type: "boolean" },
                      max_retries: { type: "integer" },
                      created_at: { type: "string" },
                      updated_at: { type: "string" },
                    },
                    required: [
                      "id",
                      "friend_id",
                      "audio_quality",
                      "audio_format",
                      "save_cover",
                      "cover_format",
                      "save_lyrics",
                      "lyrics_format",
                      "overwrite_existing",
                      "skip_music_videos",
                      "max_retries",
                      "created_at",
                      "updated_at",
                    ],
                  },
                },
                required: ["settings"],
              },
            },
          },
        },
        "400": {
          description: "Missing or invalid friend_id",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "updateGamdlSettings",
    method: "put",
    path: "/api/settings/gamdl",
    summary: "Update GAMDL settings for a friend",
    tags: ["Settings"],
    bodySchema: gamdlSettingsPutBodySchema,
    successSchema: gamdlSettingsPutResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                friend_id: { type: "integer" },
                audio_quality: {
                        type: "string",
                        // Mirrors gamdlAudioQualitySchema; the OpenAPI copy had
                        // lost the enum and rendered as a bare string.
                        enum: ["best", "high", "standard", "lossless"],
                      },
                audio_format: { type: "string" },
                save_cover: { type: "boolean" },
                cover_format: { type: "string" },
                save_lyrics: { type: "boolean" },
                lyrics_format: { type: "string" },
                overwrite_existing: { type: "boolean" },
                skip_music_videos: { type: "boolean" },
                max_retries: { type: "integer" },
              },
              required: ["friend_id"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "GAMDL settings updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  settings: { type: "object", additionalProperties: true },
                },
                required: ["success", "message", "settings"],
              },
            },
          },
        },
        "400": {
          description: "Invalid update payload",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getBackupStatus",
    method: "get",
    path: "/api/settings/backup/status",
    summary: "Get last remote backup run status",
    tags: ["Settings"],
    successSchema: backupStatusGetResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Last known backup status",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: {
                    anyOf: [
                      {
                        type: "object",
                        properties: {
                          started_at: { type: "string" },
                          finished_at: { type: "string" },
                          stored_at: { type: "string" },
                          status: {
                            type: "string",
                            enum: ["success", "failed", "skipped"],
                          },
                          reason: {
                            type: "string",
                            example: "no_changes_since_last_snapshot",
                          },
                          backed_up_paths: {
                            type: "array",
                            items: { type: "string" },
                          },
                          snapshot: {
                            anyOf: [
                              {
                                type: "object",
                                properties: {
                                  id: {
                                    type: "string",
                                    example: "9f2a1c4e8b7d6035a1c2e4f6089badc1",
                                  },
                                  short_id: {
                                    type: "string",
                                    nullable: true,
                                    example: "9f2a1c4e",
                                  },
                                  time: {
                                    type: "string",
                                    format: "date-time",
                                    example: "2026-02-17T03:00:00.000Z",
                                  },
                                  hostname: {
                                    type: "string",
                                    nullable: true,
                                    example: "beelink",
                                  },
                                  paths: {
                                    type: "array",
                                    items: { type: "string", example: "/srv/docker/groovenet" },
                                  },
                                  tags: {
                                    type: "array",
                                    items: { type: "string", example: "groovenet-db" },
                                  },
                                },
                                required: [
                                  "id",
                                  "short_id",
                                  "time",
                                  "hostname",
                                  "paths",
                                  "tags",
                                ],
                              },
                              { type: "null" },
                            ],
                          },
                          error: { type: "string" },
                          missing_env: {
                            type: "array",
                            items: { type: "string", example: "RESTIC_PASSWORD" },
                          },
                        },
                        required: [
                          "started_at",
                          "finished_at",
                          "stored_at",
                          "status",
                          "reason",
                          "backed_up_paths",
                          "snapshot",
                        ],
                      },
                      { type: "null" },
                    ],
                  },
                },
                required: ["status"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getBackupPolicy",
    method: "get",
    path: "/api/settings/backup",
    summary: "Get backup policy settings",
    tags: ["Settings"],
    successSchema: backupPolicyGetResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Backup policy",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  policy: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      provider: { type: "string", enum: ["restic-b2"] },
                      schedule_cron: { type: "string" },
                      retention_preset: {
                        type: "string",
                        enum: ["aggressive", "balanced", "archive"],
                      },
                      include_database: { type: "boolean" },
                      include_audio_files: { type: "boolean" },
                      include_album_covers: { type: "boolean" },
                      include_discogs_exports: { type: "boolean" },
                      include_essentia_files: { type: "boolean" },
                      include_uploads: { type: "boolean" },
                      updated_at: { type: "string" },
                    },
                    required: [
                      "enabled",
                      "provider",
                      "schedule_cron",
                      "retention_preset",
                      "include_database",
                      "include_audio_files",
                      "include_album_covers",
                      "include_discogs_exports",
                      "include_essentia_files",
                      "include_uploads",
                      "updated_at",
                    ],
                  },
                },
                required: ["policy"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "updateBackupPolicy",
    method: "put",
    path: "/api/settings/backup",
    summary: "Update backup policy settings",
    tags: ["Settings"],
    bodySchema: backupPolicyPutBodySchema,
    successSchema: backupPolicyPutResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                enabled: { type: "boolean" },
                provider: { type: "string", enum: ["restic-b2"] },
                schedule_cron: { type: "string" },
                retention_preset: {
                  type: "string",
                  enum: ["aggressive", "balanced", "archive"],
                },
                include_database: { type: "boolean" },
                include_audio_files: { type: "boolean" },
                include_album_covers: { type: "boolean" },
                include_discogs_exports: { type: "boolean" },
                include_essentia_files: { type: "boolean" },
                include_uploads: { type: "boolean" },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Backup policy updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  policy: { type: "object", additionalProperties: true },
                },
                required: ["success", "message", "policy"],
              },
            },
          },
        },
        "400": {
          description: "Invalid backup policy payload",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "createDatabaseBackup",
    method: "post",
    path: "/api/backup",
    summary: "Create database backup (pg_dump custom format)",
    tags: ["Backup"],
    successSchema: backupCreateResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Backup created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  filename: { type: "string" },
                  format: { type: "string", enum: ["custom"] },
                },
                required: ["message", "filename", "format"],
              },
            },
          },
        },
        "500": {
          description: "Backup creation failed",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "createDatabaseBackupCustom",
    method: "post",
    path: "/api/backup-custom",
    summary: "Create database backup (deprecated alias of /api/backup)",
    tags: ["Backup"],
    successSchema: backupCreateCustomResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Custom backup created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  filename: { type: "string" },
                  format: { type: "string", enum: ["custom"] },
                },
                required: ["message", "filename", "format"],
              },
            },
          },
        },
        "500": {
          description: "Backup creation failed",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "streamAudioFile",
    method: "get",
    path: "/api/audio",
    summary: "Stream local audio file for browser playback",
    tags: ["Audio"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "filename",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Local audio filename or relative path stored in `local_audio_url`.",
        },
        {
          name: "range",
          in: "header",
          required: false,
          schema: { type: "string" },
          description: "Optional byte range header for seeking (example: `bytes=0-1023`).",
        },
      ],
      responses: {
        "200": {
          description: "Full audio stream",
          content: {
            "audio/mpeg": { schema: { type: "string", format: "binary" } },
            "audio/mp4": { schema: { type: "string", format: "binary" } },
            "audio/wav": { schema: { type: "string", format: "binary" } },
          },
        },
        "206": {
          description: "Partial audio stream (range request)",
          content: {
            "audio/mpeg": { schema: { type: "string", format: "binary" } },
            "audio/mp4": { schema: { type: "string", format: "binary" } },
            "audio/wav": { schema: { type: "string", format: "binary" } },
          },
        },
        "400": {
          description: "Missing filename parameter",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Audio file not found",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "416": {
          description: "Invalid range request",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "listPlaylists",
    method: "get",
    path: "/api/playlists",
    summary: "List playlists",
    tags: ["Playlists"],
    successSchema: z.array(playlistSchema),
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Playlists fetched",
          content: {
            "application/json": {
              schema: { type: "array", items: playlistObjectSchema },
              examples: {
                playlistsList: {
                  summary: "Playlists list",
                  value: playlistsListExample,
                },
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "createPlaylist",
    method: "post",
    path: "/api/playlists",
    summary: "Create playlist",
    tags: ["Playlists"],
    bodySchema: playlistCreateBodySchema,
    successSchema: playlistSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                tracks: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                default_friend_id: { type: "integer" },
              },
              required: ["name"],
              additionalProperties: true,
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Playlist created",
          content: {
            "application/json": { schema: playlistObjectSchema },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "updatePlaylist",
    method: "patch",
    path: "/api/playlists",
    summary: "Update playlist",
    tags: ["Playlists"],
    bodySchema: playlistPatchBodySchema,
    successSchema: playlistSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                id: { type: "integer" },
                name: { type: "string" },
                tracks: {
                  type: "array",
                  items: {
                    oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
                  },
                },
                default_friend_id: { type: "integer" },
              },
              required: ["id"],
              additionalProperties: true,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Playlist updated",
          content: {
            "application/json": { schema: playlistObjectSchema },
          },
        },
        "400": {
          description: "Validation error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Playlist not found",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "deletePlaylist",
    method: "delete",
    path: "/api/playlists",
    summary: "Delete playlist",
    tags: ["Playlists"],
    querySchema: playlistDeleteQuerySchema,
    successSchema: z.object({ success: z.boolean() }),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "id",
          in: "query",
          required: true,
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "Playlist deleted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { success: { type: "boolean" } },
                required: ["success"],
              },
            },
          },
        },
        "400": {
          description: "Missing id",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Playlist not found",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "getPlaylistTracks",
    method: "get",
    path: "/api/playlists/{id}/tracks",
    summary: "Get playlist detail",
    tags: ["Playlists"],
    paramsSchema: playlistDetailParamsSchema,
    successSchema: playlistDetailResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "Playlist detail",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  playlist_id: { type: "integer" },
                  playlist_name: { type: ["string", "null"] },
                  tracks: { type: "array", items: playlistTrackObjectSchema },
                },
                required: ["playlist_id", "tracks"],
                additionalProperties: true,
              },
              examples: {
                playlistDetail: {
                  summary: "Playlist detail",
                  value: playlistDetailExample,
                },
              },
            },
          },
        },
        "400": {
          description: "Invalid id",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Not found",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "logPlaylistSpins",
    method: "post",
    path: "/api/playlists/{id}/spins",
    summary: "Log every played playlist entry as a spin",
    tags: ["Playlists", "Spins"],
    paramsSchema: playlistDetailParamsSchema,
    bodySchema: playlistSpinsBodySchema,
    successSchema: playlistSpinsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                performed_at: { type: "string", format: "date-time", description: "Use when the playlist has no live-set performance" },
                performance_id: { type: "integer", description: "A performance belonging to this playlist; latest performance is used by default" },
                derivation_id: { type: "string", format: "uuid", description: "Use matched offsets and omit entries marked not played" },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": { description: "Playlist spins logged (or skipped when already present)", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
        "400": { description: "Invalid timestamp, derivation, or playlist contents", content: { "application/json": { schema: errorResponseSchemaObject } } },
        "404": { description: "Playlist or performance not found", content: { "application/json": { schema: errorResponseSchemaObject } } },
      },
    },
  },
  ...(["get", "post", "put", "delete"] as const).map((method) => ({
    operationId: `${method}PlaylistSet`,
    method,
    path: "/api/playlists/{id}/set",
    summary: `${method === "get" ? "Get" : method === "post" ? "Create" : method === "put" ? "Update" : "Remove"} a playlist set`,
    tags: ["Playlists", "Sets"],
    paramsSchema: playlistDetailParamsSchema,
    bodySchema: method === "put" ? z.object({}).passthrough() : undefined,
    successSchema: z.object({}).passthrough(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      ...(method === "put" ? { requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } } } : {}),
      responses: {
        "200": { description: "Set operation completed", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
        "404": { description: "Playlist or set not found", content: { "application/json": { schema: errorResponseSchemaObject } } },
      },
    },
  })),
  {
    operationId: "generateGeneticPlaylist",
    method: "post",
    path: "/api/playlists/genetic",
    summary: "Generate optimized ordering for playlist tracks",
    tags: ["Playlists"],
    bodySchema: playlistGeneticBodySchema,
    successSchema: playlistGeneticResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                playlist: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      track_id: { type: "string" },
                      friend_id: { type: "integer" },
                      bpm: { type: ["number", "string", "null"] },
                    },
                    required: ["track_id"],
                    additionalProperties: true,
                  },
                  minItems: 1,
                },
                mode: {
                  type: "string",
                  enum: ["genetic", "greedy", "cohesive_blocks"],
                  default: "genetic",
                  example: "cohesive_blocks",
                  description:
                    "Optimizer mode. cohesive_blocks favors genre/vibe blocks and fade-friendly transitions.",
                },
              },
              required: ["playlist"],
              additionalProperties: false,
            },
            examples: {
              geneticRequest: {
                summary: "Three tracks, each supplying its embedding differently",
                value: playlistGeneticRequestExample,
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Genetic ordering result",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  mode: {
                    type: "string",
                    enum: ["genetic", "greedy", "cohesive_blocks"],
                    example: "cohesive_blocks",
                  },
                  result: {
                    oneOf: [
                      {
                        type: "array",
                        items: { type: "object", additionalProperties: true },
                      },
                      {
                        type: "object",
                        additionalProperties: { type: "object", additionalProperties: true },
                      },
                    ],
                  },
                },
                required: ["result"],
                additionalProperties: true,
              },
            },
          },
        },
        "400": {
          description: "Invalid track data for optimization",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: { type: "string" },
                  invalid: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        track_id: { type: "string" },
                        reason: { type: "string" },
                      },
                      required: ["reason"],
                      additionalProperties: false,
                    },
                  },
                  invalid_count: { type: "integer" },
                },
                required: ["error", "invalid", "invalid_count"],
                additionalProperties: true,
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "searchTrackGenreFacets",
    method: "get",
    path: "/api/tracks/search/facets",
    summary: "Genre counts for a keyword track search",
    tags: ["Tracks"],
    querySchema: trackSearchGetQuerySchema,
    successSchema: trackGenreFacetsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: trackSearchParameters.filter(
        (parameter) => !["limit", "offset", "genre"].includes(parameter.name as string)
      ),
      responses: {
        "200": {
          description:
            "Per genre, the tracks adding that genre to the search would return: subgenres included, each track once, largest first. Takes /api/tracks/search's parameters; `genre`, `limit` and `offset` are ignored, so picking a genre leaves the others' counts in view. Genres with no tracks are omitted. Keyword search only: semantic or hybrid with words is a 400.",
          content: {
            "application/json": {
              example: { genres: [{ id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47", track_count: 113 }] },
              schema: {
                type: "object",
                properties: {
                  genres: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", format: "uuid" },
                        track_count: { type: "integer" },
                      },
                      required: ["id", "track_count"],
                    },
                  },
                },
                required: ["genres"],
              },
            },
          },
        },
        "400": {
          description: "Invalid parameters, or a semantic/hybrid query",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "searchTracksQuery",
    method: "get",
    path: "/api/tracks/search",
    summary: "Search tracks (query params)",
    tags: ["Tracks"],
    querySchema: trackSearchGetQuerySchema,
    successSchema: trackSearchGetResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: trackSearchParameters,
      responses: {
        "200": {
          description: "Search results",
          content: {
            "application/json": {
              schema: {
                ...trackSearchResponseBase,
                properties: {
                  ...(trackSearchResponseBase.properties as Record<string, unknown>),
                  hits: { type: "array", items: trackEntitySchemaObject },
                  mode: {
                    type: "string",
                    enum: ["lexical", "semantic", "hybrid"],
                    description: "The mode that ranked hits; omitted for a plain lexical request.",
                  },
                  degraded: {
                    type: "boolean",
                    description: "Hybrid fell back to lexical results because the semantic leg failed.",
                  },
                },
                required: [...(trackSearchResponseBase.required as string[]), "hits"],
              },
              examples: {
                trackSearch: {
                  summary: "Track search",
                  value: trackSearchGetExample,
                },
              },
            },
          },
        },
        "429": {
          description: "Too many semantic searches from this caller; see Retry-After",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Search error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "recommendationCandidates",
    method: "get",
    path: "/api/recommendations/candidates",
    summary: "Get recommendation candidates (combined, identity-only, or audio-only)",
    tags: ["Recommendations"],
    querySchema: recommendationsQuerySchema,
    successSchema: recommendationsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "track_id",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Seed track identifier.",
        },
        {
          name: "friend_id",
          in: "query",
          required: true,
          schema: { type: "integer" },
          description: "Library owner id for the seed track.",
        },
        {
          name: "mode",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["combined", "identity", "audio"], default: "combined" },
          description: "Select retrieval mode. `combined` unions both embeddings, `identity` only identity embedding, `audio` only audio vibe embedding.",
        },
        {
          name: "limit_identity",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 0, maximum: 1000, default: 200 },
          description: "Maximum candidates from identity embedding search. Ignored when `mode=audio`.",
        },
        {
          name: "limit_audio",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 0, maximum: 1000, default: 200 },
          description: "Maximum candidates from audio vibe embedding search. Ignored when `mode=identity`.",
        },
        {
          name: "ivfflat_probes",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 1000, default: 10 },
          description: "pgvector ivfflat probes setting; higher is more accurate and slower.",
        },
        {
          name: "scope",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["library", "all"] },
          description:
            "`library` returns candidates only from `library_friend_id`'s library; `all` searches every library. Omitted, the library's saved setting applies (default `library`; see `/api/settings/recommendations`).",
        },
        {
          name: "library_friend_id",
          in: "query",
          required: false,
          schema: { type: "integer" },
          description: "The library `scope=library` keeps to, and whose saved setting applies. Defaults to `friend_id`.",
        },
      ],
      responses: {
        "200": {
          description: "Recommendation candidates",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  seedTrackId: { type: "string" },
                  seedFriendId: { type: "integer" },
                  seedEmbeddings: {
                    type: "object",
                    properties: {
                      identity: { type: "boolean" },
                      audio: { type: "boolean" },
                    },
                    required: ["identity", "audio"],
                  },
                  scope: {
                    type: "string",
                    enum: ["library", "all"],
                    description: "The scope these candidates came from, after applying the saved setting.",
                  },
                  libraryFriendId: {
                    type: ["integer", "null"],
                    description: "The library candidates were limited to; null when every library was searched.",
                  },
                  candidates: { type: "array", items: recommendationCandidateSchemaObject },
                  stats: { type: "object", additionalProperties: true },
                },
                required: ["seedTrackId", "seedFriendId", "seedEmbeddings", "scope", "libraryFriendId", "candidates", "stats"],
                additionalProperties: true,
              },
              examples: {
                recommendationCandidates: {
                  summary: "Combined mode",
                  value: recommendationsExample,
                },
                recommendationCandidatesIdentityOnly: {
                  summary: "Identity-only mode",
                  value: {
                    ...recommendationsExample,
                    seedEmbeddings: { identity: true, audio: false },
                    candidates: recommendationsExample.candidates.map((candidate) => ({
                      ...candidate,
                      simAudio: null,
                    })),
                  },
                },
                recommendationCandidatesAudioOnly: {
                  summary: "Audio-only mode",
                  value: {
                    ...recommendationsExample,
                    seedEmbeddings: { identity: false, audio: true },
                    candidates: recommendationsExample.candidates.map((candidate) => ({
                      ...candidate,
                      simIdentity: null,
                    })),
                  },
                },
              },
            },
          },
        },
        "400": {
          description: "Invalid query (missing/invalid parameters or out-of-range limits)",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Seed embeddings missing",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "recommendationCandidatesBatch",
    method: "post",
    path: "/api/recommendations/candidates",
    summary: "Get recommendation candidates from multiple seed tracks",
    tags: ["Recommendations"],
    bodySchema: recommendationsBatchBodySchema,
    successSchema: recommendationsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                tracks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      track_id: { type: "string" },
                      friend_id: { type: "integer" },
                    },
                    required: ["track_id", "friend_id"],
                  },
                  minItems: 1,
                  maxItems: 100,
                },
                limit_identity: { type: "integer", default: 200 },
                limit_audio: { type: "integer", default: 200 },
                ivfflat_probes: { type: "integer", default: 10 },
                scope: {
                  type: "string",
                  enum: ["library", "all"],
                  description:
                    "`library` keeps candidates to `library_friend_id`'s library; `all` searches every library. Omitted, that library's saved setting applies.",
                },
                library_friend_id: {
                  type: "integer",
                  description: "Defaults to the first seed track's library.",
                },
              },
              required: ["tracks"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Recommendation candidates",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  seedTrackId: { type: "string" },
                  seedFriendId: { type: "integer" },
                  seedEmbeddings: {
                    type: "object",
                    properties: {
                      identity: { type: "boolean" },
                      audio: { type: "boolean" },
                    },
                    required: ["identity", "audio"],
                  },
                  scope: {
                    type: "string",
                    enum: ["library", "all"],
                    description: "The scope these candidates came from, after applying the saved setting.",
                  },
                  libraryFriendId: {
                    type: ["integer", "null"],
                    description: "The library candidates were limited to; null when every library was searched.",
                  },
                  candidates: { type: "array", items: recommendationCandidateSchemaObject },
                  stats: { type: "object", additionalProperties: true },
                },
                required: ["seedTrackId", "seedFriendId", "seedEmbeddings", "scope", "libraryFriendId", "candidates", "stats"],
                additionalProperties: true,
              },
            },
          },
        },
        "400": {
          description: "Invalid body",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "Seed embeddings missing",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getDefaultLibrarySettings",
    method: "get",
    path: "/api/settings/default-library",
    summary: "Get the saved default library",
    tags: ["Settings"],
    successSchema: defaultLibrarySettingsGetResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Default library setting",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  friend_id: { type: ["integer", "null"] },
                },
                required: ["friend_id"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "updateDefaultLibrarySettings",
    method: "put",
    path: "/api/settings/default-library",
    summary: "Update the saved default library",
    tags: ["Settings"],
    bodySchema: defaultLibrarySettingsPutBodySchema,
    successSchema: defaultLibrarySettingsPutResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                friend_id: { type: "integer" },
              },
              required: ["friend_id"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Default library updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  friend_id: { type: "integer" },
                },
                required: ["friend_id"],
              },
            },
          },
        },
        "400": {
          description: "Invalid payload",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "getAiPromptSettings",
    method: "get",
    path: "/api/settings/ai-prompt",
    summary: "Get AI metadata prompt settings",
    tags: ["Settings"],
    querySchema: aiPromptSettingsQuerySchema,
    successSchema: aiPromptSettingsGetResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "friend_id",
          in: "query",
          required: false,
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "AI prompt settings",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  prompt: { type: "string" },
                  defaultPrompt: { type: "string" },
                  isDefault: { type: "boolean" },
                },
                required: ["prompt", "defaultPrompt", "isDefault"],
              },
            },
          },
        },
        "400": {
          description: "Invalid query parameter",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "updateAiPromptSettings",
    method: "put",
    path: "/api/settings/ai-prompt",
    summary: "Update AI metadata prompt settings",
    tags: ["Settings"],
    bodySchema: aiPromptSettingsPutBodySchema,
    successSchema: aiPromptSettingsPutResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                friend_id: { type: "integer" },
                prompt: { type: "string" },
              },
              required: ["friend_id"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "AI prompt updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  prompt: { type: "string" },
                  isDefault: { type: "boolean" },
                },
                required: ["prompt", "isDefault"],
              },
            },
          },
        },
        "400": {
          description: "Invalid payload",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "getRecommendationSettings",
    method: "get",
    path: "/api/settings/recommendations",
    summary: "Get a library's track suggestion scope",
    tags: ["Settings"],
    querySchema: recommendationSettingsQuerySchema,
    successSchema: recommendationSettingsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
      ],
      responses: {
        "200": {
          description:
            "Where this library's suggestions come from: `library` (its own tracks) or `all` (every library). `isDefault` is true when it has never been set.",
          content: {
            "application/json": {
              schema: recommendationSettingsSchemaObject,
              examples: {
                recommendationSettings: {
                  summary: "Never set",
                  value: { friend_id: 1, scope: "library", isDefault: true },
                },
              },
            },
          },
        },
        "400": {
          description: "Missing or invalid friend_id",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "updateRecommendationSettings",
    method: "put",
    path: "/api/settings/recommendations",
    summary: "Set a library's track suggestion scope",
    tags: ["Settings"],
    bodySchema: recommendationSettingsPutBodySchema,
    successSchema: recommendationSettingsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                friend_id: { type: "integer" },
                scope: { type: "string", enum: ["library", "all"] },
              },
              required: ["friend_id", "scope"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Saved",
          content: {
            "application/json": {
              schema: recommendationSettingsSchemaObject,
              examples: {
                recommendationSettings: {
                  summary: "Search every library",
                  value: { friend_id: 1, scope: "all", isDefault: false },
                },
              },
            },
          },
        },
        "400": {
          description: "Invalid payload",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "No such library",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "lookupProviderDiscogsRelease",
    method: "get",
    path: "/api/providers/discogs/release-lookup",
    summary: "Lookup Discogs release JSON and matched track by track_id",
    tags: ["Providers"],
    querySchema: discogsLookupQuerySchema,
    successSchema: discogsLookupResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "track_id",
          in: "query",
          required: true,
          schema: { type: "string" },
        },
        {
          name: "username",
          in: "query",
          required: false,
          schema: { type: "string" },
        },
        {
          name: "friend_id",
          in: "query",
          required: false,
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "Discogs lookup result",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  releaseId: { type: "string" },
                  filePath: { type: "string" },
                  release: { type: "object", additionalProperties: true },
                  matchedTrack: { type: "object", additionalProperties: true },
                },
                additionalProperties: true,
              },
            },
          },
        },
        "400": {
          description: "Missing or invalid query parameter",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Discogs release file not found",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "searchProviderYouTubeMusic",
    method: "post",
    path: "/api/providers/youtube/music-search",
    summary: "Search YouTube Music videos by track metadata",
    tags: ["Providers"],
    bodySchema: providerYouTubeMusicSearchBodySchema,
    successSchema: providerYouTubeMusicSearchResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                artist: { type: "string" },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "YouTube matches",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        url: { type: "string" },
                        channel: { type: "string" },
                        thumbnail: { type: "string" },
                      },
                      required: ["id", "title", "url", "channel"],
                    },
                  },
                },
                required: ["results"],
              },
            },
          },
        },
        "500": {
          description: "Provider or server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "searchProviderAppleMusic",
    method: "post",
    path: "/api/providers/apple-music/search",
    summary: "Search Apple Music catalog by track metadata",
    tags: ["Providers"],
    bodySchema: providerAppleMusicSearchBodySchema,
    successSchema: providerAppleMusicSearchResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                artist: { type: "string" },
                album: { type: "string" },
                isrc: { type: "string" },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Apple Music matches",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        artist: { type: "string" },
                        album: { type: "string" },
                        url: { type: "string" },
                        artwork: { type: "string" },
                        duration: { type: "number" },
                        isrc: { type: "string" },
                      },
                      required: ["id"],
                    },
                  },
                },
                required: ["results"],
              },
            },
          },
        },
        "500": {
          description: "Provider or server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "generateProviderOpenAiTrackMetadata",
    method: "post",
    path: "/api/providers/openai/track-metadata",
    summary: "Generate metadata suggestions from OpenAI",
    tags: ["Providers"],
    bodySchema: providerTrackMetadataBodySchema,
    successSchema: providerTrackMetadataResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                prompt: { type: "string" },
                friend_id: { type: "integer" },
                track_id: {
                  type: "string",
                  description:
                    "The track being enriched. Adds its album's Discogs genres and styles, and the genres its other tracks use, to the prompt.",
                },
              },
              required: ["prompt"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Generated metadata",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  genres: {
                    type: "array",
                    description:
                      "Up to 3 suggested track genres. Always taxonomy entries: the model chooses from an enum of the taxonomy, and anything else is dropped.",
                    items: trackGenreSchemaObject,
                  },
                  descriptors: {
                    type: "array",
                    description: "Up to 3 normalised mood or description words.",
                    items: { type: "string" },
                  },
                  notes: { type: "string" },
                },
                required: ["genres", "descriptors", "notes"],
              },
            },
          },
        },
        "400": {
          description: "Invalid prompt payload",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Provider or server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "searchAlbums",
    method: "get",
    path: "/api/albums",
    summary: "Search and list albums",
    tags: ["Albums"],
    querySchema: albumSearchQuerySchema,
    successSchema: albumSearchResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "q", in: "query", required: false, schema: { type: "string" } },
        { name: "sort", in: "query", required: false, schema: { type: "string", default: "created_at:desc" } },
        { name: "friend_id", in: "query", required: false, schema: { type: "integer" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
        { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
        { name: "missing_library_identifier", in: "query", required: false, schema: { type: "integer", enum: [1], description: "Filter albums missing a library identifier" } },
        { name: "missing_local_cover_art_url", in: "query", required: false, schema: { type: "integer", enum: [1], description: "Filter albums missing local cover art" } },
        { name: "missing_audio", in: "query", required: false, schema: { type: "integer", enum: [1], description: "Filter albums with at least one track missing local audio" } },
        {
          name: "genre",
          in: "query",
          required: false,
          style: "form",
          explode: true,
          schema: { type: "array", items: { type: "string" }, maxItems: 20 },
          description:
            "Genre slug, id or name (a name resolves through aliases); repeat for several, which combine with OR. Each includes its subgenres. An album matches on its own Discogs genres and styles, or on any of its tracks' genres. An unknown genre is a 400."
        },
      ],
      responses: {
        "200": {
          description: "Albums search result",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  hits: { type: "array", items: { type: "object", additionalProperties: true } },
                  estimatedTotalHits: { type: "integer" },
                  offset: { type: "integer" },
                  limit: { type: "integer" },
                  query: { type: "string" },
                  sort: { type: "string" },
                },
                required: ["hits", "estimatedTotalHits", "offset", "limit", "query", "sort"],
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "getAlbumPlayableStructure",
    method: "get",
    path: "/api/albums/{releaseId}/playable-structure",
    summary: "Fetch normalized playable album side structure",
    tags: ["Albums", "Spins"],
    paramsSchema: albumReleaseParamsSchema,
    querySchema: albumFriendQuerySchema,
    successSchema: albumPlayableStructureResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "releaseId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
        {
          name: "friend_id",
          in: "query",
          required: true,
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "Normalized playable album structure",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  album: { type: "object", additionalProperties: true },
                  sides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        side_key: { type: "string" },
                        side_label: { type: "string" },
                        ordinal: { type: "integer" },
                        track_count: { type: "integer" },
                        tracks: {
                          type: "array",
                          items: { type: "object", additionalProperties: true },
                        },
                      },
                      required: [
                        "side_key",
                        "side_label",
                        "ordinal",
                        "track_count",
                        "tracks",
                      ],
                    },
                  },
                },
                required: ["album", "sides"],
              },
            },
          },
        },
        "400": {
          description: "Missing or invalid query parameter",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Album not found",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "getAlbumDetail",
    method: "get",
    path: "/api/albums/{releaseId}",
    summary: "Fetch album with tracks",
    tags: ["Albums"],
    paramsSchema: albumReleaseParamsSchema,
    querySchema: albumFriendQuerySchema,
    successSchema: albumDetailResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "releaseId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
        {
          name: "friend_id",
          in: "query",
          required: true,
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "Album detail",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  album: { type: "object", additionalProperties: true },
                  tracks: { type: "array", items: { type: "object", additionalProperties: true } },
                },
                required: ["album", "tracks"],
              },
            },
          },
        },
        "400": {
          description: "Invalid query parameter",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Album not found",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "updateAlbum",
    method: "patch",
    path: "/api/albums",
    summary: "Update album metadata",
    tags: ["Albums"],
    bodySchema: albumUpdateBodySchema,
    successSchema: albumUpdateResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                release_id: { type: "string" },
                friend_id: { type: "integer" },
                album_rating: { type: "number" },
                album_notes: { type: "string" },
                purchase_price: { type: "number" },
                condition: { type: "string" },
                library_identifier: { type: ["string", "null"] },
              },
              required: ["release_id", "friend_id"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Album updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  album: { type: "object", additionalProperties: true },
                  tracksUpdated: { type: "integer" },
                },
                required: ["success", "album"],
              },
            },
          },
        },
        "400": {
          description: "Invalid payload",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Album not found",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "409": {
          description: "Duplicate library identifier",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "createAlbum",
    method: "post",
    path: "/api/albums/create",
    summary: "Create a local album with tracks",
    tags: ["Albums"],
    successSchema: albumCreateResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                album: { type: "string", description: "JSON stringified album payload" },
                tracks: { type: "string", description: "JSON stringified tracks payload" },
                friend_id: { type: "string" },
                cover_art: { type: "string", format: "binary" },
              },
              required: ["album", "tracks", "friend_id"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Album created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  album: {
                    type: "object",
                    properties: {
                      release_id: { type: "string" },
                      friend_id: { type: "integer" },
                      title: { type: "string" },
                      artist: { type: "string" },
                      year: { type: ["string", "number", "null"] },
                      genres: { type: "array", items: { type: "string" } },
                      styles: { type: "array", items: { type: "string" } },
                      album_thumbnail: { type: ["string", "null"] },
                      track_count: { type: "integer" },
                      date_added: { type: "string" },
                      date_changed: { type: "string" },
                      library_identifier: { type: ["string", "null"] },
                    },
                    required: ["release_id", "friend_id", "title", "artist"],
                    additionalProperties: true,
                  },
                  tracks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        track_id: { type: "string" },
                        friend_id: { type: "integer" },
                        title: { type: "string" },
                        artist: { type: "string" },
                        album: { type: "string" },
                        year: { type: ["string", "number", "null"] },
                        duration: { type: "string" },
                        duration_seconds: { type: ["number", "null"] },
                        position: { type: ["string", "number"] },
                        release_id: { type: ["string", "null"] },
                        library_identifier: { type: ["string", "null"] },
                      },
                      required: ["track_id", "friend_id", "title", "artist", "album"],
                      additionalProperties: true,
                    },
                  },
                },
                required: ["album", "tracks"],
              },
            },
          },
        },
        "400": {
          description: "Invalid payload",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "Friend not found",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "413": {
          description: "Uploaded cover art too large",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "upsertAlbumWithTracks",
    method: "post",
    path: "/api/albums/upsert",
    summary: "Create or update album and tracks",
    tags: ["Albums"],
    successSchema: albumUpsertWithTracksResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                release_id: { type: "string" },
                album: { type: "string", description: "JSON stringified album payload" },
                tracks: { type: "string", description: "JSON stringified tracks payload" },
                friend_id: { type: "string" },
                cover_art: { type: "string", format: "binary" },
              },
              required: ["release_id", "album", "tracks", "friend_id"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Album upserted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  album: { type: "object", additionalProperties: true },
                  tracks: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                  deletedTracks: { type: "integer" },
                },
                required: ["album", "tracks", "deletedTracks"],
              },
            },
          },
        },
        "400": {
          description: "Invalid payload",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Friend not found",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "413": {
          description: "Uploaded cover art too large",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "getAlbumDiscogsRaw",
    method: "get",
    path: "/api/albums/{releaseId}/discogs-raw",
    summary: "Get raw Discogs release payload for album",
    tags: ["Albums"],
    paramsSchema: albumReleaseParamsSchema,
    querySchema: albumFriendQuerySchema,
    successSchema: albumDiscogsRawResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "releaseId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
        {
          name: "friend_id",
          in: "query",
          required: true,
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "Discogs raw payload",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  friend_id: { type: "integer" },
                  release_id: { type: "string" },
                  username: { type: "string" },
                  file_path: { type: "string" },
                  data: { type: "object", additionalProperties: true },
                },
                required: ["friend_id", "release_id", "username", "file_path", "data"],
              },
            },
          },
        },
        "400": {
          description: "Missing required parameters",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "404": {
          description: "Release or friend not found",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "queueAlbumDownloads",
    method: "post",
    path: "/api/albums/{releaseId}/download",
    summary: "Queue missing-track downloads for album",
    tags: ["Albums"],
    paramsSchema: albumReleaseParamsSchema,
    querySchema: albumFriendQuerySchema,
    successSchema: queueAlbumDownloadsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "releaseId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
        {
          name: "friend_id",
          in: "query",
          required: true,
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": {
          description: "Downloads queued",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  jobIds: { type: "array", items: { type: "string" } },
                  tracksQueued: { type: "integer" },
                },
                required: ["success", "message", "jobIds", "tracksQueued"],
              },
            },
          },
        },
        "400": {
          description: "Missing required parameters",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "listSpinSessions",
    method: "get",
    path: "/api/spins",
    summary: "List manual vinyl spin sessions",
    tags: ["Spins"],
    querySchema: spinListQuerySchema,
    successSchema: spinListResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
        { name: "release_id", in: "query", required: false, schema: { type: "string" } },
        { name: "track_id", in: "query", required: false, schema: { type: "string" } },
        { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
        { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
      ],
      responses: {
        "200": {
          description: "Spin session list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
                required: ["items", "limit", "offset"],
              },
            },
          },
        },
        "400": {
          description: "Invalid query",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "createSpinSession",
    method: "post",
    path: "/api/spins",
    summary: "Create a manual vinyl spin session",
    tags: ["Spins"],
    bodySchema: spinCreateBodySchema,
    successSchema: spinCreateResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                friend_id: { type: "integer" },
                release_id: { type: "string" },
                played_at: { type: "string", format: "date-time" },
                note: { type: ["string", "null"] },
                context_type: { type: ["string", "null"] },
                side_keys: {
                  type: "array",
                  items: { type: "string" },
                },
                track_refs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      track_id: { type: "string" },
                      friend_id: { type: "integer" },
                    },
                    required: ["track_id", "friend_id"],
                  },
                },
              },
              required: ["friend_id", "release_id", "played_at"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Spin session created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  session: { type: "object", additionalProperties: true },
                  selections: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                  expanded_tracks: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                  derived: {
                    type: "object",
                    properties: {
                      is_full_album_spin: { type: "boolean" },
                      selected_side_count: { type: "integer" },
                      album_side_count: { type: "integer" },
                      track_count: { type: "integer" },
                    },
                    required: [
                      "is_full_album_spin",
                      "selected_side_count",
                      "album_side_count",
                      "track_count",
                    ],
                  },
                },
                required: ["session", "selections", "expanded_tracks", "derived"],
              },
            },
          },
        },
        "400": {
          description: "Invalid payload",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "Album not found",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "aggregateSpins",
    method: "post",
    path: "/api/spins/aggregate",
    summary: "Manually aggregate detections into spin sessions since a date (#304)",
    tags: ["Spins"],
    bodySchema: spinAggregateBodySchema,
    successSchema: spinAggregateResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                since: {
                  type: "string",
                  format: "date-time",
                  description:
                    "Both automatic triggers only look back " +
                    "PLAY_AGGREGATION_LOOKBACK_MINUTES (default 60), so this is " +
                    "the manual escape hatch for anything older.",
                },
                source_id: {
                  type: "string",
                  description: "Omit to aggregate every source active since `since`.",
                },
              },
              required: ["since"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Totals across every source aggregated, per source and overall",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  since: { type: "string" },
                  created: { type: "integer" },
                  skipped: { type: "integer" },
                  sources: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        source_id: { type: "string" },
                        created: { type: "integer" },
                        skipped: { type: "integer" },
                      },
                      required: ["source_id", "created", "skipped"],
                    },
                  },
                },
                required: ["since", "created", "skipped", "sources"],
              },
            },
          },
        },
        "400": {
          description: "Invalid payload",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "listTopSpinTracks",
    method: "get",
    path: "/api/spins/top-tracks",
    summary: "List most-played vinyl tracks",
    tags: ["Spins"],
    querySchema: spinTopTracksQuerySchema,
    successSchema: spinTopTracksResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
        { name: "release_id", in: "query", required: false, schema: { type: "string" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
        { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
      ],
      responses: {
        "200": {
          description: "Most-played vinyl tracks",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
                required: ["items", "limit", "offset"],
              },
            },
          },
        },
        "400": {
          description: "Invalid query",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "updateSpinSession",
    method: "patch",
    path: "/api/spins/{id}",
    summary: "Edit a vinyl spin session",
    tags: ["Spins"],
    paramsSchema: spinSessionParamsSchema,
    bodySchema: spinUpdateBodySchema,
    successSchema: spinUpdateResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      requestBody: {
        required: true,
        description:
          "Change when a spin was played, its note or context, or what was played. A new selection (side_keys or track_refs) replaces the old one and its track events. Editing a spin the listener detected keeps its provenance and sets corrected_at.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                friend_id: { type: "integer" },
                played_at: { type: "string", format: "date-time" },
                note: { type: ["string", "null"] },
                context_type: { type: ["string", "null"] },
                side_keys: { type: "array", items: { type: "string" }, minItems: 1 },
                track_refs: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    properties: {
                      track_id: { type: "string" },
                      friend_id: { type: "integer" },
                    },
                    required: ["track_id", "friend_id"],
                  },
                },
              },
              required: ["friend_id"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "The edited spin session",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  session: { type: "object", additionalProperties: true },
                  selections: { type: "array", items: { type: "object", additionalProperties: true } },
                  track_events: { type: "array", items: { type: "object", additionalProperties: true } },
                  derived: { type: "object", additionalProperties: true },
                },
                required: ["session", "selections", "track_events", "derived"],
              },
            },
          },
        },
        "400": {
          description: "Invalid request, or a selection that does not fit the album",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "Session or album not found",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "deleteSpinSession",
    method: "delete",
    path: "/api/spins/{id}",
    summary: "Delete a manual vinyl spin session",
    tags: ["Spins"],
    paramsSchema: spinSessionParamsSchema,
    querySchema: spinDeleteQuerySchema,
    successSchema: spinDeleteResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "integer" } },
        { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
      ],
      responses: {
        "200": {
          description: "Spin session deleted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  session: { type: "object", additionalProperties: true },
                },
                required: ["success", "session"],
              },
            },
          },
        },
        "400": {
          description: "Invalid request",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "Session not found",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "syncDiscogsCollectionStream",
    method: "get",
    path: "/api/discogs",
    summary: "Sync Discogs collection and stream progress output",
    tags: ["Discogs"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "username",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Discogs username to sync. Defaults to `DISCOGS_USERNAME` when omitted.",
        },
      ],
      responses: {
        "200": {
          description: "Progress stream",
          content: {
            "text/event-stream": {
              schema: { type: "string" },
            },
          },
        },
        "500": {
          description: "Discogs credentials or server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "deleteDiscogsReleases",
    method: "post",
    path: "/api/discogs/delete-releases",
    summary: "Delete selected Discogs release exports and related DB tracks",
    tags: ["Discogs"],
    bodySchema: discogsDeleteReleasesBodySchema,
    successSchema: discogsDeleteReleasesResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                username: { type: "string" },
                releaseIds: { type: "array", items: { type: "string" } },
              },
              required: ["username", "releaseIds"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Release delete summary",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  deletedFiles: {
                    type: "array",
                    items: { type: "string", example: "/audio/trk_001.m4a" },
                  },
                  failedDeletes: {
                    type: "array",
                    items: { type: "string", example: "/audio/trk_404.m4a" },
                  },
                  deletedTrackIds: { type: "array", items: { type: "string" } },
                  deletedFromDb: { type: "integer" },
                },
                required: [
                  "message",
                  "deletedFiles",
                  "failedDeletes",
                  "deletedTrackIds",
                  "deletedFromDb",
                ],
              },
            },
          },
        },
        "400": {
          description: "Invalid request body",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "verifyPlaylistSyncManifests",
    method: "get",
    path: "/api/discogs/verify-manifests",
    summary: "Verify playlist sync manifests",
    tags: ["Discogs"],
    successSchema: manifestVerificationResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Manifest verification report",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        username: { type: "string" },
                        totalReleaseIds: { type: "integer" },
                        missingFiles: { type: "array", items: { type: "string" } },
                        validFiles: { type: "array", items: { type: "string" } },
                      },
                      required: ["username", "totalReleaseIds", "missingFiles", "validFiles"],
                    },
                  },
                  summary: {
                    type: "object",
                    properties: {
                      totalManifests: { type: "integer" },
                      totalMissingFiles: { type: "integer" },
                      totalValidFiles: { type: "integer" },
                    },
                    required: ["totalManifests", "totalMissingFiles", "totalValidFiles"],
                  },
                },
                required: ["message", "results", "summary"],
              },
              examples: {
                manifestVerification: {
                  summary: "Playlist sync manifest verification",
                  value: manifestVerifyExample,
                },
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  {
    operationId: "cleanupPlaylistSyncManifests",
    method: "post",
    path: "/api/discogs/verify-manifests",
    summary: "Cleanup playlist sync manifests",
    tags: ["Discogs"],
    successSchema: manifestCleanupResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Manifest cleanup report",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        username: { type: "string" },
                        before: { type: "integer" },
                        after: { type: "integer" },
                        removed: { type: "array", items: { type: "string" } },
                      },
                      required: ["username", "before", "after", "removed"],
                    },
                  },
                  summary: {
                    type: "object",
                    properties: {
                      totalManifests: { type: "integer" },
                      totalRemoved: { type: "integer" },
                      totalKept: { type: "integer" },
                    },
                    required: ["totalManifests", "totalRemoved", "totalKept"],
                  },
                },
                required: ["message", "results", "summary"],
              },
              examples: {
                manifestCleanup: {
                  summary: "Playlist sync manifest cleanup",
                  value: manifestCleanupExample,
                },
              },
            },
          },
        },
        "500": {
          description: "Server error",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
          },
        },
      },
    },
  },
  ...remainingTracksContracts,
  ...fingerprintContracts,
  ...embeddingsBackfillContracts,
  ...embeddingsQueueContracts,
  ...embeddingModelSettingsContracts,
  ...audioIngestContracts,
  ...setDerivationContracts,
  ...backupContracts,
  ...recordCareContracts,
];
