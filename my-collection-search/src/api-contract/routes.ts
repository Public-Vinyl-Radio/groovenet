import {
  homeQuerySchema,
  homeResponseSchema,
  spinRecapQuerySchema,
  spinRecapResponseSchema,
  spinTrackStatsQuerySchema,
  spinTrackStatsResponseSchema,
} from "./schemas";
import { z } from "zod";
import {
  recordCareQueueQuerySchema,
  recordCareQueueResponseSchema,
  recordCareProgressQuerySchema,
  recordCareProgressResponseSchema,
} from "./recordCareQueue";
import { playerContracts } from "./players";
import {
  healthResponseSchema,
  playlistDeleteResponseSchema,
  orphanScanStartResponseSchema,
  orphansQuerySchema,
  orphansResponseSchema,
  statusResponseSchema,
  updateCheckResponseSchema,
  versionResponseSchema,
} from "@groovenet/contracts";
import {
  aiPromptSettingsGetResponseSchema,
  aiPromptSettingsPutBodySchema,
  aiPromptSettingsPutResponseSchema,
  aiPromptSettingsQuerySchema,
  appearanceSettingsPutBodySchema,
  appearanceSettingsResponseSchema,
  recommendationSettingsPutBodySchema,
  recommendationSettingsQuerySchema,
  recommendationSettingsResponseSchema,
  albumCreateResponseSchema,
  albumDeleteResponseSchema,
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
  backupStatusRunResponseSchema,
  backupListResponseSchema,
  backupDeleteResponseSchema,
  restoreResponseSchema,
  backupHealthResponseSchema,
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
  librariesListResponseSchema,
  discogsUserLookupResponseSchema,
  manifestCleanupResponseSchema,
  manifestVerificationResponseSchema,
  gamdlActionRequestSchema,
  gamdlActionResponseSchema,
  gamdlCookieUploadResponseSchema,
  gamdlSettingsGetResponseSchema,
  gamdlSettingsPutBodySchema,
  gamdlSettingsPutResponseSchema,
  gamdlSettingsQuerySchema,
  genreTreeResponseSchema,
  genrePageQuerySchema,
  genrePageResponseSchema,
  genreSimilarResponseSchema,
  genreSimilarQuerySchema,
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
  jobLogsResponseSchema,
  jobOutcomeResponseSchema,
  jobsClearResponseSchema,
  jobsEventsSseResponseSchema,
  jobsListQuerySchema,
  jobsListResponseSchema,
  playlistCreateBodySchema,
  playlistDeleteQuerySchema,
  playlistDetailParamsSchema,
  liveSetResponseSchema,
  liveSetUpdateBodySchema,
  liveSetMutationSchema,
  liveSetDeleteSchema,
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
  recordCareLogQuerySchema,
  recordCareLogResponseSchema,
  recordCareQuerySchema,
  recordCareResponseSchema,
  recordCareSessionCreateBodySchema,
  recordCareSessionMutationResponseSchema,
  recordCareSessionParamsSchema,
  recordCareSessionVoidBodySchema,
  recordCareSessionVoidResponseSchema,
  recordCareStackDiscardResponseSchema,
  recordCareStackListQuerySchema,
  recordCareStackListResponseSchema,
  recordCareStackPullBodySchema,
  recordCareStackPullResponseSchema,
  recordCareStackResponseSchema,
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
  albumAppleMusicArtPreviewSchema,
  albumArtMatchResultSchema,
  albumArtworkApplyBodySchema,
  albumArtworkBackfillBodySchema,
  albumArtworkBackfillResponseSchema,
  albumArtworkReviewQuerySchema,
  albumArtworkReviewResponseSchema,
  albumArtworkStateSchema,
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

const TRACK_REF = { $ref: "#/components/schemas/Track" };
const componentRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const TRACK_GENRE_REF = { $ref: "#/components/schemas/TrackGenre" };
const ALBUM_ARTWORK_STATE_REF = { $ref: "#/components/schemas/AlbumArtworkState" };

const appearanceExample = {
  palette: "sleeve",
  fonts: { display: "default", body: "default", label: "default" },
  customPalette: null,
  corners: "square",
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

function makeTrackRoute(
  method: HttpMethod,
  path: string,
  summary: string,
  options: TrackRouteOptions = {},
): ApiContractRoute {
  const responses = options.responses ?? {
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
      // Examples are added for every operation by openapi.ts, once components exist.
      responses: structuredClone(responses),
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
                tracks: { type: "array", items: TRACK_REF },
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
                description:
                  "Replaces the track's descriptors: free text, normalised and de-duplicated.",
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
            schema: TRACK_REF,
          },
        },
      },
      "400": {
        description:
          "Body is not valid JSON, track_id or friend_id is missing, genres, descriptors or genre_source is malformed, or a genre name is unknown. Other fields are not type-checked.",
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
      "400": {
        description: "Invalid upload payload",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "500": {
        description: "Upload/processing error",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
    },
  }),
  makeTrackRoute("post", "/api/tracks/analyze-async", "Queue async track analysis", {
    requestBody: {
      required: true,
      description:
        "At least one of apple_music_url, youtube_url and soundcloud_url must be non-empty. friend_id may also be sent as a numeric string.",
      content: {
        "application/json": { schema: componentRef("TrackAnalyzeAsyncRequest") },
      },
    },
    responses: {
      "200": {
        description: "Job queued",
        content: {
          "application/json": { schema: componentRef("TrackAnalyzeAsyncResponse") },
        },
      },
      "400": {
        description: "Invalid request",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "500": {
        description: "Queueing error",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
    },
  }),
  makeTrackRoute("post", "/api/tracks/fix-duration", "Queue a duration fix for a track", {
    requestBody: {
      required: true,
      content: {
        "application/json": { schema: componentRef("TrackFixDurationRequest") },
      },
    },
    responses: {
      "200": {
        description: "Job queued",
        content: {
          "application/json": { schema: componentRef("TrackFixDurationResponse") },
        },
      },
      "400": {
        description: "track_id or friend_id missing",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "500": {
        description: "Queueing error",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
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
              items: TRACK_REF,
            },
          },
        },
      },
      "500": {
        description: "Batch query error",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
    },
  }),
  makeTrackRoute("post", "/api/tracks/playlist_counts", "Get playlist counts for tracks", {
    requestBody: {
      required: true,
      description:
        "Lenient by design: a ref that is not { track_id: non-empty string, friend_id: integer } is dropped rather than rejected, and a body with no usable refs answers {} with 200. There is no 400.",
      content: {
        "application/json": { schema: componentRef("TrackPlaylistCountsRequest") },
      },
    },
    responses: {
      "200": {
        description: "Track playlist counts keyed by track_id:friend_id",
        content: {
          "application/json": {
            schema: componentRef("TrackPlaylistCountsResponse"),
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
              ...TRACK_REF,
            },
          },
        },
      },
      "400": {
        description: "Missing required parameters",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "404": {
        description: "Track not found",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
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
          "application/json": { schema: componentRef("TrackDeleteResponse") },
        },
      },
      "400": {
        description: "Missing or invalid parameters",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "404": {
        description: "Track not found or already deleted",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "500": {
        description: "Server error",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
    },
  }),
  makeTrackRoute("post", "/api/tracks/{id}/restore", "Restore a soft-deleted track", {
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
    ],
    responses: {
      "200": {
        description: "Track restored",
        content: {
          "application/json": { schema: componentRef("TrackRestoreResponse") },
        },
      },
      "400": {
        description: "Missing or invalid parameters",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "404": {
        description: "Track not found or not deleted",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "500": {
        description: "Server error",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
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
          "application/json": { schema: componentRef("TrackAudioMetadata") },
        },
      },
      "400": {
        description: "Missing required parameters",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "404": {
        description: "Track or audio not found",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
    },
  }),
  makeTrackRoute("post", "/api/tracks/{id}/audio-metadata", "Extract embedded audio cover art", {
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: componentRef("TrackExtractEmbeddedCoverRequest"),
        },
      },
    },
    responses: {
      "200": {
        description: "Cover extracted",
        content: {
          "application/json": { schema: componentRef("TrackExtractEmbeddedCoverResponse") },
        },
      },
      "400": {
        description: "Missing required parameters",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "404": {
        description: "No embedded artwork / track not found",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
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
        schema: { ...componentRef("TrackEmbeddingPreviewType"), default: "identity" },
      },
    ],
    responses: {
      "200": {
        description: "Embedding preview payload",
        content: {
          "application/json": {
            schema: componentRef("TrackEmbeddingPreview"),
          },
        },
      },
      "400": {
        description: "Missing required parameters",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "404": {
        description: "Track not found",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
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
          "application/json": { schema: componentRef("TrackEssentia") },
        },
      },
      "400": {
        description: "Missing required parameters",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
      "404": {
        description: "Analysis not found",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
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
          "application/json": { schema: componentRef("TrackPlaylistsResponse") },
        },
      },
      "400": {
        description: "Missing required parameters",
        content: { "application/json": { schema: errorResponseSchemaObject } },
      },
    },
  }),
];

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
                  description: "Base64 engine payload, or null when the engine stores none.",
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
          "application/json": { schema: componentRef("EmbeddingBackfillRequest") },
        },
      },
      responses: {
        "200": {
          description: "Dry run: counts only, nothing enqueued",
          content: { "application/json": { schema: componentRef("EmbeddingBackfillDryRun") } },
        },
        "202": {
          description: "Run queued",
          content: { "application/json": { schema: componentRef("EmbeddingBackfillRun") } },
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
          content: { "application/json": { schema: componentRef("EmbeddingBackfillRun") } },
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
          content: { "application/json": { schema: componentRef("EmbeddingStatus") } },
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
          description:
            "Lane depths, retry/paused/failed state, drain rate and ETA, kind breakdown and active backfill runs",
          content: { "application/json": { schema: componentRef("EmbeddingQueueStatus") } },
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
        content: { "application/json": { schema: componentRef("EmbeddingQueueRetryRequest") } },
      },
      responses: {
        "200": {
          description: "Retried ids and any that were no longer in the failed list",
          content: { "application/json": { schema: componentRef("EmbeddingQueueRetryResponse") } },
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
          content: { "application/json": { schema: componentRef("EmbeddingModelSettingsList") } },
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
          "application/json": { schema: componentRef("EmbeddingModelUpdateRequest") },
        },
      },
      responses: {
        "200": {
          description: "Updated row",
          content: { "application/json": { schema: componentRef("EmbeddingModelSettings") } },
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
        {
          name: "status",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["received", "processing", "processed", "failed"] },
        },
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
                        "ingest_id",
                        "source_id",
                        "session_id",
                        "sequence",
                        "status",
                        "error",
                        "duration_seconds",
                        "sample_rate",
                        "channels",
                        "codec",
                        "file_path",
                        "captured_at",
                        "received_at",
                        "updated_at",
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
                        description:
                          "True means nothing can ever match, however healthy the rest looks.",
                      },
                      missing_fingerprint_tracks: { type: "integer" },
                    },
                    required: [
                      "engine_registered",
                      "fingerprint_type",
                      "fingerprint_version",
                      "indexed_tracks",
                      "empty",
                      "missing_fingerprint_tracks",
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
                  "since",
                  "window_minutes",
                  "source_id",
                  "ingest_writable",
                  "index",
                  "queue_depth",
                  "ingests",
                  "detections",
                  "spins",
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
        {
          name: "matched",
          in: "query",
          required: false,
          schema: { type: "boolean" },
          description: "Omit for both. A no-match window is a recorded result, not an absence.",
        },
        {
          name: "since",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
        },
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
                        "id",
                        "ingest_id",
                        "source_id",
                        "session_id",
                        "window_start_at",
                        "matched",
                        "track_id",
                        "friend_id",
                        "title",
                        "artist",
                        "album",
                        "confidence",
                        "offset_seconds",
                        "level_dbfs",
                        "fingerprint_type",
                        "fingerprint_version",
                        "created_at",
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
      description:
        "Present when playlist_id or live_set_id is given. `play` indexes into tracklist.",
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
  description:
    "Days since cleaning before a copy is overdue. Default RECORD_CLEANING_OVERDUE_DAYS (365).",
  schema: { type: "integer", minimum: 1 },
};
const needsSleeveParam = {
  name: "needs_sleeve",
  in: "query",
  required: false,
  description: "The sleeve every copy should be in. Default poly-rice-paper-poly.",
  schema: componentRef("SleeveType"),
};

const recordCareContracts: ApiContractRoute[] = [
  {
    operationId: "getRecordCareQueue",
    method: "get",
    path: "/api/record-care/queue",
    summary: "Never-cleaned copies in stack pull order; backlog is paged",
    tags: ["Record Care"],
    querySchema: recordCareQueueQuerySchema,
    successSchema: recordCareQueueResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        friendIdQueryParam,
        {
          name: "month",
          in: "query",
          schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
          description: "Spin window YYYY-MM; defaults to current month in display time zone",
        },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 0, maximum: 500, default: 50 },
        },
        { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
      ],
      responses: {
        "200": {
          description: "First matching group per copy; excludes copies in open stacks",
          content: { "application/json": { schema: componentRef("RecordCareQueueResponse") } },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "getRecordCareProgress",
    method: "get",
    path: "/api/record-care/progress",
    summary: "Library cleaning progress and four-week pace",
    tags: ["Record Care"],
    querySchema: recordCareProgressQuerySchema,
    successSchema: recordCareProgressResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        friendIdQueryParam,
        {
          name: "stack_size",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 500, default: 10 },
        },
      ],
      responses: {
        "200": {
          description: "Ever-cleaned counts and records/sessions logged this calendar month",
          content: { "application/json": { schema: componentRef("RecordCareProgressResponse") } },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
      },
    },
  },

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
              schema: componentRef("RecordCopyListResponse"),
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
            schema: componentRef("RecordCopyCreate"),
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
              schema: componentRef("RecordCopyResponse"),
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
            schema: componentRef("RecordCopyDefaultUpdate"),
            example: { friend_id: 1, release_id: "rel_4471", label: "DJ copy" },
          },
        },
      },
      responses: {
        "200": {
          description: "The default copy, updated",
          content: {
            "application/json": {
              schema: componentRef("RecordCopyResponse"),
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
            schema: componentRef("RecordCopyUpdate"),
            example: { friend_id: 1, label: "DJ copy" },
          },
        },
      },
      responses: {
        "200": {
          description: "Updated copy",
          content: {
            "application/json": {
              schema: componentRef("RecordCopyResponse"),
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
              schema: componentRef("RecordCopyDeleteResponse"),
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
          schema: componentRef("RecordActionType"),
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
              schema: componentRef("RecordActionListResponse"),
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
          schema: componentRef("RecordCareStatus"),
        },
        overdueDaysParam,
        needsSleeveParam,
        {
          name: "sleeve_type",
          in: "query",
          required: false,
          description: "Only copies in this sleeve; unknown for none logged",
          schema: { anyOf: [componentRef("SleeveType"), { type: "string", const: "unknown" }] },
        },
        ...pagingParams,
      ],
      responses: {
        "200": {
          description:
            "Copies, least recently cleaned first. An album with no copy rows appears once, as its implicit default copy (copy_id null).",
          content: {
            "application/json": {
              schema: componentRef("RecordCareResponse"),
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
              schema: componentRef("RecordCareSummary"),
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
            schema: componentRef("RecordActionCreate"),
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
          content: { "application/json": { schema: componentRef("RecordActionMutationResponse") } },
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
              schema: componentRef("RecordActionVoidResponse"),
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

// ─── Care stacks and batch logs (#941) ───────────────────────────────────────

const stackPagingParams = [
  { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
  { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
];

const recordCareSessionContracts: ApiContractRoute[] = [
  {
    operationId: "pullRecordCareStack",
    method: "post",
    path: "/api/record-care/stacks",
    summary: "Pull the next stack of copies to care for",
    tags: ["Record Care"],
    bodySchema: recordCareStackPullBodySchema,
    successSchema: recordCareStackPullResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: componentRef("RecordCareStackPull"),
            example: { friend_id: 1, size: 10, source: "web" },
          },
        },
      },
      responses: {
        "201": {
          description:
            "A new open stack: the next `size` (default 10) never-cleaned copies in queue order, or the explicit `copies`",
          content: { "application/json": { schema: componentRef("RecordCareStackPullResponse") } },
        },
        "200": {
          description: "The stack that was already open (`created: false`)",
          content: { "application/json": { schema: componentRef("RecordCareStackPullResponse") } },
        },
        "400": jsonError("Invalid payload"),
        "404": jsonError("Album not found, or record copy not found"),
        "409": jsonError("Every record in the queue has been cleaned"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "listRecordCareStacks",
    method: "get",
    path: "/api/record-care/stacks",
    summary: "A friend's care stacks, newest first",
    tags: ["Record Care"],
    querySchema: recordCareStackListQuerySchema,
    successSchema: recordCareStackListResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        friendIdQueryParam,
        {
          name: "status",
          in: "query",
          required: false,
          description: "open for the stack in progress",
          schema: componentRef("RecordCareSessionStatus"),
        },
        ...stackPagingParams,
      ],
      responses: {
        "200": {
          description: "Stacks with their copies. Ad-hoc logs are not stacks.",
          content: { "application/json": { schema: componentRef("RecordCareStackListResponse") } },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "getRecordCareStack",
    method: "get",
    path: "/api/record-care/stacks/{id}",
    summary: "A care stack with its copies in order",
    tags: ["Record Care"],
    paramsSchema: recordCareSessionParamsSchema,
    querySchema: recordFriendQuerySchema,
    successSchema: recordCareStackResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [integerIdParam, friendIdQueryParam],
      responses: {
        "200": {
          description: "The stack",
          content: { "application/json": { schema: componentRef("RecordCareStackResponse") } },
        },
        "400": jsonError("Invalid id or query"),
        "404": jsonError("Care stack not found"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "discardRecordCareStack",
    method: "delete",
    path: "/api/record-care/stacks/{id}",
    summary: "Clear an open stack",
    tags: ["Record Care"],
    paramsSchema: recordCareSessionParamsSchema,
    querySchema: recordFriendQuerySchema,
    successSchema: recordCareStackDiscardResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [integerIdParam, friendIdQueryParam],
      responses: {
        "200": {
          description: "Discarded; its number goes to the next pull. Clearing twice is a no-op.",
          content: {
            "application/json": { schema: componentRef("RecordCareStackDiscardResponse") },
          },
        },
        "400": jsonError("Invalid id or query"),
        "404": jsonError("Care stack not found"),
        "409": jsonError("The stack is not open"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "logRecordCareSession",
    method: "post",
    path: "/api/record-care/sessions",
    summary: "Log care for a stack or a selection of copies",
    tags: ["Record Care"],
    bodySchema: recordCareSessionCreateBodySchema,
    successSchema: recordCareSessionMutationResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: componentRef("RecordCareSessionCreate"),
            example: {
              friend_id: 1,
              stack_id: 2,
              action_types: ["cleaned", "sleeved"],
              occurred_at: "2026-10-30T19:00:00.000Z",
              sleeve_type: "poly-rice-paper-poly",
              details: { method: "ultrasonic" },
              notes: "Two passes, air dried overnight.",
              source: "web",
            },
          },
        },
      },
      responses: {
        "201": {
          description:
            "Logged: one action per copy per type, under one session, in one transaction. sleeve_type is required when sleeved is included and only then; details.method only with cleaned.",
          content: {
            "application/json": { schema: componentRef("RecordCareSessionMutationResponse") },
          },
        },
        "400": jsonError("Invalid payload"),
        "404": jsonError("Care session, album or record copy not found"),
        "409": jsonError("The stack is not open"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "listRecordCareLog",
    method: "get",
    path: "/api/record-care/sessions",
    summary: "The care log, newest first",
    tags: ["Record Care"],
    querySchema: recordCareLogQuerySchema,
    successSchema: recordCareLogResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [friendIdQueryParam, ...stackPagingParams],
      responses: {
        "200": {
          description:
            "One entry per session, plus one per action logged on its own, so the log is complete",
          content: { "application/json": { schema: componentRef("RecordCareLogResponse") } },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "voidRecordCareSession",
    method: "post",
    path: "/api/record-care/sessions/{id}/void",
    summary: "Undo a care log",
    tags: ["Record Care"],
    paramsSchema: recordCareSessionParamsSchema,
    bodySchema: recordCareSessionVoidBodySchema,
    successSchema: recordCareSessionVoidResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [integerIdParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: componentRef("RecordCareSessionVoid"),
            example: { friend_id: 1 },
          },
        },
      },
      responses: {
        "200": {
          description:
            "Undone: every action voided (kept in the history), each copy's care state recomputed from what remains, and a stack reopened",
          content: {
            "application/json": { schema: componentRef("RecordCareSessionVoidResponse") },
          },
        },
        "400": jsonError("Invalid id or payload"),
        "404": jsonError("Care session not found"),
        "409": jsonError("Nothing logged to undo, or another stack is open"),
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
    successSchema: backupListResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Backup files, newest first",
          content: { "application/json": { schema: componentRef("BackupListResponse") } },
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
          content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
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
    successSchema: backupDeleteResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: buildPathParameters("/api/backups/{filename}"),
      responses: {
        "200": {
          description: "Backup deleted",
          content: { "application/json": { schema: componentRef("BackupDeleteResponse") } },
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
    successSchema: restoreResponseSchema,
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
          "application/octet-stream": { schema: { type: "string", format: "binary" } },
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
          content: { "application/json": { schema: componentRef("RestoreResponse") } },
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
    successSchema: backupStatusRunResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Latest backup status after the run",
          content: { "application/json": { schema: componentRef("BackupStatusRunResponse") } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getHealth",
    method: "get",
    path: "/api/health",
    summary: "Liveness probe",
    tags: ["Health"],
    successSchema: healthResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "The server is up. Does no database or Redis work.",
          content: { "application/json": { schema: componentRef("HealthResponse") } },
        },
      },
    },
  },
  {
    operationId: "getStorageOrphans",
    method: "get",
    path: "/api/system/storage/orphans",
    summary: "Latest orphan scan of the audio volume, paged",
    tags: ["System"],
    querySchema: orphansQuerySchema,
    successSchema: orphansResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "limit", in: "query", required: false, schema: { type: "integer", maximum: 500 } },
        { name: "files_offset", in: "query", required: false, schema: { type: "integer" } },
        { name: "tracks_offset", in: "query", required: false, schema: { type: "integer" } },
      ],
      responses: {
        "200": {
          description:
            "Audio files no track points at, and tracks pointing at missing files, from the last scan",
          content: { "application/json": { schema: componentRef("OrphansResponse") } },
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
    operationId: "startStorageOrphanScan",
    method: "post",
    path: "/api/system/storage/orphans/scan",
    summary: "Start an orphan scan in the background",
    tags: ["System"],
    successSchema: orphanScanStartResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "202": {
          description: "Scan started, or already running (`started` false)",
          content: { "application/json": { schema: componentRef("OrphanScanStartResponse") } },
        },
        "500": {
          description: "Server error",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
      },
    },
  },
  {
    operationId: "getStatus",
    method: "get",
    path: "/api/status",
    summary: "Reachability of the app and the services behind it",
    tags: ["Health"],
    successSchema: statusResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "One entry per probed service; a failed probe is reported, not thrown",
          content: { "application/json": { schema: componentRef("StatusResponse") } },
        },
      },
    },
  },
  {
    operationId: "getVersion",
    method: "get",
    path: "/api/version",
    summary: "Running version and build metadata",
    tags: ["Health"],
    successSchema: versionResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Version, commit sha, build time and node environment",
          content: { "application/json": { schema: componentRef("VersionResponse") } },
        },
      },
    },
  },
  {
    operationId: "getUpdateCheck",
    method: "get",
    path: "/api/update-check",
    summary: "Compare the running version with the latest GitHub release",
    tags: ["Health"],
    successSchema: updateCheckResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description:
            "Always 200; a GitHub failure is reported in `error` with `updateAvailable` false",
          content: { "application/json": { schema: componentRef("UpdateCheckResponse") } },
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
    successSchema: backupHealthResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Backup is healthy",
          content: { "application/json": { schema: componentRef("BackupHealthResponse") } },
        },
        "503": {
          description: "Backup is unhealthy or its status is unavailable",
          content: { "application/json": { schema: componentRef("BackupHealthResponse") } },
        },
      },
    },
  },
];

const genreUuid = { type: "string", format: "uuid" };

/** A genre `include_similar` added (#485): no track_count, since a search response isn't the genre page. */
const genreFilterRefObject = {
  type: "object",
  properties: {
    id: genreUuid,
    name: { type: "string" },
    slug: { type: "string" },
  },
  required: ["id", "name", "slug"],
};
const genreBodyObjects: Record<string, Record<string, unknown>> = {
  createGenre: componentRef("GenreCreateInput"),
  updateGenre: componentRef("GenreUpdateInput"),
  addGenreAlias: componentRef("GenreAliasInput"),
  mergeGenres: componentRef("GenreMergeInput"),
};
const genreResponseObjects: Record<string, Record<string, unknown>> = {
  createGenre: componentRef("Genre"),
  updateGenre: componentRef("Genre"),
  addGenreAlias: componentRef("GenreAliasResponse"),
  mergeGenres: componentRef("GenreMergeResponse"),
};

const genreMutationContracts: ApiContractRoute[] = (
  [
    {
      operationId: "createGenre",
      method: "post",
      path: "/api/genres",
      summary: "Create a custom genre under an existing parent",
      bodySchema: genreCreateBodySchema,
      successSchema: genreMutationResponseSchema,
    },
    {
      operationId: "updateGenre",
      method: "patch",
      path: "/api/genres/{id}",
      summary: "Rename or re-parent a genre; null parent moves it to the root",
      bodySchema: genreUpdateBodySchema,
      successSchema: genreMutationResponseSchema,
    },
    {
      operationId: "addGenreAlias",
      method: "post",
      path: "/api/genres/{id}/aliases",
      summary: "Add an alias without reassigning an existing alias",
      bodySchema: genreAliasBodySchema,
      successSchema: genreAliasResponseSchema,
    },
    {
      operationId: "mergeGenres",
      method: "post",
      path: "/api/genres/{id}/merge",
      summary: "Merge a genre into a survivor, moving children and aliases",
      bodySchema: genreMergeBodySchema,
      successSchema: genreMergeResponseSchema,
    },
  ] satisfies Array<
    Pick<
      ApiContractRoute,
      "operationId" | "method" | "path" | "summary" | "bodySchema" | "successSchema"
    >
  >
).map((operation): ApiContractRoute => {
  const hasId = operation.path.includes("{id}");
  const status =
    operation.operationId === "createGenre" || operation.operationId === "addGenreAlias"
      ? "201"
      : "200";
  return {
    ...operation,
    tags: ["Genres"],
    errorSchema: apiErrorSchema,
    paramsSchema: hasId ? genreParamsSchema : undefined,
    openapi: {
      parameters: hasId
        ? [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }]
        : [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: genreBodyObjects[operation.operationId],
            example:
              operation.operationId === "createGenre"
                ? { name: "Cumbia Dub", parent_id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47" }
                : operation.operationId === "updateGenre"
                  ? { name: "Cumbia Dub", parent_id: null }
                  : operation.operationId === "addGenreAlias"
                    ? { alias: "Cumbia-Dub" }
                    : { target_id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47" },
          },
        },
      },
      responses: {
        [status]: {
          description: "Genre mutation succeeded",
          content: { "application/json": { schema: genreResponseObjects[operation.operationId] } },
        },
        ...Object.fromEntries(
          [
            ["400", "Malformed request"],
            ["404", "Genre or parent not found"],
            ["409", "Name, slug, alias or tree conflict"],
            ["500", "Server error"],
          ].map(([code, description]) => [
            code,
            { description, content: { "application/json": { schema: errorResponseSchemaObject } } },
          ]),
        ),
      },
    },
  };
});

// ─── Genre reconciliation (#372) ─────────────────────────────────────────────

const proposalActionEnum = componentRef("GenreProposalAction");
const proposalMethodEnum = componentRef("GenreProposalMethod");
const proposalStatusEnum = componentRef("GenreProposalStatus");
const genreReconciliationRunSchemaObject = componentRef("GenreReconciliationRun");
const genreProposalSchemaObject = componentRef("GenreProposal");
const genreProposalSnapshotSchemaObject = componentRef("GenreProposalSnapshot");
const genreReconciliationCoverageSchemaObject = componentRef("GenreReconciliationCoverage");
const integer = { type: "integer" };

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
        content: {
          "application/json": {
            schema: componentRef("GenreReconciliationRunRequest"),
          },
        },
      },
      responses: {
        "202": {
          description: "Started; poll GET /api/genres/reconciliation/runs/{id}",
          content: { "application/json": { schema: genreReconciliationRunSchemaObject } },
        },
        "400": reconciliationError("Invalid request"),
        "409": {
          description: "A run is already in progress; it is returned as `run`",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { error: { type: "string" }, run: genreReconciliationRunSchemaObject },
                required: ["error", "run"],
              },
            },
          },
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
        "200": {
          description: "The run",
          content: { "application/json": { schema: genreReconciliationRunSchemaObject } },
        },
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
        {
          name: "friend_id",
          in: "query",
          required: false,
          description: "Only this friend's tracks",
          schema: { type: "integer", minimum: 1 },
        },
      ],
      responses: {
        "200": {
          description: "Coverage",
          content: { "application/json": { schema: genreReconciliationCoverageSchemaObject } },
        },
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
        {
          name: "min_tracks",
          in: "query",
          required: false,
          description: "Only values on at least this many tracks, as counted by the latest run",
          schema: { type: "integer", minimum: 0 },
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 500, default: 50 },
        },
        {
          name: "offset",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 0, default: 0 },
        },
      ],
      responses: {
        "200": {
          description: "A page of proposals and the total matching",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  proposals: { type: "array", items: genreProposalSchemaObject },
                  total: integer,
                },
                required: ["proposals", "total"],
              },
            },
          },
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
        content: {
          "application/json": {
            schema: componentRef("GenreProposalUpdate"),
            example: { action: "map", target_genres: ["Cumbia"] },
          },
        },
      },
      responses: {
        "200": {
          description: "The updated proposal",
          content: { "application/json": { schema: genreProposalSchemaObject } },
        },
        "400": reconciliationError(
          "Invalid change, an unknown genre, or an incomplete map/new_genre proposal",
        ),
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
        content: {
          "application/json": {
            schema: componentRef("GenreProposalApplyRequest"),
          },
        },
      },
      responses: {
        "200": {
          description: "What was written. Repeatable: a second apply adds only what is new.",
          content: {
            "application/json": {
              schema: componentRef("GenreProposalApplyResponse"),
            },
          },
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
        content: {
          "application/json": {
            schema: componentRef("GenreProposalDecisionRequest"),
            example: {
              decisions: [{ id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47", status: "accepted" }],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Each proposal after the decision, and its state before for undo",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  proposals: { type: "array", items: genreProposalSchemaObject },
                  previous: { type: "array", items: genreProposalSnapshotSchemaObject },
                },
                required: ["proposals", "previous"],
              },
            },
          },
        },
        "400": reconciliationError(
          "Invalid decision, an unknown genre, or an incomplete map/new_genre proposal; nothing written",
        ),
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
        content: {
          "application/json": {
            schema: componentRef("GenreProposalRestoreRequest"),
          },
        },
      },
      responses: {
        "200": {
          description: "How many proposals still existed and were restored",
          content: {
            "application/json": {
              schema: componentRef("GenreProposalRestoreResponse"),
            },
          },
        },
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
        {
          name: "friend_id",
          in: "query",
          required: false,
          description: "Only this friend's tracks",
          schema: { type: "integer", minimum: 1 },
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 20, default: 3 },
        },
      ],
      responses: {
        "200": {
          description: "Tracks whose local_tags contain the value",
          content: {
            "application/json": {
              schema: componentRef("GenreProposalTracksResponse"),
            },
          },
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
      description:
        "SQL-style filter expression. Multiple conditions joined with ' AND '. Supported values: 'local_audio_url IS NULL' (missing audio), '(bpm IS NULL OR key IS NULL)' (missing metadata), 'apple_music_url IS NULL' (missing Apple Music), 'youtube_url IS NULL' (missing YouTube), 'soundcloud_url IS NULL' (missing SoundCloud), '(apple_music_url IS NULL AND youtube_url IS NULL AND soundcloud_url IS NULL)' (missing all streaming URLs).",
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
  {
    name: "bpm_min",
    in: "query",
    required: false,
    schema: { type: "number" },
    description: "Minimum BPM, inclusive. Applied in every mode.",
  },
  {
    name: "bpm_max",
    in: "query",
    required: false,
    schema: { type: "number" },
    description: "Maximum BPM, inclusive. Must not be below bpm_min.",
  },
  {
    name: "key",
    in: "query",
    required: false,
    schema: { type: "string" },
    description:
      "Exact musical key, case-insensitive (e.g. 'A minor'). Enharmonic spellings are not merged.",
  },
  {
    name: "star_rating",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 0, maximum: 5 },
    description: "Minimum star rating.",
  },
  {
    name: "genre",
    in: "query",
    required: false,
    style: "form",
    explode: true,
    schema: { type: "array", items: { type: "string" }, maxItems: 20 },
    description:
      "Genre slug, id or name (a name resolves through aliases); repeat for several, which combine with OR. Each includes its subgenres, so 'latin' finds 'cumbia'. A track with genres of its own matches on those; one without falls back to its album's Discogs genres and styles. Applied in every mode. An unknown genre is a 400.",
  },
  {
    name: "include_similar",
    in: "query",
    required: false,
    schema: { type: "integer", enum: [0, 1], default: 0 },
    description:
      "Widen genre to each seed genre's top related genres from genre_similarity (#485), each expanded to its own subgenres too. The genres this added are named in the response's added_genres. Off by default: results are unchanged unless set.",
  },
  {
    name: "similar_limit",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 1 },
    description:
      "Per-seed cap on related genres pulled in when include_similar is set. Defaults to 5.",
  },
  {
    name: "similar_exclude",
    in: "query",
    required: false,
    style: "form",
    explode: true,
    schema: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 20 },
    description:
      "Related-genre ids to leave out of the widening even though include_similar is set — how the UI drops one of the added_genres chips.",
  },
];

// ─── Album artwork (#494) ────────────────────────────────────────────────────

const albumArtworkPathParams = [
  { name: "releaseId", in: "path", required: true, schema: { type: "string" } },
  { name: "friend_id", in: "query", required: true, schema: { type: "integer" } },
];

const jsonOk = (description: string, schema: Record<string, unknown>) => ({
  description,
  content: { "application/json": { schema } },
});

const albumArtworkContracts: ApiContractRoute[] = [
  {
    operationId: "getAlbumArtwork",
    method: "get",
    path: "/api/albums/{releaseId}/artwork",
    summary: "Get an album's artwork and where it came from",
    tags: ["Albums"],
    paramsSchema: albumReleaseParamsSchema,
    querySchema: albumFriendQuerySchema,
    successSchema: albumArtworkStateSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: albumArtworkPathParams,
      responses: {
        "200": jsonOk(
          "current_url is what views display. source is null until art is chosen (by a person or the bulk matcher).",
          ALBUM_ARTWORK_STATE_REF,
        ),
        "400": jsonError("Missing friend_id"),
        "404": jsonError("Album not found"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "applyAlbumArtwork",
    method: "put",
    path: "/api/albums/{releaseId}/artwork",
    summary: "Use the Apple Music art, or restore the Discogs art",
    tags: ["Albums"],
    paramsSchema: albumReleaseParamsSchema,
    querySchema: albumFriendQuerySchema,
    bodySchema: albumArtworkApplyBodySchema,
    successSchema: albumArtworkStateSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: albumArtworkPathParams,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { source: { type: "string", enum: ["apple_music", "discogs"] } },
              required: ["source"],
            },
            example: { source: "discogs" },
          },
        },
      },
      responses: {
        "200": jsonOk(
          "Applied to the album and its tracks. The image is cached locally under /uploads/album-covers.",
          ALBUM_ARTWORK_STATE_REF,
        ),
        "400": jsonError("Invalid source"),
        "404": jsonError("Album not found, no embedded art, or no Discogs art to restore"),
        "502": jsonError("Discogs artwork could not be downloaded"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "previewAlbumAppleMusicArtwork",
    method: "post",
    path: "/api/albums/{releaseId}/artwork/preview",
    summary: "Extract the Apple Music art for preview, without applying it",
    tags: ["Albums"],
    paramsSchema: albumReleaseParamsSchema,
    querySchema: albumFriendQuerySchema,
    successSchema: albumAppleMusicArtPreviewSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: albumArtworkPathParams,
      responses: {
        "200": jsonOk(
          "The embedded cover, cached locally, at full size",
          componentRef("AlbumAppleMusicArtPreview"),
        ),
        "400": jsonError("Missing friend_id"),
        "404": jsonError("Album not found, or no downloaded track has embedded art"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "uploadAlbumArtwork",
    method: "post",
    path: "/api/albums/{releaseId}/artwork/upload",
    summary: "Upload cover art for an album",
    tags: ["Albums"],
    paramsSchema: albumReleaseParamsSchema,
    querySchema: albumFriendQuerySchema,
    successSchema: albumArtworkStateSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: albumArtworkPathParams,
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: { cover_art: { type: "string", format: "binary" } },
              required: ["cover_art"],
            },
          },
        },
      },
      responses: {
        "200": jsonOk("Uploaded and applied", ALBUM_ARTWORK_STATE_REF),
        "400": jsonError("Missing, too large or unsupported image"),
        "404": jsonError("Album not found"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "matchAlbumArtwork",
    method: "post",
    path: "/api/albums/{releaseId}/artwork/match",
    summary: "Apply the Apple Music art only if it matches the Discogs art",
    tags: ["Albums"],
    paramsSchema: albumReleaseParamsSchema,
    querySchema: albumFriendQuerySchema,
    successSchema: albumArtMatchResultSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: albumArtworkPathParams,
      responses: {
        "200": jsonOk(
          "One album's step of the bulk matcher (called by download-worker). Covers are compared by perceptual hash; matched applies the Apple Music art, anything else is flagged for review.",
          componentRef("AlbumArtMatchResult"),
        ),
        "404": jsonError("Album not found"),
        "502": jsonError("Discogs artwork could not be downloaded"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "queueAlbumArtworkBackfill",
    method: "post",
    path: "/api/albums/artwork/backfill",
    summary: "Queue bulk artwork matching",
    tags: ["Albums"],
    bodySchema: albumArtworkBackfillBodySchema,
    successSchema: albumArtworkBackfillResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: componentRef("AlbumArtworkBackfillRequest"),
            example: { friend_id: 1 },
          },
        },
      },
      responses: {
        "200": jsonOk(
          "One job per album with downloaded audio whose art nobody has chosen and that has not been matched before",
          componentRef("AlbumArtworkBackfillResponse"),
        ),
        "400": jsonError("Invalid friend_id"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "listAlbumArtworkReview",
    method: "get",
    path: "/api/albums/artwork/review",
    summary: "List albums the artwork matcher flagged for review",
    tags: ["Albums"],
    querySchema: albumArtworkReviewQuerySchema,
    successSchema: albumArtworkReviewResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        { name: "friend_id", in: "query", required: false, schema: { type: "integer" } },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", default: 50, maximum: 200 },
        },
      ],
      responses: {
        "200": jsonOk(
          "Albums whose Apple Music art differs from, or had no, Discogs art",
          componentRef("AlbumArtworkReviewResponse"),
        ),
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
      },
    },
  },
];

export const apiContractRoutes: ApiContractRoute[] = [
  ...playerContracts,
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
              example: {
                genres: [
                  {
                    id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47",
                    name: "Latin",
                    slug: "latin",
                    parent_id: null,
                    source: "discogs",
                    track_count: 0,
                    album_count: 0,
                    children: [],
                  },
                ],
              },
              schema: componentRef("GenreTreeResponse"),
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
              schema: componentRef("GenrePageResponse"),
              example: {
                genre: {
                  id: "8c1d7f3e-2b6a-4d59-9f0e-3a7b5c2d1e40",
                  name: "Cumbia",
                  slug: "cumbia",
                  parent_id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47",
                  source: "discogs",
                  aliases: ["cumbia colombiana"],
                },
                ancestors: [
                  { id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47", name: "Latin", slug: "latin" },
                ],
                children: [],
                related: [
                  {
                    id: "1f6a2c9d-4e8b-4a3f-b7d1-5c0e9a8b7f62",
                    name: "Salsa",
                    slug: "salsa",
                    track_count: 253,
                    score: 1.42,
                    signals: { taxonomy: "sibling", npmi: 0.42, shared_albums: 7 },
                  },
                ],
                counts: { tracks: 412, albums: 108, tracks_total: 1029, albums_total: 108 },
                stats: {
                  bpm_min: 90,
                  bpm_max: 128,
                  added_this_year: 42,
                  year: 2026,
                  playable_tracks: 500,
                  bpm_histogram: [{ min: 90, max: 100, count: 12 }],
                },
                top_tracks: [
                  {
                    track_id: "33415451-A1",
                    friend_id: 6,
                    title: "La Danza De Los Mirlos",
                    artist: "Los Mirlos",
                    album: "La Danza De Los Mirlos",
                    play_count: 4,
                    hasVectors: true,
                  },
                ],
                top_albums: [
                  {
                    release_id: "33415451",
                    friend_id: 6,
                    title: "La Danza De Los Mirlos",
                    artist: "Los Mirlos",
                    play_count: 12,
                  },
                ],
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
    operationId: "getSimilarGenres",
    method: "get",
    path: "/api/genres/{id}/similar",
    summary:
      "A genre's ranked similar genres (#377): taxonomy plus collection co-occurrence, with the signals that explain each one",
    tags: ["Genres"],
    successSchema: genreSimilarResponseSchema,
    querySchema: genreSimilarQuerySchema,
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
          name: "limit",
          in: "query",
          required: false,
          description:
            "Maximum related genres to return; fewer may be available (the stored ranking contains up to 20 per genre)",
          schema: { type: "integer", minimum: 1, default: 20 },
        },
      ],
      responses: {
        "400": jsonError("Invalid query parameters"),
        "200": {
          description:
            "Computed over every collection; falls back to taxonomy siblings until the table has rows for this genre",
          content: {
            "application/json": {
              schema: componentRef("GenreSimilarResponse"),
              example: {
                genre: {
                  id: "8c1d7f3e-2b6a-4d59-9f0e-3a7b5c2d1e40",
                  name: "Cumbia",
                  slug: "cumbia",
                  track_count: 412,
                },
                related: [
                  {
                    id: "1f6a2c9d-4e8b-4a3f-b7d1-5c0e9a8b7f62",
                    name: "Salsa",
                    slug: "salsa",
                    track_count: 253,
                    score: 1.42,
                    signals: { taxonomy: "sibling", npmi: 0.42, shared_albums: 7 },
                  },
                ],
              },
            },
          },
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
            "application/json": { schema: componentRef("FriendListResponse") },
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
          "application/json": { schema: componentRef("FriendCreate") },
        },
      },
      responses: {
        "200": {
          description: "Friend added",
          content: {
            "application/json": { schema: componentRef("FriendCreateResponse") },
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
          content: { "application/json": { schema: componentRef("JobsListResponse") } },
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
          content: { "application/json": { schema: componentRef("JobsClearResponse") } },
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
          content: { "application/json": { schema: componentRef("JobDetails") } },
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
    operationId: "getJobLogs",
    method: "get",
    path: "/api/jobs/{jobId}/logs",
    summary: "Get worker log lines for a job (a status summary when none were buffered)",
    tags: ["Jobs"],
    successSchema: jobLogsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: buildPathParameters("/api/jobs/{jobId}/logs"),
      responses: {
        "200": {
          description: "Log lines, oldest first",
          content: { "application/json": { schema: componentRef("JobLogsResponse") } },
        },
        "400": jsonError("Missing job id"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "reportJobOutcome",
    method: "post",
    path: "/api/jobs/{jobId}/outcome",
    summary: "download-worker announcing that a job has ended, for analytics",
    tags: ["Jobs"],
    successSchema: jobOutcomeResponseSchema,
    errorSchema: apiErrorSchema,
    // No body: the job's record in Redis is authoritative (#345).
    openapi: {
      parameters: buildPathParameters("/api/jobs/{jobId}/outcome"),
      responses: {
        "200": {
          description: "Whether this call recorded the outcome",
          content: { "application/json": { schema: componentRef("JobOutcomeResponse") } },
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
            "Server-sent events stream used by the UI to react to completed/failed jobs without polling. Initial event data is `connected`; every later `data:` payload is a `JobEvent`.",
          content: {
            "text/event-stream": {
              schema: {
                type: "string",
                example:
                  'data: connected\\n\\ndata: {"type":"job_completed","job_id":"123","track_id":"abc","friend_id":1,"timestamp":1710000000000}\\n\\n',
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
              schema: componentRef("GamdlCookieUploadResponse"),
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
    bodySchema: gamdlActionRequestSchema,
    successSchema: gamdlActionResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: componentRef("GamdlActionRequest"),
          },
        },
      },
      responses: {
        "200": {
          description: "Action result",
          content: {
            "application/json": {
              schema: componentRef("GamdlActionResponse"),
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
              schema: componentRef("GamdlSettingsResponse"),
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
            schema: componentRef("GamdlSettingsUpdate"),
          },
        },
      },
      responses: {
        "200": {
          description: "GAMDL settings updated",
          content: {
            "application/json": {
              schema: componentRef("GamdlSettingsUpdateResponse"),
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
              schema: componentRef("BackupStatusGetResponse"),
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
              schema: componentRef("BackupPolicyGetResponse"),
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
            schema: componentRef("BackupPolicyUpdate"),
          },
        },
      },
      responses: {
        "200": {
          description: "Backup policy updated",
          content: {
            "application/json": {
              schema: componentRef("BackupPolicyPutResponse"),
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
              schema: componentRef("BackupCreateResponse"),
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
              schema: componentRef("BackupCreateResponse"),
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
              schema: { type: "array", items: { $ref: "#/components/schemas/Playlist" } },
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
            schema: { $ref: "#/components/schemas/PlaylistCreate" },
          },
        },
      },
      responses: {
        "201": {
          description: "Playlist created",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/Playlist" } },
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
            schema: { $ref: "#/components/schemas/PlaylistUpdate" },
          },
        },
      },
      responses: {
        "200": {
          description: "Playlist updated",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/Playlist" } },
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
    successSchema: playlistDeleteResponseSchema,
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
              schema: { $ref: "#/components/schemas/PlaylistDeleteResponse" },
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
              schema: { $ref: "#/components/schemas/PlaylistDetail" },
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
            schema: { $ref: "#/components/schemas/PlaylistSpinsInput" },
          },
        },
      },
      responses: {
        "200": {
          description: "Playlist spins logged (or skipped when already present)",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/PlaylistSpinsResult" } },
          },
        },
        "400": {
          description: "Invalid timestamp, derivation, or playlist contents",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "404": {
          description: "Playlist or performance not found",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
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
    bodySchema: method === "put" ? liveSetUpdateBodySchema : undefined,
    successSchema:
      method === "get"
        ? liveSetResponseSchema
        : method === "delete"
          ? liveSetDeleteSchema
          : liveSetMutationSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      ...(method === "put"
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/LiveSetUpdate" } },
              },
            },
          }
        : {}),
      responses: {
        [method === "post" ? "201" : "200"]: {
          description: "Set operation completed",
          content: {
            "application/json": {
              schema:
                method === "get"
                  ? { $ref: "#/components/schemas/LiveSet" }
                  : method === "delete"
                    ? { $ref: "#/components/schemas/LiveSetDeleteResponse" }
                    : { $ref: "#/components/schemas/LiveSetMutationResponse" },
            },
          },
        },
        "404": {
          description: "Playlist or set not found",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
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
            schema: { $ref: "#/components/schemas/PlaylistGeneticRequest" },
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
              schema: { $ref: "#/components/schemas/PlaylistGeneticResponse" },
            },
          },
        },
        "400": {
          description: "Invalid track data for optimization",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PlaylistGeneticValidationError" },
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
        (parameter) =>
          ![
            "limit",
            "offset",
            "genre",
            "include_similar",
            "similar_limit",
            "similar_exclude",
          ].includes(parameter.name as string),
      ),
      responses: {
        "200": {
          description:
            "Per genre, the tracks adding that genre to the search would return: subgenres included, each track once, largest first. Takes /api/tracks/search's parameters; `genre`, `limit` and `offset` are ignored, so picking a genre leaves the others' counts in view. Genres with no tracks are omitted. Keyword search only: semantic or hybrid with words is a 400.",
          content: {
            "application/json": {
              example: {
                genres: [{ id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47", track_count: 113 }],
              },
              schema: componentRef("TrackGenreFacetsResponse"),
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
                  hits: { type: "array", items: TRACK_REF },
                  mode: {
                    type: "string",
                    enum: ["lexical", "semantic", "hybrid"],
                    description: "The mode that ranked hits; omitted for a plain lexical request.",
                  },
                  degraded: {
                    type: "boolean",
                    description:
                      "Hybrid fell back to lexical results because the semantic leg failed.",
                  },
                  added_genres: {
                    type: "array",
                    items: genreFilterRefObject,
                    description:
                      "Genres include_similar added beyond the plain genre filter (#485); omitted when it added nothing.",
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
          description:
            "Select retrieval mode. `combined` unions both embeddings, `identity` only identity embedding, `audio` only audio vibe embedding.",
        },
        {
          name: "limit_identity",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 0, maximum: 1000, default: 200 },
          description:
            "Maximum candidates from identity embedding search. Ignored when `mode=audio`.",
        },
        {
          name: "limit_audio",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 0, maximum: 1000, default: 200 },
          description:
            "Maximum candidates from audio vibe embedding search. Ignored when `mode=identity`.",
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
          description:
            "The library `scope=library` keeps to, and whose saved setting applies. Defaults to `friend_id`.",
        },
      ],
      responses: {
        "200": {
          description: "Recommendation candidates",
          content: {
            "application/json": {
              schema: componentRef("RecommendationsResponse"),
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
          "application/json": { schema: componentRef("RecommendationsBatchRequest") },
        },
      },
      responses: {
        "200": {
          description: "Recommendation candidates",
          content: {
            "application/json": {
              schema: componentRef("RecommendationsResponse"),
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
    operationId: "listLibraries",
    method: "get",
    path: "/api/friends/libraries",
    summary:
      "List libraries with album counts, last sync and which is the server's Discogs account",
    tags: ["Friends"],
    successSchema: librariesListResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description: "Libraries, the server's own account first",
          content: {
            "application/json": { schema: componentRef("LibrariesListResponse") },
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
            "application/json": { schema: componentRef("DefaultLibrarySettings") },
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
          "application/json": { schema: componentRef("DefaultLibrarySettingsUpdate") },
        },
      },
      responses: {
        "200": {
          description: "Default library updated",
          content: {
            "application/json": { schema: componentRef("DefaultLibrarySettingsUpdateResponse") },
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
              schema: componentRef("AiPromptSettings"),
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
            schema: componentRef("AiPromptSettingsUpdate"),
          },
        },
      },
      responses: {
        "200": {
          description: "AI prompt updated",
          content: {
            "application/json": {
              schema: componentRef("AiPromptSettingsUpdateResponse"),
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
    operationId: "getAppearanceSettings",
    method: "get",
    path: "/api/settings/appearance",
    summary: "Get the app-wide palette, corners and fonts",
    tags: ["Settings"],
    successSchema: appearanceSettingsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      responses: {
        "200": {
          description:
            "The palette and the display, body and label fonts every device renders with. An unset or unknown stored id is reported as the default. Light/dark mode is per device and not part of this setting.",
          content: {
            "application/json": {
              schema: componentRef("AppearanceSettings"),
              examples: { appearance: { summary: "Default", value: appearanceExample } },
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
    operationId: "updateAppearanceSettings",
    method: "put",
    path: "/api/settings/appearance",
    summary: "Set the app-wide palette, corners and fonts",
    tags: ["Settings"],
    bodySchema: appearanceSettingsPutBodySchema,
    successSchema: appearanceSettingsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: componentRef("AppearanceSettingsUpdate"),
            examples: {
              fontOnly: {
                summary: "Change one font; the rest stay",
                value: { fonts: { body: "inter" } },
              },
              cornersOnly: { summary: "Round the corners", value: { corners: "rounded" } },
              paletteOnly: { summary: "Change the palette only", value: { palette: "riso" } },
              custom: {
                summary: "Save a custom palette and use it",
                value: {
                  palette: "custom",
                  customPalette: {
                    base: "sleeve",
                    light: {
                      ground: "#f4ede0",
                      surface: "#fbf7ee",
                      ink: "#1f1a17",
                      accent: "#c8321a",
                      shadow: "#4a3a2e",
                    },
                    dark: {
                      ground: "#17130f",
                      surface: "#221c17",
                      ink: "#f2eadc",
                      accent: "#e8573a",
                      shadow: "#6e5f50",
                    },
                  },
                },
              },
              deleteCustom: {
                summary: "Delete the custom palette",
                value: { customPalette: null },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Saved",
          content: {
            "application/json": {
              schema: componentRef("AppearanceSettings"),
              examples: { appearance: { summary: "Saved", value: appearanceExample } },
            },
          },
        },
        "400": {
          description:
            "Unknown palette or font id, an invalid custom palette (colours must be #rrggbb), or `custom` with none saved",
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
    operationId: "getRecommendationSettings",
    method: "get",
    path: "/api/settings/recommendations",
    summary: "Get a library's track suggestion scope",
    tags: ["Settings"],
    querySchema: recommendationSettingsQuerySchema,
    successSchema: recommendationSettingsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [{ name: "friend_id", in: "query", required: true, schema: { type: "integer" } }],
      responses: {
        "200": {
          description:
            "Where this library's suggestions come from: `library` (its own tracks) or `all` (every library). `isDefault` is true when it has never been set.",
          content: {
            "application/json": {
              schema: componentRef("RecommendationSettings"),
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
            schema: componentRef("RecommendationSettingsUpdate"),
          },
        },
      },
      responses: {
        "200": {
          description: "Saved",
          content: {
            "application/json": {
              schema: componentRef("RecommendationSettings"),
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
        { name: "track_id", in: "query", required: true, schema: { type: "string" } },
        { name: "username", in: "query", required: false, schema: { type: "string" } },
        { name: "friend_id", in: "query", required: false, schema: { type: "integer" } },
      ],
      responses: {
        "200": jsonOk("Discogs lookup result", componentRef("DiscogsLookupResponse")),
        "400": jsonError("Missing or invalid query parameter"),
        "404": jsonError("Discogs release file not found"),
        "500": jsonError("Server error"),
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
          "application/json": { schema: componentRef("ProviderYouTubeMusicSearchRequest") },
        },
      },
      responses: {
        "200": jsonOk("YouTube matches", componentRef("ProviderYouTubeMusicSearchResponse")),
        "500": jsonError("Provider or server error"),
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
          "application/json": { schema: componentRef("ProviderAppleMusicSearchRequest") },
        },
      },
      responses: {
        "200": jsonOk("Apple Music matches", componentRef("ProviderAppleMusicSearchResponse")),
        "500": jsonError("Provider or server error"),
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
        content: { "application/json": { schema: componentRef("ProviderTrackMetadataRequest") } },
      },
      responses: {
        "200": jsonOk("Generated metadata", componentRef("ProviderTrackMetadataResponse")),
        "400": jsonError("Invalid prompt payload"),
        "500": jsonError("Provider or server error"),
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
        {
          name: "sort",
          in: "query",
          required: false,
          schema: { type: "string", default: "created_at:desc" },
        },
        { name: "friend_id", in: "query", required: false, schema: { type: "integer" } },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 0, default: 20 },
          description: "Page size. A value that is not a non-negative integer is a 400.",
        },
        {
          name: "offset",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 0, default: 0 },
          description: "Rows to skip. A value that is not a non-negative integer is a 400.",
        },
        {
          name: "missing_library_identifier",
          in: "query",
          required: false,
          schema: {
            type: "integer",
            enum: [1],
            description: "Filter albums missing a library identifier",
          },
        },
        {
          name: "missing_local_cover_art_url",
          in: "query",
          required: false,
          schema: {
            type: "integer",
            enum: [1],
            description: "Filter albums missing local cover art",
          },
        },
        {
          name: "missing_audio",
          in: "query",
          required: false,
          schema: {
            type: "integer",
            enum: [1],
            description: "Filter albums with at least one track missing local audio",
          },
        },
        {
          name: "genre",
          in: "query",
          required: false,
          style: "form",
          explode: true,
          schema: { type: "array", items: { type: "string" }, maxItems: 20 },
          description:
            "Genre slug, id or name (a name resolves through aliases); repeat for several, which combine with OR. Each includes its subgenres. An album matches on its own Discogs genres and styles, or on any of its tracks' genres. An unknown genre is a 400.",
        },
        {
          name: "include_similar",
          in: "query",
          required: false,
          schema: { type: "integer", enum: [0, 1], default: 0 },
          description:
            "Widen genre to each seed genre's top related genres from genre_similarity (#485), each expanded to its own subgenres too. The genres this added are named in the response's added_genres. Off by default: results are unchanged unless set.",
        },
        {
          name: "similar_limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1 },
          description:
            "Per-seed cap on related genres pulled in when include_similar is set. Defaults to 5.",
        },
        {
          name: "similar_exclude",
          in: "query",
          required: false,
          style: "form",
          explode: true,
          schema: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 20 },
          description:
            "Related-genre ids to leave out of the widening even though include_similar is set — how the UI drops one of the added_genres chips.",
        },
      ],
      responses: {
        "200": jsonOk("Albums search result", componentRef("AlbumSearchResponse")),
        "400": {
          description: "limit or offset is not a non-negative integer, or a genre is unknown",
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
        "200": jsonOk(
          "Normalized playable album structure",
          componentRef("AlbumPlayableStructure"),
        ),
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
        "200": jsonOk("Album detail", componentRef("AlbumDetail")),
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
    operationId: "deleteAlbum",
    method: "delete",
    path: "/api/albums/{releaseId}",
    summary:
      "Hard-delete an album and its tracks. For a Discogs-origin album, the next " +
      "full sync re-adds it unless it's also removed from the Discogs collection.",
    tags: ["Albums"],
    paramsSchema: albumReleaseParamsSchema,
    querySchema: albumFriendQuerySchema,
    successSchema: albumDeleteResponseSchema,
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
        "200": jsonOk("Album deleted", componentRef("AlbumDeleteResponse")),
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
            schema: componentRef("AlbumUpdateRequest"),
          },
        },
      },
      responses: {
        "200": jsonOk("Album updated", componentRef("AlbumUpdateResponse")),
        "400": {
          description:
            "Body is not valid JSON, release_id or friend_id is missing, a field has the wrong type, library_identifier is over 50 characters, an override is malformed or unknown, or there is nothing to update",
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
        "200": jsonOk("Album created", componentRef("AlbumCreateResponse")),
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
                album: {
                  type: "string",
                  description:
                    "JSON album payload. genre_override_ids/style_override_ids accept taxonomy UUID arrays, null resets, omitted preserves. Legacy genres/styles names are replacements; imported source values are preserved.",
                },
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
        "200": jsonOk("Album upserted", componentRef("AlbumUpsertResponse")),
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
        "200": jsonOk("Discogs raw payload", componentRef("AlbumDiscogsRawResponse")),
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
        "200": jsonOk("Downloads queued", componentRef("AlbumDownloadResult")),
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
        friendIdQueryParam,
        { name: "release_id", in: "query", required: false, schema: { type: "string" } },
        { name: "track_id", in: "query", required: false, schema: { type: "string" } },
        {
          name: "from",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
        },
        {
          name: "to",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
        },
        ...pagingParams,
        {
          name: "medium",
          in: "query",
          required: false,
          description: "Omit for both media",
          schema: { type: "string", enum: ["vinyl", "digital"] },
        },
        {
          name: "cursor",
          in: "query",
          required: false,
          description:
            "Opaque keyset cursor: the previous page's `next_cursor`. A malformed cursor, or one combined with a non-zero `offset`, is a 400.",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Spin session list",
          content: { "application/json": { schema: componentRef("SpinListResponse") } },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
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
        description: "Provide exactly one of side_keys or track_refs, and not an empty list.",
        content: { "application/json": { schema: componentRef("SpinCreateInput") } },
      },
      responses: {
        "200": {
          description: "Spin session created",
          content: { "application/json": { schema: componentRef("SpinCreateResponse") } },
        },
        "400": jsonError("Invalid payload"),
        "404": jsonError("Album not found"),
        "500": jsonError("Server error"),
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
        content: { "application/json": { schema: componentRef("SpinAggregateRequest") } },
      },
      responses: {
        "200": {
          description: "Totals across every source aggregated, per source and overall",
          content: { "application/json": { schema: componentRef("SpinAggregateResult") } },
        },
        "400": jsonError("Invalid payload"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "getHome",
    method: "get",
    path: "/api/home",
    summary: "Home summary",
    tags: ["Home"],
    querySchema: homeQuerySchema,
    successSchema: homeResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [friendIdQueryParam],
      responses: {
        "200": {
          description: "Home summary",
          content: { "application/json": { schema: componentRef("HomeResponse") } },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "getSpinRecap",
    method: "get",
    path: "/api/spins/recap",
    summary: "Monthly listening recap in the configured time zone",
    tags: ["Spins"],
    querySchema: spinRecapQuerySchema,
    successSchema: spinRecapResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        friendIdQueryParam,
        {
          name: "month",
          in: "query",
          required: true,
          schema: { type: "string", pattern: "^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$" },
        },
      ],
      responses: {
        "200": {
          description: "Monthly recap",
          content: { "application/json": { schema: componentRef("SpinRecapResponse") } },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
      },
    },
  },
  {
    operationId: "getSpinTrackStats",
    method: "get",
    path: "/api/spins/track-stats",
    summary: "How often one track has been spun, across vinyl and digital",
    tags: ["Spins"],
    querySchema: spinTrackStatsQuerySchema,
    successSchema: spinTrackStatsResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        friendIdQueryParam,
        { name: "track_id", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Play count and last play",
          content: { "application/json": { schema: componentRef("SpinTrackStatsResponse") } },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
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
        friendIdQueryParam,
        { name: "release_id", in: "query", required: false, schema: { type: "string" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20 } },
        { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
      ],
      responses: {
        "200": {
          description: "Most-played vinyl tracks",
          content: { "application/json": { schema: componentRef("SpinTopTracksResponse") } },
        },
        "400": jsonError("Invalid query"),
        "500": jsonError("Server error"),
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
      parameters: [integerIdParam],
      requestBody: {
        required: true,
        description:
          "Change when a spin was played, its note or context, or what was played. A new selection (side_keys or track_refs) replaces the old one and its track events. Provide at most one of side_keys or track_refs, and at least one change besides friend_id. Editing a spin the listener detected keeps its provenance and sets corrected_at.",
        content: { "application/json": { schema: componentRef("SpinUpdateInput") } },
      },
      responses: {
        "200": {
          description: "The edited spin session",
          content: { "application/json": { schema: componentRef("SpinSessionDetail") } },
        },
        "400": jsonError("Invalid request, or a selection that does not fit the album"),
        "404": jsonError("Session or album not found"),
        "500": jsonError("Server error"),
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
      parameters: [integerIdParam, friendIdQueryParam],
      responses: {
        "200": {
          description: "Spin session deleted",
          content: { "application/json": { schema: componentRef("SpinDeleteResponse") } },
        },
        "400": jsonError("Invalid request"),
        "404": jsonError("Session not found"),
        "500": jsonError("Server error"),
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
    operationId: "lookupDiscogsUser",
    method: "get",
    path: "/api/discogs/users/{username}",
    summary:
      "Check a Discogs username before adding it as a library (one Discogs request; an unknown user or private collection is not found)",
    tags: ["Discogs"],
    successSchema: discogsUserLookupResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
        {
          name: "username",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^[A-Za-z0-9._-]+$", maxLength: 100 },
        },
      ],
      responses: {
        "200": {
          description: "Whether the user exists, and their collection's release count",
          content: {
            "application/json": { schema: componentRef("DiscogsUserLookupResponse") },
          },
        },
        "400": {
          description: "Invalid username",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "500": {
          description: "Discogs credentials not set",
          content: { "application/json": { schema: errorResponseSchemaObject } },
        },
        "502": {
          description: "Discogs returned an error other than not found",
          content: { "application/json": { schema: errorResponseSchemaObject } },
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
        content: { "application/json": { schema: componentRef("DiscogsDeleteReleasesRequest") } },
      },
      responses: {
        "200": jsonOk("Release delete summary", componentRef("DiscogsDeleteReleasesResponse")),
        "400": jsonError("Invalid request body"),
        "500": jsonError("Server error"),
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
              schema: componentRef("ManifestVerificationResponse"),
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
              schema: componentRef("ManifestCleanupResponse"),
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
  ...recordCareSessionContracts,
  ...albumArtworkContracts,
];
