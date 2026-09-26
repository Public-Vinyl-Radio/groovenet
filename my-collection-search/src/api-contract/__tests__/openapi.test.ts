import { describe, it, expect } from "vitest";
import { getOpenApiDocument } from "../openapi";

type Operation = { tags?: string[]; summary?: string };

function getOperation(path: string, method: string): Operation | undefined {
  const doc = getOpenApiDocument();
  const pathItem = doc.paths[path] as Record<string, Operation> | undefined;
  return pathItem?.[method];
}

// Endpoints that were previously only surfaced via the AutoDiscovered stub and
// now have real contract entries. Auto-discovery silently masks missing
// contracts, so this guards against them regressing to generic stubs.
const CONTRACTED: Array<[method: string, path: string]> = [
  ["get", "/api/tracks/deleted"],
  ["get", "/api/backups"],
  ["get", "/api/backups/{filename}"],
  ["post", "/api/restore"],
  ["post", "/api/settings/backup/run"],
  ["get", "/api/health/backup"],
  ["get", "/api/playlists/{id}/set"],
  ["post", "/api/playlists/{id}/set"],
  ["put", "/api/playlists/{id}/set"],
  ["delete", "/api/playlists/{id}/set"],
  // Set derivation (#282).
  ["get", "/api/set-recordings/{sha256}"],
  ["put", "/api/set-recordings/{sha256}"],
  ["post", "/api/set-derivations"],
  ["get", "/api/set-derivations/{id}"],
  ["post", "/api/set-derivations/{id}/claim"],
  ["post", "/api/set-derivations/{id}/result"],
];

describe("OpenAPI contract coverage", () => {
  it.each(CONTRACTED)("documents %s %s with a real contract entry", (method, path) => {
    const op = getOperation(path, method);
    expect(op, `${method} ${path} should be present`).toBeTruthy();
    expect(op?.tags ?? [], `${method} ${path} should not be auto-discovered`).not.toContain(
      "AutoDiscovered"
    );
    expect(op?.summary ?? "").not.toMatch(/^Auto-discovered/);
  });

  it("builds a valid 3.1.0 document with response content for each new path", () => {
    const doc = getOpenApiDocument();
    expect(doc.openapi).toBe("3.1.0");
    for (const [method, path] of CONTRACTED) {
      const op = (doc.paths[path] as Record<string, { responses?: Record<string, unknown> }>)[
        method
      ];
      expect(op.responses, `${method} ${path} responses`).toBeTruthy();
      expect(Object.keys(op.responses ?? {})).toContain("200");
    }
  });
});
