import { z } from "zod";
import type { ApiContractRoute } from "./routes";

const name = z.string().trim().min(1).max(100);
export const profileBodySchema = z.object({
  name,
  tailscale_login: z.string().trim().min(1).max(320).nullable().default(null),
});
export const renameProfileSchema = profileBodySchema.extend({ id: z.uuid() });
export const selectProfileSchema = z.object({ user_id: z.uuid() });
export const tokenBodySchema = z.object({
  name,
  user_id: z.uuid(),
  scope: z.enum(["read", "write", "ingest"]),
});
export const revokeTokenSchema = z.object({ id: z.uuid() });
const user = z.object({
  id: z.uuid(),
  name,
  is_owner: z.boolean(),
  discogs_username: z.string().nullable(),
  tailscale_login: z.string().nullable(),
});
const token = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  name,
  scope: z.enum(["read", "write", "ingest"]),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
const definitions = [
  [
    "listHouseholdProfiles",
    "get",
    "/api/profiles",
    undefined,
    z.object({
      users: z.array(user.pick({ id: true, name: true, is_owner: true })),
      current: user.nullable(),
      selected: z.boolean(),
    }),
  ],
  ["createHouseholdProfile", "post", "/api/profiles", profileBodySchema, user],
  ["renameHouseholdProfile", "patch", "/api/profiles", renameProfileSchema, user],
  [
    "selectHouseholdProfile",
    "post",
    "/api/profiles/select",
    selectProfileSchema,
    z.object({ selected: z.literal(true) }),
  ],
  [
    "listApiTokens",
    "get",
    "/api/profiles/tokens",
    undefined,
    z.object({ tokens: z.array(token), users: z.array(user) }),
  ],
  [
    "createApiToken",
    "post",
    "/api/profiles/tokens",
    tokenBodySchema,
    token.extend({ token: z.string() }),
  ],
  [
    "revokeApiToken",
    "delete",
    "/api/profiles/tokens",
    revokeTokenSchema,
    z.object({ revoked: z.literal(true) }),
  ],
] as const;
export const profileContracts: ApiContractRoute[] = definitions.map(
  ([operationId, method, path, bodySchema, successSchema]) => ({
    operationId,
    method,
    path,
    summary: operationId,
    tags: ["Profiles"],
    bodySchema,
    successSchema,
    errorSchema: z.object({ error: z.string() }),
    openapi: {
      ...(bodySchema
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: z.toJSONSchema(bodySchema, { target: "openapi-3.0" }),
                },
              },
            },
          }
        : {}),
      responses: {
        [operationId.startsWith("create") ? "201" : "200"]: {
          description: "Success",
          content: {
            "application/json": {
              schema: z.toJSONSchema(successSchema, { target: "openapi-3.0" }),
            },
          },
        },
        "403": { description: "Owner profile or sufficient token scope required" },
      },
    },
  }),
);
