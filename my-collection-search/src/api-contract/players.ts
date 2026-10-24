import { z } from "zod";
import { createServerPlayerSchema, playerIdSchema, serverPlayerSchema, serverPlayerDeviceSchema, serverPlayerCommandSchema, serverPlayerCommandResultSchema } from "@groovenet/contracts";
import type { ApiContractRoute } from "./routes";

const error = z.object({ error: z.string(), code: z.string().optional() });
const params = z.object({ playerId: playerIdSchema });
const definitions = [
  { operationId: "listServerPlayers", responseComponent: "ServerPlayerList", method: "get", path: "/api/players", summary: "List persistent server players", success: z.object({ players: z.array(serverPlayerSchema) }) },
  { operationId: "createServerPlayer", responseComponent: "ServerPlayer", bodyComponent: "CreateServerPlayer", method: "post", path: "/api/players", summary: "Create a named player on a configured engine", body: createServerPlayerSchema, success: serverPlayerSchema },
  { operationId: "listPlayerEngines", responseComponent: "PlayerEngineList", method: "get", path: "/api/players/engines", summary: "List configured engine IDs without connection credentials", success: z.object({ engines: z.array(playerIdSchema) }) },
  { operationId: "getServerPlayer", responseComponent: "ServerPlayer", method: "get", path: "/api/players/{playerId}", summary: "Read player state and its edit revision", success: serverPlayerSchema },
  { operationId: "commandServerPlayer", responseComponent: "ServerPlayerCommandResult", bodyComponent: "ServerPlayerCommand", method: "post", path: "/api/players/{playerId}/commands", summary: "Apply a revision-checked player command or explicit speaker transfer", body: serverPlayerCommandSchema, success: serverPlayerCommandResultSchema },
  { operationId: "listServerPlayerDevices", responseComponent: "ServerPlayerDeviceList", method: "get", path: "/api/players/{playerId}/devices", summary: "Read outputs, Groovenet assignments and independent speaker observations", success: z.object({ devices: z.array(serverPlayerDeviceSchema) }) },
] as const;
export const playerContracts: ApiContractRoute[] = definitions.map((definition) => ({
  operationId: definition.operationId, method: definition.method, path: definition.path, summary: definition.summary, tags: ["Players"],
  successSchema: definition.success, errorSchema: error,
  ...("body" in definition ? { bodySchema: definition.body } : {}),
  ...(definition.path.includes("{playerId}") ? { paramsSchema: params } : {}),
  openapi: {
    security: [{ BearerAuth: [] }],
    ...(definition.path.includes("{playerId}") ? { parameters: [{ in: "path", name: "playerId", required: true, schema: z.toJSONSchema(playerIdSchema) }] } : {}),
    ...("body" in definition ? { requestBody: { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${definition.bodyComponent}` } } } } } : {}),
    responses: {
      [definition.operationId === "createServerPlayer" ? "201" : "200"]: { description: definition.summary, content: { "application/json": { schema: { $ref: `#/components/schemas/${definition.responseComponent}` } } } },
      ...Object.fromEntries([400, 401, 404, 409, 413, 422, 502, 503].map((status) => [String(status), { description: status === 409 ? "Revision, assignment, or availability conflict; refresh before retrying" : "Player request rejected or unavailable", content: { "application/json": { schema: z.toJSONSchema(error) } } }])),
    },
  },
}));
playerContracts.push({ operationId: "subscribeServerPlayer", method: "get", path: "/api/players/{playerId}/events", summary: "Subscribe to snapshots and position events; reconnect receives a fresh snapshot without replaying commands", tags: ["Players"], paramsSchema: params, successSchema: z.string(), errorSchema: error, openapi: {
  security: [{ BearerAuth: [] }], parameters: [{ in: "path", name: "playerId", required: true, schema: z.toJSONSchema(playerIdSchema) }],
  responses: { "200": { description: "SSE snapshot and position events containing worker_instance and sequence; reconnect for fresh state", content: { "text/event-stream": { schema: { type: "string" } } } }, "401": { description: "Household player bearer key required" }, "503": { description: "Worker unavailable" } },
} });
