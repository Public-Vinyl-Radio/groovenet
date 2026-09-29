import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

describe("/ingest proxy", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain", "content-encoding": "gzip" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns 404 and sends nothing when analytics is off", async () => {
    vi.stubEnv("ANALYTICS_PROVIDER", "none");
    const res = await POST(new Request("http://app/ingest/e/", { method: "POST" }), ctx("e"));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("when enabled", () => {
    beforeEach(() => {
      vi.stubEnv("ANALYTICS_PROVIDER", "posthog");
      vi.stubEnv("POSTHOG_KEY", "phc_x");
      vi.stubEnv("POSTHOG_HOST", "https://eu.i.posthog.com");
    });

    it("forwards API calls to the configured host, keeping query and trailing slash", async () => {
      const req = new Request("http://app/ingest/e/?compression=gzip-js", {
        method: "POST",
        headers: { cookie: "session=secret", "content-type": "text/plain" },
        body: "payload",
      });
      const res = await POST(req, ctx("e"));

      expect(res.status).toBe(200);
      expect(res.headers.get("content-encoding")).toBeNull();
      const [target, init] = fetchMock.mock.calls[0];
      expect(String(target)).toBe("https://eu.i.posthog.com/e/?compression=gzip-js");
      expect(init.method).toBe("POST");
      expect(new TextDecoder().decode(init.body)).toBe("payload");
      expect(init.headers.get("cookie")).toBeNull();
      expect(init.headers.get("content-type")).toBe("text/plain");
    });

    it("serves static assets from the region's assets host", async () => {
      await GET(
        new Request("http://app/ingest/static/array.js"),
        ctx("static", "array.js")
      );
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        "https://eu-assets.i.posthog.com/static/array.js"
      );
    });

    it("answers 502 when PostHog is unreachable", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const res = await GET(new Request("http://app/ingest/decide"), ctx("decide"));
      expect(res.status).toBe(502);
    });
  });
});
