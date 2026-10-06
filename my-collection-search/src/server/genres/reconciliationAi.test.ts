import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: vi.fn(function () {
    return { responses: { create } };
  }),
}));

import {
  buildMappingSchema,
  buildSystemPrompt,
  buildUserPrompt,
  costOf,
  mapValuesWithAi,
  toProposalDrafts,
  type AiMapping,
} from "./reconciliationAi";
import type { TaxonomyEntry } from "@/server/repositories/genreReconciliationRepository";
import type { LocalTagValue } from "@/lib/genres/localTags";

const taxonomy: TaxonomyEntry[] = [
  { id: "latin", name: "Latin", normalized_name: "latin", parent_name: null },
  { id: "cumbia", name: "Cumbia", normalized_name: "cumbia", parent_name: "Latin" },
  { id: "salsa", name: "Salsa", normalized_name: "salsa", parent_name: "Latin" },
];

const value = (value_normalized: string, track_count: number): LocalTagValue => ({
  value_normalized, track_count, raw_examples: [value_normalized], styles: ["Cumbia"],
});

const batch = [
  value("psychedelic cumbia", 113),
  value("cumbia rebajada", 2),
  value("uplifting", 4),
  value("asdf", 1),
  value("timeless salsa", 3),
];

const mapping = (overrides: Partial<AiMapping> & Pick<AiMapping, "value" | "action">): AiMapping => ({
  genres: [], proposed_genre: null, proposed_parent: null, confidence: 0.8, ...overrides,
});

describe("prompts and schema", () => {
  it("constrains genres to the taxonomy through one shared enum", () => {
    const schema = buildMappingSchema(["Latin", "Cumbia"]);
    expect(schema.strict).toBe(true);
    expect(schema.schema.$defs.genre.enum).toEqual(["Latin", "Cumbia"]);
    const item = schema.schema.properties.results.items;
    expect(item.properties.genres.items).toEqual({ $ref: "#/$defs/genre" });
    expect(item.required).toEqual(Object.keys(item.properties));
  });

  it("lists the taxonomy hierarchy and the new-genre threshold", () => {
    const prompt = buildSystemPrompt(taxonomy, 7);
    expect(prompt).toContain("Latin > Cumbia");
    expect(prompt).toContain("\nLatin\n");
    expect(prompt).toContain("at least 7 tracks");
    // #372 first prod batch: 24 of 40 proposals were new genres, several of
    // them an existing genre reworded or with a modifier.
    expect(prompt).toContain('"Colombian Cumbia" is "Cumbia Colombiana"');
    expect(prompt).toContain("A genre plus a modifier is that genre");
  });

  it("tells the model which values may become new genres", () => {
    const sent = JSON.parse(buildUserPrompt(batch.slice(0, 2), 5));
    expect(sent[0]).toMatchObject({ value: "psychedelic cumbia", tracks: 113, may_propose_new_genre: true, album_styles: ["Cumbia"] });
    expect(sent[1].may_propose_new_genre).toBe(false);
  });

  it("prices tokens per million", () => {
    expect(costOf(1_000_000, 1_000_000)).toBeCloseTo(2.25);
  });
});

describe("toProposalDrafts", () => {
  it("keeps valid answers and resolves names to ids", () => {
    const drafts = toProposalDrafts(batch, [
      mapping({ value: "Psychedelic Cumbia", action: "new_genre", proposed_genre: " Psychedelic Cumbia ", proposed_parent: "Cumbia", confidence: 0.9 }),
      mapping({ value: "uplifting", action: "descriptor", proposed_genre: "ignored" }),
      mapping({ value: "asdf", action: "drop" }),
      mapping({ value: "timeless salsa", action: "map", genres: ["Salsa", "Salsa", "Latin"], confidence: 3 }),
    ], taxonomy, 5);
    expect(drafts).toEqual([
      expect.objectContaining({ value_normalized: "psychedelic cumbia", action: "new_genre", proposed_genre_name: "Psychedelic Cumbia", proposed_parent_id: "cumbia", target_genre_ids: [], method: "ai" }),
      expect.objectContaining({ value_normalized: "uplifting", action: "descriptor", proposed_genre_name: null }),
      expect.objectContaining({ value_normalized: "asdf", action: "drop" }),
      expect.objectContaining({ value_normalized: "timeless salsa", action: "map", target_genre_ids: ["salsa", "latin"], confidence: 1 }),
    ]);
  });

  it("downgrades a new genre below the threshold, or without a parent, to its parent", () => {
    const [rare] = toProposalDrafts(batch, [
      mapping({ value: "cumbia rebajada", action: "new_genre", proposed_genre: "Cumbia Rebajada", proposed_parent: "Cumbia", confidence: 0.8 }),
    ], taxonomy, 5);
    expect(rare).toMatchObject({ action: "map", target_genre_ids: ["cumbia"], proposed_genre_name: null, proposed_parent_id: null, confidence: 0.4 });

    const [unplaced] = toProposalDrafts(batch, [
      mapping({ value: "psychedelic cumbia", action: "new_genre", proposed_genre: "Psych Cumbia", genres: ["Cumbia"] }),
    ], taxonomy, 5);
    expect(unplaced).toMatchObject({ action: "map", target_genre_ids: ["cumbia"] });
  });

  it("maps a 'new' genre that already exists to it", () => {
    const [draft] = toProposalDrafts(batch, [
      mapping({ value: "psychedelic cumbia", action: "new_genre", proposed_genre: "cumbia", proposed_parent: "Latin", confidence: 0.7 }),
    ], taxonomy, 5);
    expect(draft).toMatchObject({ action: "map", target_genre_ids: ["cumbia"], confidence: 0.7 });
  });

  it("ignores unknown values, duplicates and maps with nothing resolvable", () => {
    const drafts = toProposalDrafts(batch, [
      mapping({ value: "not in batch", action: "drop" }),
      mapping({ value: "asdf", action: "drop", confidence: Number.NaN }),
      mapping({ value: "asdf", action: "descriptor" }),
      mapping({ value: "uplifting", action: "map", genres: ["Nonexistent"] }),
      mapping({ value: "cumbia rebajada", action: "new_genre", proposed_genre: null }),
    ], taxonomy, 5);
    expect(drafts).toEqual([expect.objectContaining({ value_normalized: "asdf", action: "drop", confidence: 0 })]);
  });
});

describe("mapValuesWithAi", () => {
  beforeEach(() => create.mockReset());

  it("sends the batch with the schema and returns drafts and usage", async () => {
    create.mockResolvedValue({
      status: "completed",
      usage: { input_tokens: 1000, output_tokens: 100 },
      output_text: JSON.stringify({ results: [mapping({ value: "asdf", action: "drop" })] }),
    });
    const result = await mapValuesWithAi(batch, taxonomy, 5);
    expect(result.drafts).toHaveLength(1);
    expect(result.usage).toEqual({ input_tokens: 1000, output_tokens: 100, cost_usd: costOf(1000, 100) });
    const request = create.mock.calls[0][0];
    expect(request.text.format.name).toBe("genre_reconciliation");
    expect(request.input[1].content).toContain("psychedelic cumbia");
  });

  it("throws with usage attached on incomplete or non-JSON output", async () => {
    create.mockResolvedValueOnce({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, usage: { input_tokens: 5, output_tokens: 6 } });
    await expect(mapValuesWithAi(batch, taxonomy, 5)).rejects.toMatchObject({
      message: "Model output incomplete: max_output_tokens",
      usage: { input_tokens: 5, output_tokens: 6 },
    });
    create.mockResolvedValueOnce({ status: "incomplete", output_text: "" });
    await expect(mapValuesWithAi(batch, taxonomy, 5)).rejects.toThrow("Model output incomplete: unknown");
    create.mockResolvedValueOnce({ status: "completed", output_text: "not json" });
    await expect(mapValuesWithAi(batch, taxonomy, 5)).rejects.toMatchObject({
      message: "Model returned non-JSON output",
      usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 },
    });
  });
});
