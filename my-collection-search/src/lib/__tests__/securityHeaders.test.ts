import { describe, expect, it } from "vitest";
import {
  ENFORCED_CSP,
  HSTS,
  contentSecurityPolicy,
  securityHeaderRules,
} from "../../../config/securityHeaders.mjs";

const directives = (csp: string) =>
  Object.fromEntries(
    csp.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values];
    }),
  );

describe("contentSecurityPolicy", () => {
  const prod = directives(contentSecurityPolicy());

  it("keeps code on this origin and forbids plugins, framing and rebased URLs", () => {
    expect(prod["default-src"]).toEqual(["'self'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["base-uri"]).toEqual(["'self'"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
    expect(prod["frame-ancestors"]).toEqual(["'self'"]);
    expect(prod["connect-src"]).toEqual(["'self'"]);
  });

  it("allows only Next's inline bootstrap for scripts, and eval only in dev", () => {
    expect(prod["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    const dev = directives(contentSecurityPolicy({ dev: true }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toEqual(["'self'", "ws:", "wss:"]);
  });

  it("lets cover art and audio come from https hosts, and Sentry replay use a worker", () => {
    expect(prod["img-src"]).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https:"]));
    expect(prod["media-src"]).toContain("https:");
    expect(prod["worker-src"]).toContain("blob:");
  });

  it("never allows a wildcard script source", () => {
    expect(contentSecurityPolicy()).not.toMatch(/script-src[^;]*(\*|http:)/);
  });
});

describe("securityHeaderRules", () => {
  const [always, docsRule, storybookRule, https] = securityHeaderRules();
  const value = (key: string) => always.headers.find((h) => h.key === key)?.value;

  it("applies to every path", () => {
    expect(always.source).toBe("/:path*");
    expect(always.has).toBeUndefined();
  });

  it("enforces framing, content-type and referrer protections", () => {
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(value("Content-Security-Policy")).toBe(ENFORCED_CSP);
    expect(ENFORCED_CSP).toContain("frame-ancestors 'self'");
  });

  it("starts the full policy as report-only, so it cannot break a page", () => {
    expect(value("Content-Security-Policy-Report-Only")).toBe(contentSecurityPolicy());
    expect(value("Content-Security-Policy")).not.toContain("script-src");
  });

  it("turns off device features the app never uses", () => {
    expect(value("Permissions-Policy")).toContain("camera=()");
    expect(value("Permissions-Policy")).toContain("microphone=()");
  });

  it("lets only the Swagger UI page load from unpkg", () => {
    expect(docsRule.source).toBe("/api/docs");
    const docs = directives(docsRule.headers[0].value);
    expect(docs["script-src"]).toContain("https://unpkg.com");
    expect(docs["style-src"]).toContain("https://unpkg.com");
    const everywhere = directives(contentSecurityPolicy());
    expect(everywhere["script-src"]).not.toContain("https://unpkg.com");
    expect(everywhere["style-src"]).not.toContain("https://unpkg.com");
  });

  it("lets only the Storybook bundle use eval and reach Chakra's Storybook", () => {
    expect(storybookRule.source).toBe("/storybook/:path*");
    const storybook = directives(storybookRule.headers[0].value);
    expect(storybook["script-src"]).toContain("'unsafe-eval'");
    expect(storybook["connect-src"]).toContain("https://storybook.chakra-ui.com");
    const everywhere = directives(contentSecurityPolicy());
    expect(everywhere["script-src"]).not.toContain("'unsafe-eval'");
    expect(everywhere["connect-src"]).toEqual(["'self'"]);
  });

  it("sends HSTS only when the request came in over https", () => {
    expect(always.headers.some((h) => h.key === "Strict-Transport-Security")).toBe(false);
    expect(https.has).toEqual([{ type: "header", key: "x-forwarded-proto", value: "https" }]);
    expect(https.headers).toEqual([{ key: "Strict-Transport-Security", value: HSTS }]);
    expect(HSTS).not.toMatch(/includeSubDomains|preload/);
  });

  it("passes the dev flag through to the report-only policy", () => {
    const [devRule] = securityHeaderRules({ dev: true });
    const csp = devRule.headers.find((h) => h.key === "Content-Security-Policy-Report-Only")?.value;
    expect(csp).toContain("'unsafe-eval'");
  });
});
