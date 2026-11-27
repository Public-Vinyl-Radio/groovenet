import { z } from "zod";
import type { ApiContractRoute } from "./routes";

const configured = z.object({ configured: z.boolean() });

/** Presence only: a key's value is never part of a response. */
export const integrationStatusSchema = z.object({
  keys: z.object({ openai: configured, youtube: configured }),
  embedding_models: z.array(z.object({ target_model: z.string(), serving_model: z.string() })),
});

export const integrationContracts: ApiContractRoute[] = [
  {
    operationId: "getIntegrationStatus",
    method: "get",
    path: "/api/settings/integrations",
    summary: "Which optional API keys are configured (owner only; never the values)",
    tags: ["Settings"],
    successSchema: integrationStatusSchema,
    errorSchema: z.object({ error: z.string() }),
    openapi: {
      responses: {
        "200": {
          description: "Whether OpenAI and YouTube keys are set, and each embedding kind's models",
          content: {
            "application/json": {
              schema: z.toJSONSchema(integrationStatusSchema, { target: "openapi-3.0" }),
            },
          },
        },
        "403": { description: "Owner profile required" },
      },
    },
  },
];
