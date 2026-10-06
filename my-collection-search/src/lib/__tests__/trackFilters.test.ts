import { describe, it, expect } from "vitest";
import {
  buildSearchFilters,
  hasActiveFilters,
  getActiveFilterCount,
  createEmptyFilters,
  MUSICAL_KEYS,
  KEY_FILTER_OPTIONS,
  keyFilterLabel,
  attributeFilterChips,
  attributeFiltersFromParams,
  removeAttributeChip,
  toggleTracksFilter,
  tracksFilterFromParams,
  writeTrackFiltersToParams,
} from "../trackFilters";

// Mirror of TracksFilter to avoid importing from a React component
type TracksFilter = {
  missingAudio?: boolean;
  missingAppleMusic?: boolean;
  missingYouTube?: boolean;
  missingSoundCloud?: boolean;
  missingAnyStreamingUrl?: boolean;
  missingMetadata?: boolean;
};

const empty: TracksFilter = {
  missingAudio: false,
  missingAppleMusic: false,
  missingYouTube: false,
  missingSoundCloud: false,
  missingAnyStreamingUrl: false,
  missingMetadata: false,
};

describe("buildSearchFilters", () => {
  it("returns empty array for no active filters", () => {
    expect(buildSearchFilters(empty)).toEqual([]);
  });

  it("adds local_audio_url IS NULL for missingAudio", () => {
    expect(buildSearchFilters({ ...empty, missingAudio: true })).toEqual([
      "local_audio_url IS NULL",
    ]);
  });

  it("adds bpm/key IS NULL for missingMetadata", () => {
    expect(buildSearchFilters({ ...empty, missingMetadata: true })).toEqual([
      "(bpm IS NULL OR key IS NULL)",
    ]);
  });

  it("adds all-streaming-urls filter for missingAnyStreamingUrl", () => {
    expect(buildSearchFilters({ ...empty, missingAnyStreamingUrl: true })).toEqual([
      "(apple_music_url IS NULL AND youtube_url IS NULL AND soundcloud_url IS NULL)",
    ]);
  });

  it("adds individual apple_music_url filter", () => {
    expect(buildSearchFilters({ ...empty, missingAppleMusic: true })).toEqual([
      "apple_music_url IS NULL",
    ]);
  });

  it("adds individual youtube_url filter", () => {
    expect(buildSearchFilters({ ...empty, missingYouTube: true })).toEqual([
      "youtube_url IS NULL",
    ]);
  });

  it("adds individual soundcloud_url filter", () => {
    expect(buildSearchFilters({ ...empty, missingSoundCloud: true })).toEqual([
      "soundcloud_url IS NULL",
    ]);
  });

  it("missingAnyStreamingUrl suppresses individual streaming filters", () => {
    const filters = buildSearchFilters({
      ...empty,
      missingAnyStreamingUrl: true,
      missingAppleMusic: true,
      missingYouTube: true,
    });
    expect(filters).toEqual([
      "(apple_music_url IS NULL AND youtube_url IS NULL AND soundcloud_url IS NULL)",
    ]);
    expect(filters).not.toContain("apple_music_url IS NULL");
  });

  it("combines multiple independent filters", () => {
    const filters = buildSearchFilters({
      ...empty,
      missingAudio: true,
      missingMetadata: true,
      missingAppleMusic: true,
    });
    expect(filters).toContain("local_audio_url IS NULL");
    expect(filters).toContain("(bpm IS NULL OR key IS NULL)");
    expect(filters).toContain("apple_music_url IS NULL");
    expect(filters).toHaveLength(3);
  });
});

describe("hasActiveFilters", () => {
  it("returns false for all-false filters", () => {
    expect(hasActiveFilters(empty)).toBe(false);
  });

  it("returns true when any filter is active", () => {
    expect(hasActiveFilters({ ...empty, missingAudio: true })).toBe(true);
    expect(hasActiveFilters({ ...empty, missingMetadata: true })).toBe(true);
    expect(hasActiveFilters({ ...empty, missingAnyStreamingUrl: true })).toBe(true);
  });
});

describe("getActiveFilterCount", () => {
  it("returns 0 for no active filters", () => {
    expect(getActiveFilterCount(empty)).toBe(0);
  });

  it("counts each active filter", () => {
    expect(getActiveFilterCount({ ...empty, missingAudio: true })).toBe(1);
    expect(getActiveFilterCount({ ...empty, missingAudio: true, missingMetadata: true })).toBe(2);
  });

  it("counts all 6 filters when all are active", () => {
    const all: TracksFilter = {
      missingAudio: true,
      missingAppleMusic: true,
      missingYouTube: true,
      missingSoundCloud: true,
      missingAnyStreamingUrl: true,
      missingMetadata: true,
    };
    expect(getActiveFilterCount(all)).toBe(6);
  });
});

describe("createEmptyFilters", () => {
  it("returns an object with all filters set to false", () => {
    const filters = createEmptyFilters();
    expect(Object.values(filters).every((v) => v === false)).toBe(true);
  });

  it("has all expected filter keys", () => {
    const filters = createEmptyFilters();
    expect(filters).toHaveProperty("missingAudio", false);
    expect(filters).toHaveProperty("missingAppleMusic", false);
    expect(filters).toHaveProperty("missingYouTube", false);
    expect(filters).toHaveProperty("missingSoundCloud", false);
    expect(filters).toHaveProperty("missingAnyStreamingUrl", false);
    expect(filters).toHaveProperty("missingMetadata", false);
  });
});

describe("toggleTracksFilter (#447)", () => {
  it("flips one check", () => {
    expect(toggleTracksFilter(empty, "missingAudio").missingAudio).toBe(true);
    expect(toggleTracksFilter({ ...empty, missingAudio: true }, "missingAudio").missingAudio).toBe(false);
  });

  it("clears the single services when any streaming URL turns on, and not when it turns off", () => {
    const services = { ...empty, missingYouTube: true, missingSoundCloud: true };
    expect(toggleTracksFilter(services, "missingAnyStreamingUrl")).toEqual({
      ...empty,
      missingAnyStreamingUrl: true,
    });
    const anyOn = { ...empty, missingAnyStreamingUrl: true };
    expect(toggleTracksFilter(anyOn, "missingAnyStreamingUrl")).toEqual(empty);
  });
});

describe("tracksFilterFromParams (#447)", () => {
  it("reads the existing missing*=1 parameters", () => {
    const params = new URLSearchParams("missingAudio=1&missingYouTube=1&missingMetadata=0");
    expect(tracksFilterFromParams(params)).toEqual({
      ...empty,
      missingAudio: true,
      missingYouTube: true,
    });
  });

  it("drops single services that any streaming URL already covers", () => {
    const params = new URLSearchParams("missingAnyStreamingUrl=1&missingAppleMusic=1");
    expect(tracksFilterFromParams(params)).toEqual({ ...empty, missingAnyStreamingUrl: true });
  });

  it("is empty without params", () => {
    expect(tracksFilterFromParams(null)).toEqual(empty);
  });
});

describe("attributeFiltersFromParams (#447)", () => {
  it("reads the BPM range, key and rating", () => {
    const params = new URLSearchParams("bpm_min=120&bpm_max=126.5&key=A+minor&star_rating=4");
    expect(attributeFiltersFromParams(params)).toEqual({
      bpm_min: 120,
      bpm_max: 126.5,
      key: "A minor",
      star_rating: 4,
    });
  });

  it("keeps an open-ended range", () => {
    expect(attributeFiltersFromParams(new URLSearchParams("bpm_min=120"))).toEqual({ bpm_min: 120 });
    expect(attributeFiltersFromParams(new URLSearchParams("bpm_max=90"))).toEqual({ bpm_max: 90 });
  });

  it("drops what the API would reject or what filters nothing", () => {
    const params = new URLSearchParams("bpm_min=130&bpm_max=120&key=++&star_rating=0");
    expect(attributeFiltersFromParams(params)).toEqual({});
    const junk = new URLSearchParams("bpm_min=fast&bpm_max=-3&star_rating=9");
    expect(attributeFiltersFromParams(junk)).toEqual({});
    expect(attributeFiltersFromParams(new URLSearchParams("star_rating=2.5"))).toEqual({});
  });

  it("is empty without params", () => {
    expect(attributeFiltersFromParams(null)).toEqual({});
    expect(attributeFiltersFromParams(new URLSearchParams("bpm_min="))).toEqual({});
  });
});

describe("writeTrackFiltersToParams (#447)", () => {
  it("sets what is on, removes what is off, and leaves other params alone", () => {
    const params = new URLSearchParams("q=dub&missingYouTube=1&key=C+major&bpm_max=140");
    writeTrackFiltersToParams(
      params,
      { ...empty, missingAudio: true },
      { bpm_min: 120, star_rating: 3 }
    );
    expect(params.toString()).toBe("q=dub&missingAudio=1&bpm_min=120&star_rating=3");
  });

  it("round-trips through the readers", () => {
    const params = new URLSearchParams();
    const attributes = { bpm_min: 98, bpm_max: 104, key: "F# minor", star_rating: 5 };
    writeTrackFiltersToParams(params, { ...empty, missingMetadata: true }, attributes);
    expect(attributeFiltersFromParams(params)).toEqual(attributes);
    expect(tracksFilterFromParams(params)).toEqual({ ...empty, missingMetadata: true });
  });
});

describe("attribute filter chips (#447)", () => {
  const labels = (attributes: Parameters<typeof attributeFilterChips>[0]) =>
    attributeFilterChips(attributes).map((chip) => chip.label);

  it("labels each filter, with the BPM range as one chip", () => {
    expect(labels({ bpm_min: 120, bpm_max: 126, key: "A minor", star_rating: 4 })).toEqual([
      "120–126 BPM",
      "8A · A minor",
      "★4+",
    ]);
    expect(labels({ bpm_min: 120, bpm_max: 120 })).toEqual(["120 BPM"]);
    expect(labels({ bpm_min: 120 })).toEqual(["120+ BPM"]);
    expect(labels({ bpm_max: 90 })).toEqual(["≤90 BPM"]);
    expect(labels({})).toEqual([]);
  });

  it("removes the filter a chip stands for", () => {
    const all = { bpm_min: 120, bpm_max: 126, key: "A minor", star_rating: 4 };
    const [bpm, key, rating] = attributeFilterChips(all).map((chip) => chip.key);
    expect(removeAttributeChip(all, bpm)).toEqual({ key: "A minor", star_rating: 4 });
    expect(removeAttributeChip(all, key)).toEqual({ bpm_min: 120, bpm_max: 126, star_rating: 4 });
    expect(removeAttributeChip(all, rating)).toEqual({ bpm_min: 120, bpm_max: 126, key: "A minor" });
  });

  it("ignores a chip that isn't an attribute's", () => {
    expect(removeAttributeChip({ key: "A minor" }, "missingAudio")).toBeNull();
  });
});

describe("MUSICAL_KEYS", () => {
  it("lists the 24 keys as the library spells them", () => {
    expect(MUSICAL_KEYS).toHaveLength(24);
    expect(MUSICAL_KEYS.slice(0, 4)).toEqual(["C major", "C minor", "C# major", "C# minor"]);
    expect(MUSICAL_KEYS).toContain("Bb minor");
  });
});

describe("key filter labels (#447)", () => {
  it("leads with the Camelot code, and keeps a key it can't place as it is", () => {
    expect(keyFilterLabel("F# minor")).toBe("11A · F# minor");
    expect(keyFilterLabel("a minor")).toBe("8A · a minor");
    expect(keyFilterLabel("H dorian")).toBe("H dorian");
  });

  it("orders the choices round the Camelot wheel, sending the library's spelling", () => {
    expect(KEY_FILTER_OPTIONS).toHaveLength(24);
    expect(KEY_FILTER_OPTIONS.slice(0, 3)).toEqual([
      { value: "Ab minor", label: "1A · Ab minor" },
      { value: "B major", label: "1B · B major" },
      { value: "Eb minor", label: "2A · Eb minor" },
    ]);
    expect(KEY_FILTER_OPTIONS.at(-1)).toEqual({ value: "E major", label: "12B · E major" });
  });
});
