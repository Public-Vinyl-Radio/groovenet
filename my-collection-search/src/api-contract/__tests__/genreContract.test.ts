import { describe, expect, it } from "vitest";
import { apiContractRoutes } from "../routes";
import { genreUpdateBodySchema } from "../schemas";
import { getOpenApiDocument } from "../openapi";

const operations = apiContractRoutes.filter((route) => route.tags.includes("Genres"));
describe("genre contracts", () => {
  it("registers every taxonomy operation explicitly", () => {
    expect(operations.map((route) => route.operationId)).toEqual([
      "createGenre", "updateGenre", "addGenreAlias", "mergeGenres", "listGenres",
    ]);
  });
  it.each(operations.filter((route) => route.bodySchema))("validates the documented request example for $operationId", (route) => {
    const content = route.openapi.requestBody?.content as Record<string, { example: unknown }>;
    expect(route.bodySchema!.safeParse(content["application/json"].example).success).toBe(true);
    for (const status of ["400", "404", "409", "500"]) expect(route.openapi.responses[status]).toBeDefined();
  });
  it.each(operations)("validates documented success examples for $operationId", (route) => {
    const doc = getOpenApiDocument();
    const operation = doc.paths[route.path][route.method] as { responses: Record<string, { content: Record<string, { example: unknown }> }> };
    const status = route.operationId === "createGenre" || route.operationId === "addGenreAlias" ? "201" : "200";
    expect(route.successSchema.safeParse(operation.responses[status].content["application/json"].example).success).toBe(true);
  });
  it("accepts either update field independently", () => {
    expect(genreUpdateBodySchema.safeParse({ name: "Dub" }).success).toBe(true);
    expect(genreUpdateBodySchema.safeParse({ parent_id: null }).success).toBe(true);
    expect(genreUpdateBodySchema.safeParse({}).success).toBe(false);
  });
  it("documents a recursive tree with explicit fields and a resolvable reference", () => {
    const doc = getOpenApiDocument();
    expect(doc.components.schemas.GenreTreeNode).toMatchObject({
      properties: {
        children: { items: { $ref: "#/components/schemas/GenreTreeNode" } },
        track_count: { type: "integer" }, album_count: { type: "integer" },
      },
      required: expect.arrayContaining(["id", "parent_id", "children"]),
    });
    for (const route of operations) expect(doc.paths[route.path][route.method]).toMatchObject({ operationId: route.operationId, tags: ["Genres"] });
  });
});
