import { describe, expect, it } from "vitest";
import { apiContractRoutes } from "../routes";
import { getOpenApiDocument } from "../openapi";
import { genreReconciliationRunSchema } from "../schemas";

const operations = apiContractRoutes.filter((route) => route.tags.includes("Genre Reconciliation"));

describe("genre reconciliation contracts", () => {
  it("registers every reconciliation operation", () => {
    expect(operations.map((route) => route.operationId)).toEqual([
      "startGenreReconciliation", "getGenreReconciliationRun", "getGenreReconciliationCoverage",
      "listGenreProposals", "updateGenreProposal", "applyGenreProposals",
      "decideGenreProposals", "restoreGenreProposals", "listGenreProposalTracks",
    ]);
  });

  it.each(operations)("documents a success example the schema accepts for $operationId", (route) => {
    const doc = getOpenApiDocument();
    const operation = doc.paths[route.path][route.method] as {
      responses: Record<string, { content: Record<string, { example: unknown }> }>;
    };
    const status = route.operationId === "startGenreReconciliation" ? "202" : "200";
    const example = operation.responses[status].content["application/json"].example;
    expect(route.successSchema.safeParse(example).success).toBe(true);
  });

  it("accepts the documented proposal edit", () => {
    const route = operations.find((r) => r.operationId === "updateGenreProposal")!;
    const content = route.openapi.requestBody?.content as Record<string, { example: unknown }>;
    expect(route.bodySchema!.safeParse(content["application/json"].example).success).toBe(true);
  });

  it("sends timestamps as ISO strings whether pg gave a Date or a string", () => {
    const base = {
      id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47", status: "completed",
      options: { ai: true, new_genre_min_tracks: 5, limit: null, refresh: false }, model: null,
      distinct_values: 0, exact_matches: 0, kept: 0, ai_pending: 0, ai_proposed: 0, ai_failed: 0,
      ai_batches: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, error: null,
    };
    const parsed = genreReconciliationRunSchema.parse({
      ...base, started_at: new Date("2026-10-05T00:00:00Z"), updated_at: "2026-10-05T00:00:00.000Z", finished_at: null,
    });
    expect(parsed.started_at).toBe("2026-10-05T00:00:00.000Z");
    expect(parsed.updated_at).toBe("2026-10-05T00:00:00.000Z");
  });
});
