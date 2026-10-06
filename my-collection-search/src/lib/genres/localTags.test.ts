import { describe, expect, it } from "vitest";
import { collectLocalTagValues, localTagValues, splitLocalTags } from "./localTags";

// Baseline examples from the prod survey in #368.
describe("splitLocalTags", () => {
  it("splits on the middle dot, bullet and comma", () => {
    expect(splitLocalTags("psychedelic soul · desert psych · cinematic instrumental")).toEqual([
      "psychedelic soul", "desert psych", "cinematic instrumental",
    ]);
    expect(splitLocalTags("Cumbia • Chicha")).toEqual(["Cumbia", "Chicha"]);
    expect(splitLocalTags("Salsa, Boogaloo")).toEqual(["Salsa", "Boogaloo"]);
  });

  it("does not split on a slash", () => {
    expect(splitLocalTags("Funk / Soul")).toEqual(["Funk / Soul"]);
  });

  it("drops blanks and handles empty input", () => {
    expect(splitLocalTags(" , · Cumbia Colombiana ,, ")).toEqual(["Cumbia Colombiana"]);
    expect(splitLocalTags("")).toEqual([]);
    expect(splitLocalTags(null)).toEqual([]);
    expect(splitLocalTags(undefined)).toEqual([]);
  });
});

describe("localTagValues", () => {
  it("folds case, Unicode hyphens and whitespace, then de-duplicates", () => {
    expect(localTagValues("Indie rock, Indie Rock")).toEqual(["indie rock"]);
    expect(localTagValues("Post‑punk · Post-Punk")).toEqual(["post-punk"]);
    expect(localTagValues("Latin  rock,Latin Rock")).toEqual(["latin rock"]);
  });
});

describe("collectLocalTagValues", () => {
  const tracks = [
    { track_id: "1", friend_id: 6, local_tags: "Psychedelic Cumbia", styles: ["Cumbia"] },
    { track_id: "2", friend_id: 6, local_tags: "psychedelic cumbia · Chicha", styles: ["Cumbia", "Psychedelic Rock"] },
    { track_id: "3", friend_id: 6, local_tags: "Psychedelic Cumbia, Psychedelic Cumbia", styles: null },
    { track_id: "4", friend_id: 7, local_tags: "Feminist Anthem" },
    { track_id: "5", friend_id: 7, local_tags: null },
  ];

  it("counts each track once per value, keeping spellings and album styles", () => {
    const values = collectLocalTagValues(tracks);
    expect(values.map((v) => [v.value_normalized, v.track_count])).toEqual([
      ["psychedelic cumbia", 3],
      ["chicha", 1],
      ["feminist anthem", 1],
    ]);
    expect(values[0].raw_examples).toEqual(["Psychedelic Cumbia", "psychedelic cumbia"]);
    expect(values[0].styles).toEqual(["Cumbia", "Psychedelic Rock"]);
    expect(values[2].styles).toEqual([]);
  });

  it("caps examples and styles", () => {
    const [value] = collectLocalTagValues(tracks, { maxExamples: 1, maxStyles: 1 });
    expect(value.raw_examples).toEqual(["Psychedelic Cumbia"]);
    expect(value.styles).toEqual(["Cumbia"]);
  });
});
