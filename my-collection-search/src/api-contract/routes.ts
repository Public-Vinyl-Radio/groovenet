import { z } from "zod";
import {
  aiPromptSettingsGetResponseSchema,
  aiPromptSettingsPutBodySchema,
  aiPromptSettingsPutResponseSchema,
  aiPromptSettingsQuerySchema,
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
  embeddingPromptSettingsGetResponseSchema,
  embeddingPromptSettingsPutBodySchema,
  embeddingPromptSettingsPutResponseSchema,
  embeddingPromptSettingsQuerySchema,
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
  queueAlbumDownloadsResponseSchema,
  recommendationsQuerySchema,
  recommendationsBatchBodySchema,
  recommendationsResponseSchema,
  spinCreateBodySchema,
  spinCreateResponseSchema,
  spinDeleteQuerySchema,
  spinDeleteResponseSchema,
  spinListQuerySchema,
  spinListResponseSchema,
  spinTopTracksQuerySchema,
  spinTopTracksResponseSchema,
  spinSessionParamsSchema,
  trackSearchGetQuerySchema,
  trackSearchGetResponseSchema,
} from "@/api-contract/schemas";

export type HttpMethod = "get" | "post" | "patch" | "put" | "delete";

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
    local_audio_url: { type: ["string", "null"] },
    audio_file_album_art_url: { type: ["string", "null"] },
    library_identifier: { type: ["string", "null"] },
  },
  required: ["track_id", "friend_id"],
  additionalProperties: true,
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

function exampleFromSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return "example";
  const s = schema as Record<string, unknown>;

  if (s.example !== undefined) return s.example;

  if (Array.isArray(s.oneOf) && s.oneOf.length > 0) {
    return exampleFromSchema(s.oneOf[0]);
  }

  const type = s.type;
  if (type === "string") return "string";
  if (type === "integer") return 1;
  if (type === "number") return 1.23;
  if (type === "boolean") return true;
  if (Array.isArray(type) && type.length > 0) {
    const first = type.find((t) => t !== "null") ?? type[0];
    return exampleFromSchema({ ...s, type: first });
  }
  if (type === "array") {
    return [exampleFromSchema(s.items)];
  }
  if (type === "object") {
    const properties =
      s.properties && typeof s.properties === "object"
        ? (s.properties as Record<string, unknown>)
        : undefined;
    if (properties && Object.keys(properties).length > 0) {
      const obj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(properties)) {
        obj[key] = exampleFromSchema(value);
      }
      return obj;
    }
    if (s.additionalProperties) {
      const additional =
        s.additionalProperties === true ? { type: "string" } : s.additionalProperties;
      return { exampleKey: exampleFromSchema(additional) };
    }
    return {};
  }

  return "example";
}

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
                  "When true, include normalized vector data in `_vectors.default`. Omitted by default to keep payloads small.",
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
        schema: { type: "string", enum: ["prompt", "identity", "audio_vibe"], default: "prompt" },
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
                    type: { type: "string", enum: ["prompt"] },
                    track_id: { type: "string" },
                    friend_id: { type: "integer" },
                    isDefaultTemplate: { type: "boolean" },
                    template: { type: "string" },
                    prompt: { type: "string" },
                  },
                  required: ["type", "track_id", "friend_id", "isDefaultTemplate", "template", "prompt"],
                },
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
    reason: { type: "string" },
    backed_up_paths: { type: "array", items: { type: "string" } },
    snapshot: { type: ["object", "null"], additionalProperties: true },
    error: { type: "string" },
    missing_env: { type: "array", items: { type: "string" } },
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
          description: "Backup filenames, newest first",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { files: { type: "array", items: { type: "string" } } },
                required: ["files"],
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
    operationId: "restoreDatabase",
    method: "post",
    path: "/api/restore",
    summary: "Restore the database from an uploaded backup file",
    tags: ["Backups"],
    successSchema: z.unknown(),
    errorSchema: apiErrorSchema,
    openapi: {
      requestBody: {
        required: true,
        content: {
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

export const apiContractRoutes: ApiContractRoute[] = [
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
                  id: { type: "string" },
                  name: { type: "string" },
                  state: { type: "string" },
                  queue: { type: "string" },
                  data: { type: "object", additionalProperties: true },
                  progress: { type: "number" },
                  returnvalue: {
                    type: ["object", "array", "string", "number", "boolean", "null"],
                  },
                  finishedOn: { type: "number" },
                  processedOn: { type: "number" },
                  failedReason: { type: "string" },
                  attemptsMade: { type: "integer" },
                  delay: { type: "number" },
                  timestamp: { type: "number" },
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
                      audio_quality: { type: "string" },
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
                audio_quality: { type: "string" },
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
                          reason: { type: "string" },
                          backed_up_paths: {
                            type: "array",
                            items: { type: "string" },
                          },
                          snapshot: {
                            anyOf: [
                              {
                                type: "object",
                                properties: {
                                  id: { type: "string" },
                                  short_id: { type: "string", nullable: true },
                                  time: { type: "string" },
                                  hostname: { type: "string", nullable: true },
                                  paths: {
                                    type: "array",
                                    items: { type: "string" },
                                  },
                                  tags: {
                                    type: "array",
                                    items: { type: "string" },
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
                            items: { type: "string" },
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
    summary: "Create database backup (plain SQL format)",
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
                },
                required: ["message"],
              },
            },
          },
        },
        "404": {
          description: "Database file not found (file-copy fallback)",
          content: {
            "application/json": { schema: errorResponseSchemaObject },
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
    summary: "Create database backup (pg_dump custom format)",
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
                      embedding: {
                        oneOf: [
                          { type: "string" },
                          { type: "array", items: { type: "number" } },
                          { type: "null" },
                        ],
                      },
                      _vectors: {
                        type: "object",
                        properties: {
                          default: { type: "array", items: { type: "number" } },
                        },
                        additionalProperties: true,
                      },
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
    operationId: "searchTracksQuery",
    method: "get",
    path: "/api/tracks/search",
    summary: "Search tracks (query params)",
    tags: ["Tracks"],
    querySchema: trackSearchGetQuerySchema,
    successSchema: trackSearchGetResponseSchema,
    errorSchema: apiErrorSchema,
    openapi: {
      parameters: [
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
      ],
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
                  candidates: { type: "array", items: recommendationCandidateSchemaObject },
                  stats: { type: "object", additionalProperties: true },
                },
                required: ["seedTrackId", "seedFriendId", "seedEmbeddings", "candidates", "stats"],
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
                  candidates: { type: "array", items: recommendationCandidateSchemaObject },
                  stats: { type: "object", additionalProperties: true },
                },
                required: ["seedTrackId", "seedFriendId", "seedEmbeddings", "candidates", "stats"],
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
    operationId: "getEmbeddingPromptSettings",
    method: "get",
    path: "/api/settings/embedding-prompt",
    summary: "Get track embedding prompt settings",
    tags: ["Settings"],
    querySchema: embeddingPromptSettingsQuerySchema,
    successSchema: embeddingPromptSettingsGetResponseSchema,
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
          description: "Embedding prompt settings",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  template: { type: "string" },
                  defaultTemplate: { type: "string" },
                  isDefault: { type: "boolean" },
                },
                required: ["template", "defaultTemplate", "isDefault"],
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
    operationId: "updateEmbeddingPromptSettings",
    method: "put",
    path: "/api/settings/embedding-prompt",
    summary: "Update track embedding prompt settings",
    tags: ["Settings"],
    bodySchema: embeddingPromptSettingsPutBodySchema,
    successSchema: embeddingPromptSettingsPutResponseSchema,
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
                template: { type: "string" },
              },
              required: ["friend_id"],
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Embedding prompt updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  template: { type: "string" },
                  isDefault: { type: "boolean" },
                },
                required: ["template", "isDefault"],
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
                  genre: { type: "string" },
                  notes: { type: "string" },
                },
                additionalProperties: true,
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
                  deletedFiles: { type: "array", items: { type: "string" } },
                  failedDeletes: { type: "array", items: { type: "string" } },
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
  ...backupContracts,
];
