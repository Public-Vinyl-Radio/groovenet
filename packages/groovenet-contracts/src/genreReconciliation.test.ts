import { describe, expect, it } from "vitest";
import {
  genreProposalActionSchema,
  genreProposalMethodSchema,
  genreProposalStatusSchema,
  genreProposalApplyRequestSchema,
  genreProposalDecisionRequestSchema,
  genreProposalRestoreRequestSchema,
  genreReconciliationJsonSchemas,
  genreReconciliationRunSchema,
  genreProposalSchema,
} from "./genreReconciliation.js";

describe("genre reconciliation contracts", () => {
  it("publishes the shared enums", () => {
    expect(genreProposalActionSchema.options).toEqual(["map", "new_genre", "descriptor", "drop"]);
    expect(genreProposalMethodSchema.options).toEqual(["exact", "ai", "manual"]);
    expect(genreProposalStatusSchema.options).toEqual([
      "pending",
      "accepted",
      "rejected",
      "edited",
    ]);
  });

  it("keeps request strictness and proposal edit refinement", () => {
    expect(genreProposalApplyRequestSchema.safeParse({ ids: ["bad"], other: true }).success).toBe(
      false,
    );
    expect(
      genreProposalDecisionRequestSchema.safeParse({
        decisions: [{ id: "00000000-0000-4000-8000-000000000001" }],
      }).success,
    ).toBe(false);
    expect(
      genreProposalRestoreRequestSchema.safeParse({ snapshots: [], extra: true }).success,
    ).toBe(false);
  });

  it("accepts the run and proposal wire shapes and exports OpenAPI components", () => {
    const now = "2026-01-01T00:00:00.000Z";
    expect(
      genreReconciliationRunSchema.safeParse({
        id: "00000000-0000-4000-8000-000000000001",
        status: "running",
        options: { ai: true, new_genre_min_tracks: 10, limit: null, refresh: false },
        model: null,
        distinct_values: 0,
        exact_matches: 0,
        kept: 0,
        ai_pending: 0,
        ai_proposed: 0,
        ai_failed: 0,
        ai_batches: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        error: null,
        started_at: now,
        updated_at: now,
        finished_at: null,
      }).success,
    ).toBe(true);
    expect(genreProposalSchema.shape.action).toBe(genreProposalActionSchema);
    expect(genreReconciliationJsonSchemas.GenreProposal).toBeDefined();
    expect(genreReconciliationJsonSchemas.GenreReconciliationCoverage).toBeDefined();
  });
});
