import { z } from "zod";
import {
  createServerPlayerSchema,
  playerIdSchema,
  serverPlayerSchema,
  serverPlayerDeviceSchema,
  serverPlayerCommandSchema,
  serverPlayerCommandResultSchema,
} from "@groovenet/contracts";
import { playerWebSessionSchema, playerWebUnlockSchema } from "./schemas";
import type { ApiContractRoute } from "./routes";

const error = z.object({ error: z.string(), code: z.string().optional() });
const params = z.object({ playerId: playerIdSchema });
const definitions = [
  {
    operationId: "listServerPlayers",
    responseComponent: "ServerPlayerList",
    method: "get",
    path: "/api/players",
    summary: "List persistent server players",
    success: z.object({ players: z.array(serverPlayerSchema) }),
  },
  {
    operationId: "createServerPlayer",
    responseComponent: "ServerPlayer",
    bodyComponent: "CreateServerPlayer",
    method: "post",
    path: "/api/players",
    summary: "Create a named player on a configured engine",
    body: createServerPlayerSchema,
    success: serverPlayerSchema,
  },
  {
    operationId: "listPlayerEngines",
    responseComponent: "PlayerEngineList",
    method: "get",
    path: "/api/players/engines",
    summary: "List configured engine IDs without connection credentials",
    success: z.object({ engines: z.array(playerIdSchema) }),
  },
  {
    operationId: "getServerPlayer",
    responseComponent: "ServerPlayer",
    method: "get",
    path: "/api/players/{playerId}",
    summary: "Read player state and its edit revision",
    success: serverPlayerSchema,
  },
  {
    operationId: "commandServerPlayer",
    responseComponent: "ServerPlayerCommandResult",
    bodyComponent: "ServerPlayerCommand",
    method: "post",
    path: "/api/players/{playerId}/commands",
    summary:
      "Apply a player command with optional revision check, bearer-only availability policy change, or explicit speaker transfer",
    body: serverPlayerCommandSchema,
    success: serverPlayerCommandResultSchema,
  },
  {
    operationId: "listServerPlayerDevices",
    responseComponent: "ServerPlayerDeviceList",
    method: "get",
    path: "/api/players/{playerId}/devices",
    summary: "Read outputs, Groovenet assignments and independent speaker observations",
    success: z.object({ devices: z.array(serverPlayerDeviceSchema) }),
  },
] as const;
export const playerContracts: ApiContractRoute[] = definitions.map(
  (definition): ApiContractRoute => ({
    operationId: definition.operationId,
    method: definition.method,
    path: definition.path,
    summary: definition.summary,
    tags: ["Players"],
    successSchema: definition.success,
    errorSchema: error,
    ...("body" in definition ? { bodySchema: definition.body } : {}),
    ...(definition.path.includes("{playerId}") ? { paramsSchema: params } : {}),
    openapi: {
      security:
        definition.operationId === "createServerPlayer"
          ? [{ BearerAuth: [] }]
          : [{ BearerAuth: [] }, { PlayerWebSession: [] }],
      ...(definition.path.includes("{playerId}")
        ? {
            parameters: [
              {
                in: "path",
                name: "playerId",
                required: true,
                schema: z.toJSONSchema(playerIdSchema),
              },
            ],
          }
        : {}),
      ...("body" in definition
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${definition.bodyComponent}` },
                },
              },
            },
          }
        : {}),
      responses: {
        [definition.operationId === "createServerPlayer" ? "201" : "200"]: {
          description: definition.summary,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${definition.responseComponent}` },
            },
          },
        },
        ...Object.fromEntries(
          [400, 401, 403, 404, 409, 413, 422, 502, 503].map((status) => [
            String(status),
            {
              description:
                status === 409
                  ? "Revision, assignment, or availability conflict; refresh before retrying"
                  : status === 403
                    ? "Browser sessions cannot administer players or change availability policy"
                    : "Player request rejected or unavailable",
              content: { "application/json": { schema: z.toJSONSchema(error) } },
            },
          ]),
        ),
      },
    },
  }),
);
playerContracts.push({
  operationId: "subscribeServerPlayer",
  method: "get",
  path: "/api/players/{playerId}/events",
  summary:
    "Subscribe to snapshots and position events; reconnect receives a fresh snapshot without replaying commands",
  tags: ["Players"],
  paramsSchema: params,
  successSchema: z.string(),
  errorSchema: error,
  openapi: {
    security: [{ BearerAuth: [] }, { PlayerWebSession: [] }],
    parameters: [
      { in: "path", name: "playerId", required: true, schema: z.toJSONSchema(playerIdSchema) },
    ],
    responses: {
      "200": {
        description:
          "SSE snapshot and position events containing worker_instance and sequence; reconnect for fresh state",
        content: { "text/event-stream": { schema: { type: "string" } } },
      },
      "401": { description: "Household player bearer key required" },
      "503": { description: "Worker unavailable" },
    },
  },
});
playerContracts.push({
  operationId: "subscribeAllServerPlayers",
  method: "get",
  path: "/api/players/events",
  summary:
    "Subscribe to all players: an initial players event followed by changed player snapshots",
  tags: ["Players"],
  successSchema: z.string(),
  errorSchema: error,
  openapi: {
    security: [{ BearerAuth: [] }, { PlayerWebSession: [] }],
    responses: {
      "200": {
        description:
          "SSE players and snapshot events containing worker_instance and sequence; reconnect receives a fresh complete list",
        content: { "text/event-stream": { schema: { type: "string" } } },
      },
      "401": { description: "Household player bearer key required" },
      "503": { description: "Worker unavailable" },
    },
  },
});

for (const method of ["get", "post", "delete"] as const)
  playerContracts.push({
    operationId: `${method}PlayerWebSession`,
    method,
    path: "/api/players/browser/session",
    summary:
      method === "post"
        ? "Unlock player-only browser access with a separate household web passphrase"
        : method === "delete"
          ? "Clear this browser's player session without stopping audio"
          : "Read browser player authorization status",
    tags: ["Players"],
    successSchema: playerWebSessionSchema,
    errorSchema: error,
    ...(method === "post" ? { bodySchema: playerWebUnlockSchema } : {}),
    openapi: {
      ...(method === "post"
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: z.toJSONSchema(playerWebUnlockSchema) } },
            },
          }
        : {}),
      responses: {
        "200": {
          description:
            "Browser authorization status; login/logout use a Secure HttpOnly player-only cookie",
          content: { "application/json": { schema: z.toJSONSchema(playerWebSessionSchema) } },
        },
        ...Object.fromEntries(
          [400, 401, 403, 429, 503].map((status) => [
            String(status),
            { description: "Session denied or unavailable" },
          ]),
        ),
      },
    },
  });
