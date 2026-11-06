import { describe, expect, it } from "vitest";
import { compareShelfCodes, parseShelfCode, sortByShelfCode } from "./shelfOrder";

const order = (codes: Array<string | null>) => sortByShelfCode(codes, (code) => code);

describe("parseShelfCode", () => {
  it("splits the series and the number", () => {
    expect(parseShelfCode("LP-182")).toEqual({ series: "LP", number: 182, rest: "" });
    expect(parseShelfCode(" s-013 ")).toEqual({ series: "S", number: 13, rest: "" });
  });

  it("accepts a missing dash and keeps a suffix", () => {
    expect(parseShelfCode("LP001")).toEqual({ series: "LP", number: 1, rest: "" });
    expect(parseShelfCode("LP-004b")).toEqual({ series: "LP", number: 4, rest: "b" });
  });

  it("rejects text without a series and number", () => {
    expect(parseShelfCode("Box set")).toBeNull();
    expect(parseShelfCode("123")).toBeNull();
  });
});

describe("sortByShelfCode", () => {
  it("sorts numbers naturally, not as text", () => {
    expect(order(["LP-100", "LP-010", "LP-004"])).toEqual(["LP-004", "LP-010", "LP-100"]);
    expect(order(["LP-10", "LP-9"])).toEqual(["LP-9", "LP-10"]);
  });

  it("puts LP before S", () => {
    expect(order(["S-013", "LP-182", "S-002", "LP-003"])).toEqual([
      "LP-003",
      "LP-182",
      "S-002",
      "S-013",
    ]);
  });

  it("keeps a malformed code with its series", () => {
    expect(order(["LP-002", "LP001", "LP-003"])).toEqual(["LP001", "LP-002", "LP-003"]);
    expect(order(["S-001", "LP100"])).toEqual(["LP100", "S-001"]);
  });

  it("orders suffixes of the same number", () => {
    expect(order(["LP-004b", "LP-004a"])).toEqual(["LP-004a", "LP-004b"]);
  });

  it("puts unparsed text after codes and records without a code last", () => {
    expect(order([null, "Box set", "S-001", "", "LP-001"])).toEqual([
      "LP-001",
      "S-001",
      "Box set",
      null,
      "",
    ]);
    expect(order(["Zed", "Alpha"])).toEqual(["Alpha", "Zed"]);
  });

  it("keeps the given order for equal codes and does not mutate", () => {
    const items = [
      { id: "a", code: "LP-001" },
      { id: "b", code: null },
      { id: "c", code: "LP-001" },
      { id: "d", code: null },
    ];
    const sorted = sortByShelfCode(items, (item) => item.code);
    expect(sorted.map((item) => item.id)).toEqual(["a", "c", "b", "d"]);
    expect(items.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("compareShelfCodes", () => {
  it("ties two missing codes", () => {
    expect(compareShelfCodes(null, undefined)).toBe(0);
  });
});
