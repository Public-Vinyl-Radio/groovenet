import { describe, expect, it, vi } from "vitest";
import {
  extractKeyAnalysis,
  formatKeyConfidencePercent,
  isKeyConfidenceLow,
  logKeyProfileDisagreement,
} from "@/lib/essentiaKey";

describe("extractKeyAnalysis", () => {
  it("passes a single candidate (key_edma alone) straight through", () => {
    expect(
      extractKeyAnalysis({
        key_edma: { key: "C", scale: "major", strength: 0.6177087426190001 },
      }),
    ).toEqual({ key: "C major", key_confidence: 0.618 });
  });

  it("returns nulls when tonal is missing", () => {
    expect(extractKeyAnalysis(undefined)).toEqual({ key: null, key_confidence: null });
  });

  it("returns nulls when nothing has both a key and a scale", () => {
    expect(extractKeyAnalysis({ key_edma: { strength: 0.5 } })).toEqual({
      key: null,
      key_confidence: null,
    });
  });

  it("returns a null confidence when the single candidate has no strength", () => {
    expect(extractKeyAnalysis({ key_edma: { key: "D", scale: "minor" } })).toEqual({
      key: "D minor",
      key_confidence: null,
    });
  });

  it("picks the unanimous key when all three profiles agree", () => {
    expect(
      extractKeyAnalysis({
        key_edma: { key: "D", scale: "minor", strength: 0.7 },
        key_krumhansl: { key: "D", scale: "minor", strength: 0.75 },
        key_temperley: { key: "D", scale: "minor", strength: 0.8 },
      }),
    ).toEqual({ key: "D minor", key_confidence: 0.75 });
  });

  it("lets a 2-of-3 majority override a minority key_edma (#524: edma is EDM-tuned, often the outlier)", () => {
    // The exact fixture from the original disagreement-log test: edma alone
    // said F major; krumhansl and temperley agreed on C major. The pipeline
    // used to blindly trust edma's minority answer — this is the actual bug
    // the consensus logic fixes (distinct from the issue's own track, where
    // all three profiles agreed — see the chords_key tests below).
    expect(
      extractKeyAnalysis({
        key_edma: { key: "F", scale: "major", strength: 0.62 },
        key_krumhansl: { key: "C", scale: "major", strength: 0.58 },
        key_temperley: { key: "C", scale: "major", strength: 0.55 },
      }),
    ).toEqual({ key: "C major", key_confidence: 0.565 });
  });

  it("averages only the agreeing pair's strengths, ignoring the minority's", () => {
    const { key_confidence } = extractKeyAnalysis({
      key_edma: { key: "F", scale: "major", strength: 0.99 },
      key_krumhansl: { key: "C", scale: "major", strength: 0.5 },
      key_temperley: { key: "C", scale: "major", strength: 0.5 },
    });
    expect(key_confidence).toBe(0.5);
  });

  it("ignores a missing strength within the majority when averaging", () => {
    expect(
      extractKeyAnalysis({
        key_edma: { key: "F", scale: "major" },
        key_krumhansl: { key: "F", scale: "major", strength: 0.6 },
      }),
    ).toEqual({ key: "F major", key_confidence: 0.6 });
  });

  it("falls back to the highest-strength estimate when all three disagree", () => {
    expect(
      extractKeyAnalysis({
        key_edma: { key: "F", scale: "major", strength: 0.5 },
        key_krumhansl: { key: "C", scale: "major", strength: 0.6 },
        key_temperley: { key: "G", scale: "major", strength: 0.4 },
      }),
    ).toEqual({ key: "C major", key_confidence: 0.6 });
  });

  it("falls back to edma when strengths are missing or tied (today's default order)", () => {
    expect(
      extractKeyAnalysis({
        key_edma: { key: "F", scale: "major" },
        key_krumhansl: { key: "C", scale: "major" },
        key_temperley: { key: "G", scale: "major" },
      }),
    ).toEqual({ key: "F major", key_confidence: null });
  });

  it("treats two agreeing candidates as a majority even with the third profile missing", () => {
    expect(
      extractKeyAnalysis({
        key_edma: { key: "F", scale: "major", strength: 0.5 },
        key_krumhansl: { key: "F", scale: "major", strength: 0.7 },
      }),
    ).toEqual({ key: "F major", key_confidence: 0.6 });
  });

  it("falls back to the stronger of two disagreeing candidates when the third profile is missing", () => {
    expect(
      extractKeyAnalysis({
        key_edma: { key: "F", scale: "major", strength: 0.5 },
        key_krumhansl: { key: "C", scale: "major", strength: 0.7 },
      }),
    ).toEqual({ key: "C major", key_confidence: 0.7 });
  });

  it("never lets chords_key participate in the vote", () => {
    // Two profiles would otherwise have no majority partner; chords_key
    // matching one of them must not manufacture a false consensus.
    expect(
      extractKeyAnalysis({
        key_edma: { key: "F", scale: "major", strength: 0.5 },
        key_krumhansl: { key: "C", scale: "major", strength: 0.4 },
        chords_key: "F",
        chords_scale: "major",
      }),
    ).toEqual({ key: "F major", key_confidence: 0.5 });
  });
});

describe("formatKeyConfidencePercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatKeyConfidencePercent(0.6177)).toBe(62);
    expect(formatKeyConfidencePercent(0.565)).toBe(56);
  });

  it("returns null when there is no confidence to show", () => {
    expect(formatKeyConfidencePercent(null)).toBeNull();
    expect(formatKeyConfidencePercent(undefined)).toBeNull();
  });
});

describe("isKeyConfidenceLow", () => {
  it("is true below the threshold", () => {
    expect(isKeyConfidenceLow(0.59)).toBe(true);
  });

  it("is false at or above the threshold", () => {
    expect(isKeyConfidenceLow(0.6)).toBe(false);
    expect(isKeyConfidenceLow(0.9)).toBe(false);
  });

  it("is false when there is no confidence to judge", () => {
    expect(isKeyConfidenceLow(null)).toBe(false);
    expect(isKeyConfidenceLow(undefined)).toBe(false);
  });
});

describe("logKeyProfileDisagreement", () => {
  const context = { track_id: "trk_001", friend_id: 1 };

  it("logs nothing when every estimate agrees", () => {
    const log = vi.fn();
    logKeyProfileDisagreement(
      {
        key_edma: { key: "D", scale: "minor" },
        key_krumhansl: { key: "D", scale: "minor" },
        key_temperley: { key: "D", scale: "minor" },
        chords_key: "D",
        chords_scale: "minor",
      },
      context,
      log,
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("logs edma as disagreeing when krumhansl+temperley outvote it", () => {
    const log = vi.fn();
    logKeyProfileDisagreement(
      {
        key_edma: { key: "F", scale: "major" },
        key_krumhansl: { key: "C", scale: "major" },
        key_temperley: { key: "C", scale: "major" },
      },
      context,
      log,
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("trk_001");
    expect(log.mock.calls[0][0]).toContain("stored key=C major");
    expect(log.mock.calls[0][0]).toContain("edma=F major");
    expect(log.mock.calls[0][0]).not.toContain("krumhansl=");
    expect(log.mock.calls[0][0]).not.toContain("temperley=");
  });

  it("logs a chords_key disagreement even when all three key profiles agree", () => {
    // The real track behind #524: key_edma/krumhansl/temperley all say F
    // major (strengths ~0.68-0.70); only chords_key says C major, matching
    // what tunebat/songbpm reported. The three-profile consensus alone
    // misses this — chosen key stays F major, chords is the only dissenter.
    const log = vi.fn();
    logKeyProfileDisagreement(
      {
        key_edma: { key: "F", scale: "major", strength: 0.704965293407 },
        key_krumhansl: { key: "F", scale: "major", strength: 0.695810675621 },
        key_temperley: { key: "F", scale: "major", strength: 0.680185735226 },
        chords_key: "C",
        chords_scale: "major",
      },
      context,
      log,
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("stored key=F major");
    expect(log.mock.calls[0][0]).not.toContain("edma=");
    expect(log.mock.calls[0][0]).not.toContain("krumhansl=");
    expect(log.mock.calls[0][0]).not.toContain("temperley=");
    expect(log.mock.calls[0][0]).toContain("chords=C major");
  });

  it("logs only the profile that actually disagrees with a 2-of-3 majority", () => {
    const log = vi.fn();
    logKeyProfileDisagreement(
      {
        key_edma: { key: "F", scale: "major" },
        key_krumhansl: { key: "F", scale: "major" },
        key_temperley: { key: "C", scale: "major" },
      },
      context,
      log,
    );
    expect(log.mock.calls[0][0]).not.toContain("krumhansl=");
    expect(log.mock.calls[0][0]).toContain("temperley=C major");
  });

  it("ignores a partial chords estimate (missing scale)", () => {
    const log = vi.fn();
    logKeyProfileDisagreement(
      { key_edma: { key: "F", scale: "major" }, chords_key: "C" },
      context,
      log,
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("does nothing when only one estimate exists and nothing disagrees with it", () => {
    const log = vi.fn();
    logKeyProfileDisagreement({ key_krumhansl: { key: "C", scale: "major" } }, context, log);
    expect(log).not.toHaveBeenCalled();
  });

  it("does nothing when tonal is missing", () => {
    const log = vi.fn();
    logKeyProfileDisagreement(undefined, context, log);
    expect(log).not.toHaveBeenCalled();
  });

  it("defaults to console.warn when no logger is given", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logKeyProfileDisagreement(
      {
        key_edma: { key: "F", scale: "major" },
        key_krumhansl: { key: "C", scale: "major" },
      },
      context,
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
