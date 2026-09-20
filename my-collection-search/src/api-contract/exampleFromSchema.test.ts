import { describe, expect, it } from "vitest";
import { exampleFromSchema } from "./exampleFromSchema";

describe("author-supplied values win", () => {
  it("prefers an explicit example over everything else", () => {
    expect(
      exampleFromSchema({ type: "string", enum: ["a"], default: "b", example: "c" })
    ).toBe("c");
  });

  it("uses const when there is no example", () => {
    expect(exampleFromSchema({ type: "string", const: "fixed", default: "d" })).toBe(
      "fixed"
    );
  });

  it("uses default before falling back to a placeholder", () => {
    expect(exampleFromSchema({ type: "string", default: "genetic" })).toBe("genetic");
  });

  it("uses the first enum value", () => {
    expect(
      exampleFromSchema({ type: "string", enum: ["waiting", "active", "completed"] })
    ).toBe("waiting");
  });

  it("prefers default over enum", () => {
    expect(
      exampleFromSchema({ type: "string", enum: ["a", "b"], default: "b" })
    ).toBe("b");
  });

  it("honours a falsy example rather than treating it as absent", () => {
    expect(exampleFromSchema({ type: "integer", example: 0 })).toBe(0);
    expect(exampleFromSchema({ type: "string", example: "" })).toBe("");
    expect(exampleFromSchema({ type: "boolean", example: false })).toBe(false);
  });
});

describe("primitives", () => {
  it.each([
    ["string", "string"],
    ["integer", 1],
    ["number", 1.23],
    ["boolean", true],
    ["null", null],
  ])("renders a %s", (type, expected) => {
    expect(exampleFromSchema({ type })).toEqual(expected);
  });

  it("falls back for an unrecognised type", () => {
    expect(exampleFromSchema({ type: "widget" })).toBe("example");
  });

  it.each([null, undefined, "not a schema", 42])(
    "falls back for a non-object schema (%s)",
    (schema) => {
      expect(exampleFromSchema(schema)).toBe("example");
    }
  );
});

describe("string formats", () => {
  it.each([
    ["date-time", "2026-02-17T12:00:00.000Z"],
    ["date", "2026-02-17"],
    ["uuid", "6f1c2f80-9a3e-4d7b-8c11-2f5a9b0d4e63"],
    ["uri", "https://example.com/resource"],
    ["email", "dj@example.com"],
    ["binary", "<binary>"],
  ])("renders format %s", (format, expected) => {
    expect(exampleFromSchema({ type: "string", format })).toBe(expected);
  });

  it("falls back to a plain placeholder for an unknown format", () => {
    expect(exampleFromSchema({ type: "string", format: "morse" })).toBe("string");
  });
});

describe("type unions", () => {
  it("picks the first non-null type", () => {
    expect(exampleFromSchema({ type: ["null", "integer"] })).toBe(1);
  });

  it("uses null when that is the only type", () => {
    expect(exampleFromSchema({ type: ["null"] })).toBeNull();
  });

  it("keeps the format when narrowing a union", () => {
    expect(exampleFromSchema({ type: ["string", "null"], format: "date" })).toBe(
      "2026-02-17"
    );
  });
});

describe("composition", () => {
  it("takes the first oneOf branch", () => {
    expect(
      exampleFromSchema({
        oneOf: [{ type: "array", items: { type: "number" } }, { type: "string" }],
      })
    ).toEqual([1.23]);
  });

  it("takes the first anyOf branch", () => {
    expect(exampleFromSchema({ anyOf: [{ type: "integer" }, { type: "string" }] })).toBe(1);
  });

  it("merges allOf branches so every property appears", () => {
    expect(
      exampleFromSchema({
        allOf: [
          { type: "object", properties: { alpha: { type: "string" } } },
          { type: "object", properties: { beta: { type: "integer" } } },
        ],
      })
    ).toEqual({ alpha: "string", beta: 1 });
  });

  it("skips allOf branches that are not objects", () => {
    expect(
      exampleFromSchema({
        allOf: [
          null,
          "nonsense",
          { type: "object", properties: { alpha: { type: "string" } } },
        ],
      })
    ).toEqual({ alpha: "string" });
  });

  it("lets a later allOf branch override an earlier property", () => {
    expect(
      exampleFromSchema({
        allOf: [
          { type: "object", properties: { mode: { type: "string" } } },
          { type: "object", properties: { mode: { type: "string", enum: ["fast"] } } },
        ],
      })
    ).toEqual({ mode: "fast" });
  });
});

describe("arrays and objects", () => {
  it("wraps the item example in a single-element array", () => {
    expect(exampleFromSchema({ type: "array", items: { type: "integer" } })).toEqual([1]);
  });

  it("walks nested properties", () => {
    expect(
      exampleFromSchema({
        type: "object",
        properties: {
          id: { type: "string", example: "trk_001" },
          nested: {
            type: "object",
            properties: { bpm: { type: "number", example: 122 } },
          },
        },
      })
    ).toEqual({ id: "trk_001", nested: { bpm: 122 } });
  });

  it("renders a free-form object as {} rather than inventing a key", () => {
    // An invented "exampleKey" reads like a field callers must send.
    expect(exampleFromSchema({ type: "object", additionalProperties: true })).toEqual({});
  });

  it("renders a typed free-form object as {} too", () => {
    expect(
      exampleFromSchema({ type: "object", additionalProperties: { type: "number" } })
    ).toEqual({});
  });

  it("renders an object with no properties as {}", () => {
    expect(exampleFromSchema({ type: "object" })).toEqual({});
  });

  it("prefers declared properties over additionalProperties", () => {
    expect(
      exampleFromSchema({
        type: "object",
        properties: { known: { type: "string" } },
        additionalProperties: true,
      })
    ).toEqual({ known: "string" });
  });
});

describe("property-name fallback", () => {
  it("names the property when the schema says nothing else", () => {
    expect(
      exampleFromSchema({
        type: "object",
        properties: { message: { type: "string" }, track_id: { type: "string" } },
      })
    ).toEqual({ message: "Done", track_id: "trk_001" });
  });

  it("lets a declared format beat the property name", () => {
    expect(
      exampleFromSchema({
        type: "object",
        properties: { id: { type: "string", format: "uuid" } },
      })
    ).toEqual({ id: "6f1c2f80-9a3e-4d7b-8c11-2f5a9b0d4e63" });
  });

  it("lets an explicit example beat the property name", () => {
    expect(
      exampleFromSchema({
        type: "object",
        properties: { message: { type: "string", example: "Custom" } },
      })
    ).toEqual({ message: "Custom" });
  });

  it("falls back to the placeholder for an unknown property name", () => {
    expect(
      exampleFromSchema({ type: "object", properties: { wibble: { type: "string" } } })
    ).toEqual({ wibble: "string" });
  });

  it("carries the name into array items, singularised", () => {
    expect(
      exampleFromSchema({
        type: "object",
        properties: { tracks: { type: "array", items: { type: "object", properties: { track_id: { type: "string" } } } } },
      })
    ).toEqual({ tracks: [{ track_id: "trk_001" }] });
  });

  it("carries the name through a oneOf branch", () => {
    expect(
      exampleFromSchema({
        type: "object",
        properties: { bpm: { oneOf: [{ type: "number" }, { type: "string" }] } },
      })
    ).toEqual({ bpm: 122 });
  });
});
