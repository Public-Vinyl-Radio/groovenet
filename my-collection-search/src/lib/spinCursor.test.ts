import { describe, expect, it } from "vitest";
import { decodeSpinCursor, encodeSpinCursor } from "./spinCursor";

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("spin cursor", () => {
  it("round-trips the sort key, keeping microseconds", () => {
    const key = { played_at: "2026-09-20T21:30:00.123456Z", id: 42 };
    const encoded = encodeSpinCursor(key);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSpinCursor(encoded)).toEqual(key);
  });

  it("rejects anything it did not produce", () => {
    expect(decodeSpinCursor("!!!")).toBeNull();
    expect(decodeSpinCursor(Buffer.from("not json").toString("base64url"))).toBeNull();
    expect(decodeSpinCursor(b64(null))).toBeNull();
    expect(decodeSpinCursor(b64("text"))).toBeNull();
    expect(decodeSpinCursor(b64({ played_at: 5, id: 1 }))).toBeNull();
    expect(decodeSpinCursor(b64({ played_at: "yesterday", id: 1 }))).toBeNull();
    expect(decodeSpinCursor(b64({ played_at: "2026-13-45T99:00:00Z", id: 1 }))).toBeNull();
    expect(decodeSpinCursor(b64({ played_at: "2026-09-20T21:30:00Z", id: "1" }))).toBeNull();
    expect(decodeSpinCursor(b64({ played_at: "2026-09-20T21:30:00Z", id: 1.5 }))).toBeNull();
    expect(decodeSpinCursor(b64({ played_at: "2026-09-20T21:30:00Z" }))).toBeNull();
  });
});
