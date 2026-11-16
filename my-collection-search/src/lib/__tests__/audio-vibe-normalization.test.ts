import { describe, it, expect } from "vitest";
import {
  normalizeBpmRange,
  normalizeBpmValue,
  normalizeKey,
  getCamelotCode,
  normalizeDanceability,
  calculateEnergy,
  getDominantMood,
  getVibeDescriptors,
  formatMoodProfile,
  normalizeAcousticElectronic,
  normalizeVocalPresence,
  normalizePercussiveness,
  normalizePartyMood,
} from "../audio-vibe-normalization";

describe("normalizeBpmRange", () => {
  it.each([
    [80, "very slow"],
    [100, "slow"],
    [120, "moderate"],
    [130, "upbeat"],
    [145, "fast"],
    [160, "very fast"],
    [180, "extremely fast"],
    ["128", "upbeat"],
    [null, "unknown"],
    [undefined, "unknown"],
  ])("normalizeBpmRange(%s) === %s", (input, expected) => {
    expect(normalizeBpmRange(input as never)).toBe(expected);
  });
});

describe("normalizeBpmValue", () => {
  it.each([
    [127.8, "128"],
    ["127.3", "127"],
    [null, "unknown"],
    [undefined, "unknown"],
  ])("normalizeBpmValue(%s) === %s", (input, expected) => {
    expect(normalizeBpmValue(input as never)).toBe(expected);
  });
});

describe("normalizeKey", () => {
  it.each([
    ["  C Major  ", "C Major"],
    ["A Minor", "A Minor"],
    [null, "unknown"],
    [undefined, "unknown"],
  ])("normalizeKey(%s) === %s", (input, expected) => {
    expect(normalizeKey(input as never)).toBe(expected);
  });
});

describe("getCamelotCode", () => {
  it.each([
    ["C Major", "8B"],
    ["A Minor", "8A"],
    ["D Major", "10B"],
    ["B Minor", "10A"],
    ["Unknown Key", ""],
    [null, ""],
    // Pinned on purpose (#1211): this feeds the audio vibe embedding text, so
    // changing it moves every audio_vibe vector. Stored spellings ("C major")
    // and the wrong "Db Major" -> 1B stay until the embedding template is
    // versioned (#407).
    ["C major", ""],
    ["F# minor", ""],
    ["Bb major", ""],
    ["Db Major", "1B"],
  ])("getCamelotCode(%s) === %s", (input, expected) => {
    expect(getCamelotCode(input as never)).toBe(expected);
  });
});

describe("normalizeDanceability", () => {
  it.each([
    [0.1, "very low"],
    [0.3, "low"],
    [0.5, "moderate"],
    [0.7, "high"],
    [0.9, "very high"],
    ["0.75", "high"],
    [null, "unknown"],
    [undefined, "unknown"],
  ])("normalizeDanceability(%s) === %s", (input, expected) => {
    expect(normalizeDanceability(input as never)).toBe(expected);
  });
});

describe("calculateEnergy", () => {
  it.each([
    [0.8, 0.2, "moderate"],
    [0.9, 0.9, "very high"],
    [0.1, 0.1, "very low"],
    [null, null, "very low"],
    [0.5, null, "low"],
  ])("calculateEnergy(%s, %s) === %s", (happy, aggressive, expected) => {
    expect(calculateEnergy(happy as never, aggressive as never)).toBe(expected);
  });
});

describe("getDominantMood", () => {
  it.each([
    [{ happy: 0.8, sad: 0.2, relaxed: 0.1, aggressive: 0.1 }, "happy"],
    [{ happy: 0.1, sad: 0.7, relaxed: 0.2, aggressive: 0.1 }, "sad"],
    [{ happy: 0.1, sad: 0.1, relaxed: 0.8, aggressive: 0.2 }, "relaxed"],
    [{ happy: 0.1, sad: 0.1, relaxed: 0.2, aggressive: 0.9 }, "aggressive"],
    [{ happy: 0.2, sad: 0.2, relaxed: 0.2, aggressive: 0.2 }, "neutral"],
    [{}, "neutral"],
  ])("getDominantMood(%o) === %s", (input, expected) => {
    expect(getDominantMood(input as never)).toBe(expected);
  });
});

describe("getVibeDescriptors", () => {
  it("returns downtempo, energetic, uplifting for slow+high energy+happy", () => {
    const descriptors = getVibeDescriptors(95, "high", "happy");
    expect(descriptors).toContain("downtempo");
    expect(descriptors).toContain("energetic");
    expect(descriptors).toContain("uplifting");
  });

  it("returns balanced for neutral", () => {
    expect(getVibeDescriptors(120, "moderate", "neutral")).toEqual(["balanced"]);
  });

  it("returns high-energy, energetic, driving for fast+very high+aggressive", () => {
    const descriptors = getVibeDescriptors(150, "very high", "aggressive");
    expect(descriptors).toContain("high-energy");
    expect(descriptors).toContain("energetic");
    expect(descriptors).toContain("driving");
  });
});

describe("formatMoodProfile", () => {
  it("formats all mood scores", () => {
    const profile = formatMoodProfile({ happy: 0.75, sad: 0.25, relaxed: 0.5, aggressive: 0.1 });
    expect(profile).toContain("Happy (0.75)");
    expect(profile).toContain("Sad (0.25)");
    expect(profile).toContain("Relaxed (0.50)");
    expect(profile).toContain("Aggressive (0.10)");
  });

  it("omits null/undefined/zero scores", () => {
    const profile = formatMoodProfile({ happy: 0.8, sad: null, relaxed: undefined, aggressive: 0 });
    expect(profile).toContain("Happy (0.80)");
    expect(profile).not.toContain("Sad");
    expect(profile).not.toContain("Relaxed");
    expect(profile).not.toContain("Aggressive");
  });

  it("returns 'none' for empty input", () => {
    expect(formatMoodProfile({})).toBe("none");
  });
});

describe("normalizeAcousticElectronic", () => {
  it.each([
    [0.9, 0.1, "very acoustic"],
    [0.6, 0.3, "acoustic"],
    [0.5, 0.5, "balanced"],
    [0.3, 0.6, "electronic"],
    [0.1, 0.9, "very electronic"],
    [0.2, 0.2, "ambiguous"],
    [undefined, undefined, "unknown"],
  ])("normalizeAcousticElectronic(%s, %s) === %s", (a, b, expected) => {
    expect(normalizeAcousticElectronic(a as never, b as never)).toBe(expected);
  });
});

describe("normalizeVocalPresence", () => {
  it.each([
    [0.9, 0.1, "instrumental"],
    [0.7, 0.25, "light vocals"],
    [0.5, 0.5, "moderate vocals"],
    [0.2, 0.8, "heavy vocals"],
    [undefined, undefined, "unknown"],
  ])("normalizeVocalPresence(%s, %s) === %s", (a, b, expected) => {
    expect(normalizeVocalPresence(a as never, b as never)).toBe(expected);
  });
});

describe("normalizePercussiveness", () => {
  it.each([
    [1.5, "sparse"],
    [3, "moderate"],
    [5, "rhythmic"],
    [8, "very rhythmic"],
    [undefined, "unknown"],
  ])("normalizePercussiveness(%s) === %s", (input, expected) => {
    expect(normalizePercussiveness(input as never)).toBe(expected);
  });
});

describe("normalizePartyMood", () => {
  it.each([
    [0.1, "low"],
    [0.3, "moderate"],
    [0.5, "high"],
    [0.8, "very high"],
    [undefined, "unknown"],
  ])("normalizePartyMood(%s) === %s", (input, expected) => {
    expect(normalizePartyMood(input as never)).toBe(expected);
  });
});
