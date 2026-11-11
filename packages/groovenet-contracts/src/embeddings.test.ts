import { describe, expect, it } from "vitest";
import {
  EMBEDDING_BACKFILL_SCOPES,
  EMBEDDING_KINDS,
  EMBEDDING_MODEL_FIELDS,
  embeddingJsonSchemas,
  embeddingModelUpdateBodySchema,
  embeddingModelUpdateObjectSchema,
  embeddingQueueStatusSchema,
  embeddingsBackfillBodySchema,
  embeddingsBackfillResponseSchema,
  embeddingsStatusSchema,
} from "./embeddings.js";

describe("embedding contracts", () => {
  it("publishes the kind, scope and field enums", () => {
    expect(EMBEDDING_KINDS).toEqual(["identity", "audio_vibe", "context"]);
    expect(EMBEDDING_BACKFILL_SCOPES).toEqual(["missing", "all", "changed", "release", "track"]);
    expect(EMBEDDING_MODEL_FIELDS).toEqual(["target", "serving"]);
  });

  it("defaults the backfill scope and requires the id its scope names", () => {
    expect(embeddingsBackfillBodySchema.parse({}).scope).toBe("missing");
    const track = embeddingsBackfillBodySchema.safeParse({ scope: "track" });
    expect(track.success).toBe(false);
    expect(track.error?.issues[0].message).toBe("scope 'track' requires track_ids");
    const release = embeddingsBackfillBodySchema.safeParse({ scope: "release" });
    expect(release.error?.issues[0].message).toBe("scope 'release' requires release_id");
    expect(
      embeddingsBackfillBodySchema.safeParse({ scope: "track", track_ids: ["a"] }).success,
    ).toBe(true);
    expect(
      embeddingsBackfillBodySchema.safeParse({ scope: "release", release_id: "r" }).success,
    ).toBe(true);
    expect(embeddingsBackfillBodySchema.safeParse({ types: [] }).success).toBe(false);
  });

  it("accepts a run or a dry run as the backfill response", () => {
    const run = {
      run_id: "r",
      queued: 1,
      success: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      started_at: 1,
      updated_at: 2,
      complete: false,
    };
    expect(embeddingsBackfillResponseSchema.safeParse(run).success).toBe(true);
    expect(
      embeddingsBackfillResponseSchema.safeParse({
        dry_run: true,
        total: 3,
        by_type: { identity: 1, audio_vibe: 1, context: 1 },
      }).success,
    ).toBe(true);
    expect(embeddingsBackfillResponseSchema.safeParse({ dry_run: false }).success).toBe(false);
  });

  it("describes status with per-model coverage", () => {
    const coverage = [{ model: "m", dims: 3, template_version: 1, count: 2 }];
    const status = embeddingsStatusSchema.parse({
      total_tracks: 5,
      missing: { identity: 1, audio_vibe: 2, context: 3 },
      by_model: { identity: coverage, audio_vibe: [], context: [] },
    });
    expect(status.by_model.identity).toEqual(coverage);
  });

  it("allows a null ETA and optional pause fields on the queue", () => {
    const status = embeddingQueueStatusSchema.parse({
      lanes: { interactive: 0, sync: 0, bulk: 1 },
      retrying: 0,
      failed_count: 0,
      paused: true,
      pause_reason: "rate limited",
      interval_seconds: 5,
      batch_size: 10,
      drain_rate_per_minute: 0,
      eta_seconds: null,
      by_kind: { identity: 1, audio_vibe: 0, context: 0 },
      by_kind_sampled: false,
      active_backfill_runs: [],
      failed: [],
    });
    expect(status.eta_seconds).toBeNull();
  });

  it("limits template_version to the serving step", () => {
    const base = { embedding_type: "identity", model: "m", dims: 3 } as const;
    expect(
      embeddingModelUpdateBodySchema.safeParse({ ...base, field: "target", template_version: 2 })
        .success,
    ).toBe(false);
    expect(
      embeddingModelUpdateBodySchema.safeParse({ ...base, field: "serving", template_version: 2 })
        .success,
    ).toBe(true);
    expect(embeddingModelUpdateBodySchema.safeParse({ ...base, field: "target" }).success).toBe(
      true,
    );
    expect(
      embeddingModelUpdateBodySchema.safeParse({ ...base, field: "serving", dims: 0 }).success,
    ).toBe(false);
    // The object form stays extendable for the route's coercion.
    expect(embeddingModelUpdateObjectSchema.extend({}).shape.dims).toBeDefined();
  });

  it("publishes request bodies by their input shape", () => {
    expect(embeddingJsonSchemas.EmbeddingBackfillRequest).not.toHaveProperty("required");
    expect(embeddingJsonSchemas.EmbeddingModelUpdateRequest).toMatchObject({
      required: ["embedding_type", "field", "model", "dims"],
    });
    expect(embeddingJsonSchemas.EmbeddingKind).toMatchObject({ enum: [...EMBEDDING_KINDS] });
  });
});
