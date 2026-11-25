import {
  discogsImportCreateResponseSchema,
  discogsImportCreateSchema,
  discogsImportListResponseSchema,
  discogsImportLogResponseSchema,
  discogsImportResponseSchema,
} from "@groovenet/contracts";
import { z } from "zod";
import type { ApiContractRoute } from "./routes";

// Discogs imports as background jobs (#1274). Components come from
// `discogsImportJsonSchemas`.

const apiError = z.object({ error: z.string() });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (description: string, name: string) => ({
  description,
  content: { "application/json": { schema: ref(name) } },
});
const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
    },
  },
});
const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
};

export const discogsImportContracts: ApiContractRoute[] = [
  {
    operationId: "listDiscogsImports",
    method: "get",
    path: "/api/discogs/imports",
    summary:
      "The latest Discogs import per username, or only the active (queued or running) ones with active=1",
    tags: ["Discogs"],
    querySchema: z.object({ active: z.enum(["1", "true"]).optional() }),
    successSchema: discogsImportListResponseSchema,
    errorSchema: apiError,
    openapi: {
      parameters: [
        {
          name: "active",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["1", "true"] },
          description: "Only imports still queued or running.",
        },
      ],
      responses: {
        "200": json("Imports, newest first", "DiscogsImportListResponse"),
        "500": errorResponse("Server error"),
      },
    },
  },
  {
    operationId: "createDiscogsImport",
    method: "post",
    path: "/api/discogs/imports",
    summary:
      "Queue a Discogs import of one library as a background job; at most one active per username, so a second request returns the first",
    tags: ["Discogs"],
    bodySchema: discogsImportCreateSchema,
    successSchema: discogsImportCreateResponseSchema,
    errorSchema: apiError,
    openapi: {
      requestBody: {
        required: false,
        content: { "application/json": { schema: ref("DiscogsImportCreate") } },
      },
      responses: {
        "201": json("Queued", "DiscogsImportCreateResponse"),
        "200": json(
          "An import for this username was already active: that one",
          "DiscogsImportCreateResponse",
        ),
        "400": errorResponse("Invalid body"),
        "429": errorResponse("Too many import requests"),
        "500": errorResponse("Discogs credentials not set in environment, or a server error"),
      },
    },
  },
  {
    operationId: "getDiscogsImport",
    method: "get",
    path: "/api/discogs/imports/{id}",
    summary: "One Discogs import: status, phase, releases fetched of total, last error",
    tags: ["Discogs"],
    paramsSchema: z.object({ id: z.coerce.number().int().positive() }),
    successSchema: discogsImportResponseSchema,
    errorSchema: apiError,
    openapi: {
      parameters: [idParam],
      responses: {
        "200": json("The import", "DiscogsImportResponse"),
        "400": errorResponse("Invalid id"),
        "404": errorResponse("Import not found"),
        "500": errorResponse("Server error"),
      },
    },
  },
  {
    operationId: "getDiscogsImportLog",
    method: "get",
    path: "/api/discogs/imports/{id}/log",
    summary: "A Discogs import's progress lines after a line id, oldest first",
    tags: ["Discogs"],
    paramsSchema: z.object({ id: z.coerce.number().int().positive() }),
    querySchema: z.object({
      after: z.coerce.number().int().min(0).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional(),
    }),
    successSchema: discogsImportLogResponseSchema,
    errorSchema: apiError,
    openapi: {
      parameters: [
        idParam,
        {
          name: "after",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 0, default: 0 },
          description: "Return lines after this id (the previous page's `next_after`).",
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 1000, default: 500 },
        },
      ],
      responses: {
        "200": json("Log lines", "DiscogsImportLogResponse"),
        "400": errorResponse("Invalid request"),
        "500": errorResponse("Server error"),
      },
    },
  },
];
