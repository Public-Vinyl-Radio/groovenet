import { describe, expect, it } from "vitest";
import {
  BPM_CONFIDENCE_LOW_THRESHOLD,
  extractBpmConfidence,
  formatBpmConfidencePercent,
  isBpmConfidenceLow,
} from "@/lib/essentiaBpm";

describe("extractBpmConfidence", () => {
  it("is the margin between the first and second peak weights (the #531 track)", () => {
    expect(
      extractBpmConfidence({
        bpm: 103.48,
        bpm_histogram_first_peak_weight: 0.282122910023,
        bpm_histogram_second_peak_weight: 0.0241286866367,
      }),
    ).toBe(0.258);
  });

  it("is small for a contested pair, even with a respectable first weight", () => {
    expect(
      extractBpmConfidence({
        bpm_histogram_first_peak_weight: 0.3,
        bpm_histogram_second_peak_weight: 0.28,
      }),
    ).toBe(0.02);
  });

  it("treats a missing second peak as nothing competing", () => {
    expect(extractBpmConfidence({ bpm_histogram_first_peak_weight: 0.7 })).toBe(0.7);
  });

  it("clamps a second peak heavier than the first to 0", () => {
    expect(
      extractBpmConfidence({
        bpm_histogram_first_peak_weight: 0.2,
        bpm_histogram_second_peak_weight: 0.25,
      }),
    ).toBe(0);
  });

  it("is null without a usable first-peak weight", () => {
    expect(extractBpmConfidence(undefined)).toBeNull();
    expect(extractBpmConfidence({ bpm: 120 })).toBeNull();
    expect(extractBpmConfidence({ bpm_histogram_first_peak_weight: Number.NaN })).toBeNull();
  });

  it("ignores a non-finite second weight", () => {
    expect(
      extractBpmConfidence({
        bpm_histogram_first_peak_weight: 0.5,
        bpm_histogram_second_peak_weight: Number.POSITIVE_INFINITY,
      }),
    ).toBe(0.5);
  });
});

describe("isBpmConfidenceLow", () => {
  it("flags a margin below the threshold", () => {
    expect(isBpmConfidenceLow(0.02)).toBe(true);
    expect(isBpmConfidenceLow(BPM_CONFIDENCE_LOW_THRESHOLD - 0.001)).toBe(true);
  });

  it("does not flag the threshold or above", () => {
    expect(isBpmConfidenceLow(BPM_CONFIDENCE_LOW_THRESHOLD)).toBe(false);
    expect(isBpmConfidenceLow(0.258)).toBe(false);
  });

  it("does not flag an unknown confidence", () => {
    expect(isBpmConfidenceLow(null)).toBe(false);
    expect(isBpmConfidenceLow(undefined)).toBe(false);
  });
});

describe("formatBpmConfidencePercent", () => {
  it("rounds to a whole percentage", () => {
    expect(formatBpmConfidencePercent(0.258)).toBe(26);
  });

  it("is null when there's nothing to show", () => {
    expect(formatBpmConfidencePercent(null)).toBeNull();
    expect(formatBpmConfidencePercent(undefined)).toBeNull();
  });
});
