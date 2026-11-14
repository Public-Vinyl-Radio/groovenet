import { z } from "zod";
import type { ApiContractRoute } from "./routes";
import {
  rankingActiveResponseSchema,
  rankingActiveUpdateBodySchema,
  rankingProfileCopyBodySchema,
  rankingProfileCreateBodySchema,
  rankingProfileDeleteResponseSchema,
  rankingProfileEntrySchema,
  rankingProfileSchema,
  rankingProfilesListQuerySchema,
  rankingProfilesResponseSchema,
  rankingProfileUpdateBodySchema,
} from "./schemas";
import { PRESET_LIST, RANKING_PRESETS } from "@/lib/ranking/profiles";

// Ranking profiles (#1192): presets, a library's own profiles and the one
// active per surface. Components come from `rankingJsonSchemas`.

const error = z.object({ error: z.string() });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (name: string, example?: unknown) => ({
  "application/json": { schema: ref(name), ...(example === undefined ? {} : { example }) },
});
const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { error: { type: "string" }, details: { type: "object" } },
        required: ["error"],
      },
    },
  },
});
const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "A preset id (`default`, `beatmatcher`, `selector`) or a stored profile's id.",
};

const stored = { ...RANKING_PRESETS.selector, id: "17", kind: "custom", name: "Warm-up" };
const { id: _id, kind: _kind, ...draftExample } = stored;
void _id;
void _kind;
const active = { suggestions: "beatmatcher", related: "default", recommendations: "17" };

export const rankingProfileContracts: ApiContractRoute[] = [
  {
    operationId: "listRankingProfiles",
    method: "get",
    path: "/api/ranking/profiles",
    summary: "List the presets and a library's ranking profiles, and the one active per surface",
    tags: ["Ranking"],
    querySchema: rankingProfilesListQuerySchema,
    successSchema: rankingProfilesResponseSchema,
    errorSchema: error,
    openapi: {
      parameters: [{ name: "friend_id", in: "query", required: true, schema: { type: "integer" } }],
      responses: {
        "200": {
          description:
            "Presets first, then the library's profiles. A stored profile that no longer parses is listed with `invalid: true` and Default's config, and ranks as Default.",
          content: json("RankingProfilesResponse", {
            friend_id: 1,
            profiles: [...PRESET_LIST, stored],
            active,
          }),
        },
        "400": errorResponse("friend_id is missing"),
      },
    },
  },
  {
    operationId: "createRankingProfile",
    method: "post",
    path: "/api/ranking/profiles",
    summary: "Store a new ranking profile for a library",
    tags: ["Ranking"],
    bodySchema: rankingProfileCreateBodySchema,
    successSchema: rankingProfileSchema,
    errorSchema: error,
    openapi: {
      requestBody: {
        required: true,
        content: json("RankingProfileCreateRequest", { friend_id: 1, profile: draftExample }),
      },
      responses: {
        "201": { description: "The stored profile", content: json("RankingProfile", stored) },
        "400": errorResponse("Invalid profile"),
        "404": errorResponse("Library not found"),
        "409": errorResponse("The library already has 50 profiles"),
      },
    },
  },
  {
    operationId: "getRankingProfile",
    method: "get",
    path: "/api/ranking/profiles/{id}",
    summary: "Get a preset or a stored ranking profile",
    tags: ["Ranking"],
    successSchema: rankingProfileEntrySchema,
    errorSchema: error,
    openapi: {
      parameters: [idParam],
      responses: {
        "200": { description: "The profile", content: json("RankingProfile", stored) },
        "404": errorResponse("Profile not found"),
      },
    },
  },
  {
    operationId: "updateRankingProfile",
    method: "put",
    path: "/api/ranking/profiles/{id}",
    summary: "Replace a stored ranking profile; presets are read-only",
    tags: ["Ranking"],
    bodySchema: rankingProfileUpdateBodySchema,
    successSchema: rankingProfileSchema,
    errorSchema: error,
    openapi: {
      parameters: [idParam],
      requestBody: {
        required: true,
        content: json("RankingProfileUpdateRequest", { profile: draftExample }),
      },
      responses: {
        "200": {
          description: "The updated profile. Surfaces it no longer applies to go back to Default.",
          content: json("RankingProfile", stored),
        },
        "400": errorResponse("Invalid profile"),
        "403": errorResponse("Presets are read-only"),
        "404": errorResponse("Profile not found"),
      },
    },
  },
  {
    operationId: "deleteRankingProfile",
    method: "delete",
    path: "/api/ranking/profiles/{id}",
    summary: "Delete a stored ranking profile; surfaces that chose it go back to Default",
    tags: ["Ranking"],
    successSchema: rankingProfileDeleteResponseSchema,
    errorSchema: error,
    openapi: {
      parameters: [idParam],
      responses: {
        "200": {
          description: "Deleted",
          content: json("RankingProfileDeleteResponse", { deleted: true, id: "17" }),
        },
        "403": errorResponse("Presets are read-only"),
        "404": errorResponse("Profile not found"),
      },
    },
  },
  {
    operationId: "copyRankingProfile",
    method: "post",
    path: "/api/ranking/profiles/{id}/copy",
    summary: "Copy a preset or a profile into a library's own profiles",
    tags: ["Ranking"],
    bodySchema: rankingProfileCopyBodySchema,
    successSchema: rankingProfileSchema,
    errorSchema: error,
    openapi: {
      parameters: [idParam],
      requestBody: {
        required: true,
        content: json("RankingProfileCopyRequest", { friend_id: 1, name: "Warm-up" }),
      },
      responses: {
        "201": {
          description: 'The copy; named "<name> copy" unless a name is given',
          content: json("RankingProfile", stored),
        },
        "400": errorResponse("Invalid request"),
        "404": errorResponse("Profile or library not found"),
        "409": errorResponse("The library already has 50 profiles"),
      },
    },
  },
  {
    operationId: "setActiveRankingProfile",
    method: "put",
    path: "/api/ranking/active",
    summary: "Choose the ranking profile a library uses, per surface",
    tags: ["Ranking"],
    bodySchema: rankingActiveUpdateBodySchema,
    successSchema: rankingActiveResponseSchema,
    errorSchema: error,
    openapi: {
      requestBody: {
        required: true,
        content: json("RankingActiveUpdateRequest", {
          friend_id: 1,
          profile_id: "beatmatcher",
          surfaces: ["suggestions"],
        }),
      },
      responses: {
        "200": {
          description: "The profile now active per surface",
          content: json("RankingActiveResponse", { friend_id: 1, active }),
        },
        "400": errorResponse(
          "Invalid request, a surface the profile doesn't apply to, or a profile that can't be read",
        ),
        "404": errorResponse("Profile or library not found"),
      },
    },
  },
];
