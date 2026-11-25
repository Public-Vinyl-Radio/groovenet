import { describe, expect, it, vi } from "vitest";
import { exactOrderSuffix } from "../vectorSearch";

describe("exactOrderSuffix", () => {
  it.each(["0", "1", "9999"])("forces exact order for %s vectors", async (count) => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ count }] }) };
    expect(await exactOrderSuffix(client, "identity", "bge-small-en-v1.5")).toBe(" + 0");
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("LIMIT 10000"), [
      "identity",
      "bge-small-en-v1.5",
    ]);
  });
  it("permits ANN at the threshold", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ count: "10000" }] }) };
    expect(await exactOrderSuffix(client, "audio_vibe", "text-embedding-3-small")).toBe("");
  });
  it("treats a missing count as an empty set", async () => {
    expect(
      await exactOrderSuffix({ query: vi.fn().mockResolvedValue({ rows: [] }) }, "context", "m"),
    ).toBe(" + 0");
  });
});
