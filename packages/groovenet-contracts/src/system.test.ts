import { describe, expect, it } from "vitest";
import {
  SERVICE_STATUSES,
  healthResponseSchema,
  statusResponseSchema,
  systemJsonSchemas,
  updateCheckResponseSchema,
  versionResponseSchema,
} from "./system.js";

describe("system contracts", () => {
  it("accepts the health probe body", () => {
    expect(healthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
    expect(healthResponseSchema.safeParse({ status: "down" }).success).toBe(false);
  });

  it("accepts version info with nullable build metadata", () => {
    const info = { version: "1.2.3", gitSha: null, builtAt: null, nodeEnv: "production" };
    expect(versionResponseSchema.parse(info)).toEqual(info);
    expect(versionResponseSchema.safeParse({ ...info, version: 1 }).success).toBe(false);
  });

  it("publishes the service statuses and optional probe detail", () => {
    expect(SERVICE_STATUSES).toEqual(["up", "down", "unknown"]);
    const status = {
      services: [
        { service: "app", status: "up", latencyMs: 0 },
        {
          service: "embedding_queue",
          status: "unknown",
          latencyMs: null,
          detail: "boom",
          meta: { queueDepth: 3 },
        },
      ],
      checkedAt: "2026-11-06T00:00:00.000Z",
    };
    expect(statusResponseSchema.parse(status)).toEqual(status);
    expect(
      statusResponseSchema.safeParse({
        ...status,
        services: [{ service: "app", status: "sideways", latencyMs: 0 }],
      }).success,
    ).toBe(false);
  });

  it("accepts an update check that carries an error", () => {
    const check = {
      current: "dev",
      comparable: false,
      latest: null,
      updateAvailable: false,
      releaseUrl: null,
      releaseName: null,
      publishedAt: null,
      error: "No published releases yet",
    };
    expect(updateCheckResponseSchema.parse(check)).toEqual(check);
  });

  it("exports JSON Schema components", () => {
    expect(Object.keys(systemJsonSchemas).sort()).toEqual([
      "HealthResponse",
      "ServiceHealth",
      "StatusResponse",
      "UpdateCheckResponse",
      "VersionResponse",
    ]);
    expect(systemJsonSchemas.ServiceHealth).toMatchObject({
      properties: { status: { enum: ["up", "down", "unknown"] } },
    });
  });
});
