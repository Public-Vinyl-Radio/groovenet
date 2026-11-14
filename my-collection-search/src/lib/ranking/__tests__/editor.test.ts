import { describe, expect, it } from "vitest";
import type { RecommendationsResponse } from "@groovenet/contracts";
import {
  CONSTRAINT_DEFAULTS,
  previewRows,
  WEIGHT_SLIDERS,
  whyLine,
  withConstraint,
  withKeyRule,
  withWeight,
} from "../editor";
import { profileToDraft, RANKING_PRESETS } from "../profiles";

const draft = profileToDraft(RANKING_PRESETS.selector, "Mine");

describe("editor drafts", () => {
  it("has a slider per signal, tempo with the widest range", () => {
    expect(WEIGHT_SLIDERS.map((s) => s.id)).toHaveLength(9);
    expect(WEIGHT_SLIDERS.find((s) => s.id === "bpm_distance")?.max).toBe(5);
    expect(WEIGHT_SLIDERS.find((s) => s.id === "rating")).toEqual({
      id: "rating",
      label: "Rating",
      max: 2,
    });
  });

  it("sets a weight, rounded, and drops one set to 0", () => {
    expect(withWeight(draft, "rating", 0.12345).weights.rating).toBe(0.123);
    expect(withWeight(draft, "era", 0).weights).not.toHaveProperty("era");
    expect(draft.weights.era).toBe(0.05);
  });

  it("sets and clears constraints, and maps key modes onto key_rule", () => {
    const on = withConstraint(draft, "energy_range", CONSTRAINT_DEFAULTS.energy_range);
    expect(on.constraints.energy_range).toEqual({ max_drop: 0.2, max_rise: 0.2 });
    expect(withConstraint(on, "energy_range", null).constraints.energy_range).toBeNull();
    expect(withKeyRule(draft, "same").constraints.key_rule).toEqual({ metric: "wheel", max: 0 });
    expect(withKeyRule(draft, "any").constraints.key_rule).toBeNull();
  });
});

const breakdown = (score: number, passed: boolean, prior: number | null = null) => ({
  score,
  passed,
  failed: passed ? [] : (["bpm_window", "energy_range"] as const).slice(),
  prior,
  signals: {
    vibe_similarity: { value: 0.71, weight: 1, contribution: 0.71 },
    identity_similarity: { value: 0.5, weight: 1, contribution: 0 },
    bpm_distance: { value: 0.98, weight: 0.12, contribution: 0.12 },
    key_relation: { value: 0.5, weight: 0.16, contribution: 0.08 },
    energy: { value: 0.2, weight: -0.1, contribution: -0.02 },
  },
});

describe("whyLine", () => {
  it("lists the biggest contributions, similarity plain and the rest signed", () => {
    expect(whyLine(breakdown(0.9, true))).toBe("Vibe 0.71 · BPM +0.12 · Key +0.08");
    expect(whyLine(breakdown(0.9, true), 5)).toBe(
      "Vibe 0.71 · BPM +0.12 · Key +0.08 · Energy −0.02",
    );
  });

  it("names an unknown signal by its id", () => {
    expect(
      whyLine({
        ...breakdown(1, true),
        signals: { tempo: { value: 1, weight: 1, contribution: 1 } } as never,
      }),
    ).toBe("tempo +1.00");
  });
});

describe("previewRows", () => {
  const candidate = (trackId: string, ranking?: ReturnType<typeof breakdown>, title?: unknown) => ({
    trackId,
    friendId: 1,
    simIdentity: null,
    simAudio: 0.7,
    metadata: { title, artist: title ? "A" : undefined, moodRelaxed: null, moodAggressive: null },
    ...(ranking ? { ranking } : {}),
  });
  const response = {
    seedTrackId: "seed",
    seedFriendId: 1,
    candidates: [
      candidate("seed", breakdown(5, true), "Seed"),
      candidate("low", breakdown(0.4, true), "Low"),
      candidate("out", breakdown(0.95, false), "Out"),
      candidate("high", breakdown(0.8, true)),
      candidate("none"),
    ],
  } as unknown as RecommendationsResponse;

  it("lists passing candidates best first, then failures, never the seed", () => {
    const rows = previewRows(response);
    expect(rows.map((r) => r.key)).toEqual(["high:1", "low:1", "out:1"]);
    expect(rows[0]).toMatchObject({
      title: "high",
      artist: "",
      why: "Vibe 0.71 · BPM +0.12 · Key +0.08",
    });
    expect(rows[2].failed).toEqual(["Outside BPM window", "Energy out of range"]);
    expect(previewRows(response, 1)).toHaveLength(1);
  });
});
