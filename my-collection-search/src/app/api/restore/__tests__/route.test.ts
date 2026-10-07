import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRestore } = vi.hoisted(() => ({ mockRestore: vi.fn() }));

vi.mock("@/server/services/restoreService", () => ({
  restoreDatabaseFromStream: mockRestore,
}));

import { POST } from "../route";

const result = {
  message: "Database schema and data restored successfully.",
  backupType: "schema+data",
  fileType: "dump",
  reindex: { albumsIndexed: 1, tracksIndexed: 2, warning: null },
};

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text();
}

beforeEach(() => {
  mockRestore.mockReset().mockResolvedValue(result);
});

describe("POST /api/restore", () => {
  it("streams a raw body named by ?filename=", async () => {
    let received = "";
    mockRestore.mockImplementation(async (body: ReadableStream<Uint8Array>) => {
      received = await readAll(body);
      return result;
    });
    const res = await POST(
      new Request("http://localhost/api/restore?filename=backup.dump", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: "PGDMP",
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(result);
    expect(mockRestore.mock.calls[0][1]).toBe("backup.dump");
    expect(received).toBe("PGDMP");
  });

  it("rejects a raw body without a filename", async () => {
    // A byte body carries no Content-Type at all.
    const res = await POST(
      new Request("http://localhost/api/restore", {
        method: "POST",
        body: new TextEncoder().encode("PGDMP"),
      })
    );
    expect(res.status).toBe(400);
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it("still accepts a multipart upload", async () => {
    let received = "";
    mockRestore.mockImplementation(async (body: ReadableStream<Uint8Array>) => {
      received = await readAll(body);
      return result;
    });
    const form = new FormData();
    form.append("file", new File(["CREATE TABLE t ();"], "old.sql"));
    const res = await POST(new Request("http://localhost/api/restore", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    expect(mockRestore.mock.calls[0][1]).toBe("old.sql");
    expect(received).toBe("CREATE TABLE t ();");
  });

  it("rejects a multipart upload without a file", async () => {
    const form = new FormData();
    form.append("file", "not a file");
    const res = await POST(new Request("http://localhost/api/restore", { method: "POST", body: form }));
    expect(res.status).toBe(400);
  });

  it("returns 500 with the restore error", async () => {
    mockRestore.mockRejectedValue(new Error("pg_restore exited with code 1: bad archive"));
    const res = await POST(
      new Request("http://localhost/api/restore?filename=b.dump", { method: "POST", body: "x" })
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "pg_restore exited with code 1: bad archive",
    });
  });

  it("stringifies a non-Error failure", async () => {
    mockRestore.mockRejectedValue("boom");
    const res = await POST(
      new Request("http://localhost/api/restore?filename=b.dump", { method: "POST", body: "x" })
    );
    await expect(res.json()).resolves.toEqual({ error: "boom" });
  });
});
