// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isLocalFontInstalled, localFontAccess } from "./localFont";

describe("local fonts without a browser", () => {
  it("has no Local Font Access API on the server", () => {
    expect(localFontAccess()).toBeNull();
  });

  it("can't measure without a document", () => {
    expect(isLocalFontInstalled("Menlo")).toBe(false);
  });
});
