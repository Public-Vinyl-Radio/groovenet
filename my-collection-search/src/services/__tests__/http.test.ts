import { afterEach, describe, expect, it, vi } from "vitest";
import { http } from "../http";

describe("http()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("puts the status and response headers on a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "Too many requests" }), {
            status: 429,
            headers: { "Retry-After": "5" },
          }),
      ),
    );
    const error = await http("https://example.test").catch((e: unknown) => e);
    expect(error).toMatchObject({ message: "Too many requests", status: 429 });
    expect((error as { headers: Headers }).headers.get("retry-after")).toBe("5");
  });
});
