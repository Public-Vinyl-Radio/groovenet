import { describe, expect, it } from "vitest";
import { displayWidth, fit, fitRight, progressBar, sliceWidth, truncate, wrap } from "./text.js";

const COMBINING = "Café"; // "Café" spelled with a combining acute accent

describe("display width", () => {
  it("counts wide characters as two cells and combining marks as none", () => {
    expect(displayWidth("Money Trees")).toBe(11);
    expect(displayWidth("東京")).toBe(4);
    expect(displayWidth("🎧")).toBe(2);
    expect(displayWidth(COMBINING)).toBe(4);
  });

  it("slices by cells without splitting a wide character or a combining sequence", () => {
    expect(sliceWidth("東京の夜", 5)).toBe("東京");
    expect(sliceWidth(COMBINING, 4)).toBe(COMBINING);
    expect(sliceWidth(COMBINING, 3)).toBe("Caf");
    expect(sliceWidth("abc", 0)).toBe("");
  });
});

describe("truncate and fit", () => {
  it("truncates with an ellipsis by display width", () => {
    expect(truncate("Money Trees", 20)).toBe("Money Trees");
    expect(truncate("Money Trees", 6)).toBe("Money…");
    expect(truncate("東京の夜", 6)).toBe("東京…");
    expect(truncate("東京の夜", 4)).toBe("東…");
    expect(truncate("Money", 0)).toBe("");
  });

  it("pads or cuts to an exact width, left or right aligned", () => {
    expect(fit("ab", 4)).toBe("ab  ");
    expect(fit("東京の夜", 5)).toBe("東京…");
    expect(displayWidth(fit("東京の夜", 6))).toBe(6);
    expect(fit(COMBINING, 6)).toBe(`${COMBINING}  `);
    expect(fit("abc", -1)).toBe("");
    expect(fitRight("7", 3)).toBe("  7");
    expect(fitRight("東京の夜", 5)).toBe("東京…");
  });
});

describe("progressBar", () => {
  it("fills by fraction and is empty when the duration is unknown", () => {
    expect(progressBar(44, 386, 6)).toBe("━─────");
    expect(progressBar(386, 386, 4)).toBe("━━━━");
    expect(progressBar(10, null, 3)).toBe("───");
    expect(progressBar(10, 100, 0)).toBe("");
  });
});

describe("wrap", () => {
  it("wraps on words by display width", () => {
    expect(wrap("one two three", 7)).toEqual(["one two", "three"]);
    expect(wrap("東京 の夜", 4)).toEqual(["東京", "の夜"]);
    expect(wrap("  ", 5)).toEqual([]);
    expect(wrap("anything", 0)).toEqual([]);
  });

  it("breaks a word wider than the line", () => {
    expect(wrap("abcdefgh ij", 3)).toEqual(["abc", "def", "gh", "ij"]);
    expect(wrap("ab abcdefg", 4)).toEqual(["ab", "abcd", "efg"]);
  });

  it("still places a wide character on a one-cell line", () => {
    expect(wrap("東京", 1)).toEqual(["東", "京"]);
  });
});
