import { describe, expect, it } from "vitest";
import { EMPTY_RECAP, OCTOBER_RECAP } from "@/stories/fixtures/spinRecap";
import {
  alignGenreMix,
  bpmCaption,
  busiestBlock,
  busiestCaption,
  describeBpm,
  describeChange,
  describeHeatmap,
  formatBlock,
  formatBpmBin,
  formatRecapHours,
  genreDelta,
  genreTint,
  heatLevels,
  monthWord,
  percent,
  recapWeeks,
  relativeWidths,
} from "./recapCharts";

const genre = (genre_id: string | null, spins: number, total: number) => ({
  genre_id,
  name: genre_id ?? "Other",
  spins,
  share: spins / total,
});

describe("formatRecapHours", () => {
  it("shows one decimal under 10 and whole hours from 10", () => {
    expect(formatRecapHours(4.46, 1)).toBe("4.5");
    expect(formatRecapHours(12.6, 1)).toBe("13");
  });

  it("marks hours as approximate when some spins had no duration", () => {
    expect(formatRecapHours(8.4, 0.92)).toBe("≈8.4");
    expect(formatRecapHours(0, 0)).toBe("≈0");
  });
});

describe("describeChange", () => {
  it("signs a change up or down against last month", () => {
    expect(describeChange(120, 104, "SEP")).toBe("+16 VS SEP");
    expect(describeChange(4, 6, "SEPTEMBER")).toBe("−2 VS SEPTEMBER");
  });

  it("says SAME for no change", () => {
    expect(describeChange(31, 31, "SEP")).toBe("SAME AS SEP");
  });

  it("says there is nothing to compare with when last month had no spins", () => {
    expect(describeChange(12, 0, "SEP", { noPrevious: true })).toBe("NO SPINS IN SEP");
  });

  it("compares hours as the tiles round them", () => {
    expect(describeChange(8.4, 9.1, "SEP", { hours: true })).toBe("−0.7 VS SEP");
    expect(describeChange(12.4, 10.6, "SEP", { hours: true })).toBe("+1 VS SEP");
    expect(describeChange(4.44, 4.41, "SEP", { hours: true })).toBe("SAME AS SEP");
  });
});

describe("monthWord", () => {
  it("names the month short or long", () => {
    expect(monthWord("2026-09")).toBe("SEP");
    expect(monthWord("2026-09", false)).toBe("SEPTEMBER");
  });
});

describe("recapWeeks", () => {
  it("gives a 28-day month four full weeks", () => {
    const weeks = recapWeeks("2026-02");
    expect(weeks.map((week) => week.label)).toEqual(["WK 1", "WK 2", "WK 3", "WK 4"]);
    expect(weeks[3].range).toBe("Feb 22–28");
  });

  it("gives a 31-day month a short fifth week", () => {
    const weeks = recapWeeks("2026-10", OCTOBER_RECAP.by_week);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual({
      week: 1,
      label: "WK 1",
      range: "Oct 1–7",
      vinyl: 8,
      digital: 12,
    });
    expect(weeks[4].range).toBe("Oct 29–31");
  });

  it("names a one-day fifth week by its day", () => {
    expect(recapWeeks("2024-02")[4].range).toBe("Feb 29");
  });

  it("counts a week the API left out as empty", () => {
    expect(recapWeeks("2026-10", [])[2]).toMatchObject({ vinyl: 0, digital: 0 });
  });
});

describe("alignGenreMix", () => {
  it("keeps this month's order and tints, folding last month's other genres into Other", () => {
    const mix = alignGenreMix(OCTOBER_RECAP.genre_mix.current, OCTOBER_RECAP.genre_mix.previous);
    expect(mix.rows.map((row) => [row.key, row.tint])).toEqual([
      ["g-latin", 100],
      ["g-rock", 70],
      ["g-electronic", 50],
      ["g-hiphop", 34],
      ["g-pop", 20],
      ["other", 8],
    ]);
    // Pop wasn't in September's top genres; Jazz was, and joins Other.
    expect(mix.rows.find((row) => row.key === "g-pop")?.previousShare).toBeNull();
    expect(mix.rows.find((row) => row.key === "other")?.previousShare).toBeCloseTo(0.1971);
    expect(mix.previous?.map((row) => row.key)).toEqual([
      "g-latin",
      "g-rock",
      "g-electronic",
      "g-hiphop",
      "other",
    ]);
  });

  it("has nothing to compare when last month had no spins", () => {
    const mix = alignGenreMix([genre("g-latin", 4, 4), genre(null, 0, 4)], [genre(null, 0, 1)]);
    expect(mix.previous).toBeNull();
    expect(mix.rows).toHaveLength(1);
    expect(mix.rows[0].previousShare).toBeNull();
  });

  it("shows Other with no spins this month when last month's bar needs it", () => {
    const mix = alignGenreMix([genre("g-latin", 5, 5), genre(null, 0, 5)], [genre("g-rock", 3, 3)]);
    expect(mix.rows.map((row) => [row.name, row.spins])).toEqual([
      ["g-latin", 5],
      ["Other", 0],
    ]);
    expect(mix.previous).toEqual([{ ...mix.rows[1], share: 1 }]);
  });

  it("copes with mixes that carry no Other at all", () => {
    const folded = alignGenreMix([genre("g-latin", 5, 5)], [genre("g-rock", 3, 3)]);
    expect(folded.rows.map((row) => [row.name, row.spins])).toEqual([
      ["g-latin", 5],
      ["Other", 0],
    ]);
    const same = alignGenreMix([genre("g-latin", 5, 5)], [genre("g-latin", 3, 3)]);
    expect(same.rows.map((row) => row.key)).toEqual(["g-latin"]);
    expect(same.rows[0].previousShare).toBe(1);
  });

  it("reuses the lightest tint past the sixth genre", () => {
    expect(genreTint(9)).toBe(8);
  });
});

describe("genreDelta", () => {
  it("shows a rise, a fall and no change in share points", () => {
    expect(genreDelta(0.3375, 0.2404)).toEqual({ text: "▲ 10%", label: "up 10 points" });
    expect(genreDelta(0.2167, 0.298)).toEqual({ text: "▼ 8%", label: "down 8 points" });
    expect(genreDelta(0.1, 0.102)).toEqual({ text: "— 0%", label: "no change" });
  });

  it("marks a genre that wasn't there last month as new", () => {
    expect(genreDelta(0.08, null)).toEqual({ text: "NEW", label: "new this month" });
  });
});

describe("relativeWidths and percent", () => {
  it("scales to the largest and copes with nothing", () => {
    expect(relativeWidths([14, 7, 0])).toEqual([100, 50, 0]);
    expect(relativeWidths([0, 0])).toEqual([0, 0]);
    expect(relativeWidths([])).toEqual([]);
    expect(percent(48, 120)).toBe(40);
    expect(percent(1, 0)).toBe(0);
  });
});

describe("heatLevels", () => {
  it("leaves every cell empty when there are no spins", () => {
    const levels = heatLevels(EMPTY_RECAP.heatmap);
    expect(levels.flat().every((level) => level === 0)).toBe(true);
    expect(levels).toHaveLength(7);
  });

  it("steps cells by share of the busiest, never rounding a spin down to empty", () => {
    expect(heatLevels([[0, 1, 4, 7]])).toEqual([[0, 1, 3, 4]]);
  });
});

describe("formatBlock", () => {
  it("names two-hour blocks across midnight and noon", () => {
    expect(formatBlock(0)).toBe("12–2 AM");
    expect(formatBlock(5)).toBe("10 AM–12 PM");
    expect(formatBlock(6)).toBe("12–2 PM");
    expect(formatBlock(10)).toBe("8–10 PM");
    expect(formatBlock(11)).toBe("10 PM–12 AM");
  });
});

describe("busiest block", () => {
  it("captions the most-spun block", () => {
    expect(busiestCaption(OCTOBER_RECAP.heatmap)).toBe("BUSIEST · SAT 8–10 PM");
  });

  it("breaks ties toward the start of the week", () => {
    expect(
      busiestBlock([
        [0, 3],
        [3, 0],
      ]),
    ).toEqual({ weekday: 0, block: 1, spins: 3 });
  });

  it("has no caption without spins", () => {
    expect(busiestCaption(EMPTY_RECAP.heatmap)).toBeNull();
    expect(describeHeatmap(EMPTY_RECAP.heatmap)).toContain("No spins.");
  });

  it("names the busiest block and each day's total for screen readers", () => {
    const label = describeHeatmap(OCTOBER_RECAP.heatmap);
    expect(label).toContain("Busiest: Saturday 8–10 PM, 7 spins.");
    expect(label).toContain("Monday 8, Tuesday 14");
  });
});

describe("BPM captions", () => {
  const { bpm } = OCTOBER_RECAP;

  it("names the open-ended first and last bins", () => {
    expect(formatBpmBin(bpm.histogram[0], 0, 12)).toBe("UNDER 90");
    expect(formatBpmBin(bpm.histogram[11], 11, 12)).toBe("190+");
    expect(formatBpmBin(bpm.histogram[4], 4, 12)).toBe("120–130");
  });

  it("gives the median and the busiest range", () => {
    expect(bpmCaption(bpm)).toBe("MEDIAN 162 BPM · MOST IN 160–170");
    expect(bpmCaption({ ...bpm, median: 121.5, busiest: bpm.histogram[0] })).toBe(
      "MEDIAN 122 BPM · MOST IN UNDER 90",
    );
    expect(bpmCaption({ ...bpm, busiest: null })).toBe("MEDIAN 162 BPM");
  });

  it("has no caption when no spin had a tempo", () => {
    expect(bpmCaption(EMPTY_RECAP.bpm)).toBeNull();
  });

  it("reads out every bin", () => {
    const label = describeBpm(bpm);
    expect(label).toContain("Median 162 BPM.");
    expect(label).toContain("under 90 BPM 1, 90–100 BPM 2");
    expect(label).toContain("190+ BPM 7");
    expect(describeBpm(EMPTY_RECAP.bpm)).not.toContain("Median");
  });
});
