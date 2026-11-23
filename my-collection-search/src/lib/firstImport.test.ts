// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFirstImportFlag, writeFirstImportFlag } from "./firstImport";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("first-import flag", () => {
  it("is unset by default and round-trips", () => {
    expect(readFirstImportFlag()).toBeNull();
    writeFirstImportFlag("pending");
    expect(readFirstImportFlag()).toBe("pending");
    writeFirstImportFlag("dismissed");
    expect(readFirstImportFlag()).toBe("dismissed");
  });

  it("ignores a value it doesn't know", () => {
    localStorage.setItem("gn:first-import", "bogus");
    expect(readFirstImportFlag()).toBeNull();
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readFirstImportFlag()).toBeNull();
    expect(() => writeFirstImportFlag("pending")).not.toThrow();
  });
});
