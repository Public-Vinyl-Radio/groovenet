import { describe, expect, it } from "vitest";
import { apiContractRoutes } from "../routes";
import { getOpenApiDocument } from "../openapi";

const operations = apiContractRoutes.filter((route) => route.tags.includes("Ranking"));
type Operation = {
  requestBody?: { content: Record<string, { example?: unknown }> };
  responses: Record<string, { content?: Record<string, { example?: unknown }> }>;
};

describe("ranking profile contracts (#1192)", () => {
  it("registers every profile operation", () => {
    expect(operations.map((route) => `${route.method} ${route.path}`)).toEqual([
      "get /api/ranking/profiles",
      "post /api/ranking/profiles",
      "get /api/ranking/profiles/{id}",
      "put /api/ranking/profiles/{id}",
      "delete /api/ranking/profiles/{id}",
      "post /api/ranking/profiles/{id}/copy",
      "put /api/ranking/active",
      "get /api/ranking/profiles/{id}/export",
      "post /api/ranking/profiles/import",
      "post /api/ranking/profiles/{id}/use-friend",
    ]);
  });

  it.each(operations)("documents examples its schemas accept: $operationId", (route) => {
    const operation = getOpenApiDocument().paths[route.path][route.method] as Operation;
    const success = Object.entries(operation.responses).find(([status]) => status.startsWith("2"));
    const example = success?.[1].content?.["application/json"].example;
    expect(route.successSchema.safeParse(example).success).toBe(true);
    if (route.bodySchema) {
      const body = operation.requestBody?.content["application/json"].example;
      expect(route.bodySchema.safeParse(body).success).toBe(true);
    }
  });

  it("publishes the profile components", () => {
    const { schemas } = getOpenApiDocument().components;
    for (const name of ["RankingProfile", "RankingProfileDraft", "RankingProfilesResponse"]) {
      expect(schemas).toHaveProperty(name);
    }
  });
});
