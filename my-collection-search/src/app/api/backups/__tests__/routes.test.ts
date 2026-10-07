import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as LIST } from "../route";
import { DELETE, GET } from "../[filename]/route";

let tmpDir: string;
let dumpsDir: string;

function context(filename: string) {
  return { params: Promise.resolve({ filename }) };
}

const request = new Request("http://localhost/api/backups/x");

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backups-route-test-"));
  dumpsDir = path.join(tmpDir, "dumps");
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("GET /api/backups", () => {
  it("lists backups with filenames kept for older clients", async () => {
    fs.mkdirSync(dumpsDir);
    fs.writeFileSync(path.join(dumpsDir, "a.dump"), "abc");
    const res = await LIST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toEqual(["a.dump"]);
    expect(body.backups).toEqual([
      expect.objectContaining({ filename: "a.dump", size_bytes: 3 }),
    ]);
  });

  it("returns 500 when the directory cannot be read", async () => {
    fs.writeFileSync(dumpsDir, "not a directory");
    const res = await LIST();
    expect(res.status).toBe(500);
  });
});

describe("GET /api/backups/{filename}", () => {
  it("streams the file as an attachment", async () => {
    fs.mkdirSync(dumpsDir);
    fs.writeFileSync(path.join(dumpsDir, "a.dump"), "dump-bytes");
    const res = await GET(request, context("a.dump"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("10");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="a.dump"');
    await expect(res.text()).resolves.toBe("dump-bytes");
  });

  it("rejects a path traversal attempt", async () => {
    const res = await GET(request, context("../secrets.sql"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for a missing file", async () => {
    const res = await GET(request, context("missing.dump"));
    expect(res.status).toBe(404);
  });

  it("returns 500 when the params cannot be read", async () => {
    const res = await GET(request, { params: Promise.reject(new Error("bad params")) });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/backups/{filename}", () => {
  it("deletes a backup", async () => {
    fs.mkdirSync(dumpsDir);
    fs.writeFileSync(path.join(dumpsDir, "a.sql"), "");
    const res = await DELETE(request, context("a.sql"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: "a.sql" });
    expect(fs.existsSync(path.join(dumpsDir, "a.sql"))).toBe(false);
  });

  it("rejects an invalid filename", async () => {
    const res = await DELETE(request, context("../../etc/passwd"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for a missing backup", async () => {
    const res = await DELETE(request, context("missing.dump"));
    expect(res.status).toBe(404);
  });

  it("returns 500 when the delete fails", async () => {
    fs.mkdirSync(path.join(dumpsDir, "dir.dump"), { recursive: true });
    const res = await DELETE(request, context("dir.dump"));
    expect(res.status).toBe(500);
  });
});
