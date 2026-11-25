import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());
vi.mock("../http", () => ({ http: httpMock }));

import { getDiscogsImportLog, listDiscogsImports, startDiscogsImport } from "./discogsImports";

describe("discogsImports api", () => {
  beforeEach(() => httpMock.mockReset().mockResolvedValue({}));

  it("posts the username, or an empty body for the server's own account", async () => {
    await startDiscogsImport("dj");
    expect(httpMock).toHaveBeenLastCalledWith(
      "/api/discogs/imports",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ username: "dj" }) }),
    );
    await startDiscogsImport();
    expect(httpMock).toHaveBeenLastCalledWith(
      "/api/discogs/imports",
      expect.objectContaining({ body: "{}" }),
    );
  });

  it("lists imports uncached", async () => {
    await listDiscogsImports();
    expect(httpMock).toHaveBeenCalledWith("/api/discogs/imports", { cache: "no-store" });
  });

  it("reads a log from an offset, defaulting to the start", async () => {
    await getDiscogsImportLog(5, 12);
    expect(httpMock).toHaveBeenLastCalledWith("/api/discogs/imports/5/log?after=12", {
      cache: "no-store",
    });
    await getDiscogsImportLog(5);
    expect(httpMock.mock.calls[1][0]).toBe("/api/discogs/imports/5/log?after=0");
  });
});
