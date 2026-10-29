import { describe, expect, it } from "vitest";
import { TRACK_MISSING_OPTIONS } from "@/lib/trackFilters";

import { optionStates } from "./MissingFilter";

describe("optionStates (#447)", () => {
  it("ticks the checks that are on", () => {
    const states = optionStates(TRACK_MISSING_OPTIONS, {
      missingAudio: true,
      missingYouTube: true,
    });
    expect(states.filter((s) => s.checked).map((s) => s.option.key)).toEqual([
      "missingAudio",
      "missingYouTube",
    ]);
  });

  it("disables the single services while any streaming URL is on", () => {
    const states = optionStates(TRACK_MISSING_OPTIONS, { missingAnyStreamingUrl: true });
    expect(states.filter((s) => s.disabled).map((s) => s.option.label)).toEqual([
      "Apple Music",
      "YouTube",
      "SoundCloud",
    ]);
  });

  it("disables nothing with every check off", () => {
    expect(optionStates(TRACK_MISSING_OPTIONS, {}).some((s) => s.disabled || s.checked)).toBe(
      false,
    );
  });
});
