import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  start: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  readLog: vi.fn(),
}));
vi.mock("@/server/services/discogsImportService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/discogsImportService")>()),
  discogsImportService: service,
}));
vi.mock("@/server/services/discogsImportWorker", () => ({ kickDiscogsImportWorker: vi.fn() }));
vi.mock("@/server/repositories/discogsImportRepository", () => ({ discogsImportRepository: {} }));

import { DiscogsCredentialsMissingError } from "@/server/services/discogsImportService";
import { GET as list, POST as create } from "../route";
import { GET as getOne } from "../[id]/route";
import { GET as getLog } from "../[id]/log/route";

const job = { id: 4, username: "dj", status: "running" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body?: string) =>
  create(
    new Request("http://localhost/api/discogs/imports", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    }) as never,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/discogs/imports", () => {
  it("queues an import: 201 with it", async () => {
    service.start.mockResolvedValue({ import: job, created: true });
    const res = await post(JSON.stringify({ username: "dj" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ import: job, created: true });
    expect(service.start).toHaveBeenCalledWith("dj");
  });

  it("returns the import already running with 200, and takes an empty body as the account", async () => {
    service.start.mockResolvedValue({ import: job, created: false });
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(false);
    expect(service.start).toHaveBeenCalledWith(undefined);
  });

  it("rejects a body that isn't JSON or isn't valid", async () => {
    expect((await post("{nope")).status).toBe(400);
    const res = await post(JSON.stringify({ username: 5 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
    expect(service.start).not.toHaveBeenCalled();
  });

  it("is a 500 naming the missing credentials, as the sync always was", async () => {
    service.start.mockRejectedValue(new DiscogsCredentialsMissingError());
    const res = await post("{}");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Discogs credentials not set in environment" });
  });

  it("is a 500 for anything else", async () => {
    service.start.mockRejectedValue("db down");
    const res = await post("{}");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });
  });
});

describe("GET /api/discogs/imports", () => {
  it("lists the latest imports, or only active ones", async () => {
    service.list.mockResolvedValue([job]);
    const res = await list(new Request("http://localhost/api/discogs/imports"));
    expect(await res.json()).toEqual({ imports: [job] });
    expect(service.list).toHaveBeenLastCalledWith(false);
    await list(new Request("http://localhost/api/discogs/imports?active=1"));
    expect(service.list).toHaveBeenLastCalledWith(true);
    await list(new Request("http://localhost/api/discogs/imports?active=true"));
    expect(service.list).toHaveBeenLastCalledWith(true);
  });

  it("is a 500 when the list can't be read", async () => {
    service.list.mockRejectedValue(new Error("db down"));
    const res = await list(new Request("http://localhost/api/discogs/imports"));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/discogs/imports/:id", () => {
  it("returns the import, 404 for none and 400 for a bad id", async () => {
    service.get.mockResolvedValueOnce(job).mockResolvedValueOnce(null);
    const ok = await getOne(new Request("http://localhost"), params("4"));
    expect(await ok.json()).toEqual({ import: job });
    expect((await getOne(new Request("http://localhost"), params("5"))).status).toBe(404);
    expect((await getOne(new Request("http://localhost"), params("x"))).status).toBe(400);
    expect((await getOne(new Request("http://localhost"), params("0"))).status).toBe(400);
  });

  it("is a 500 when it can't be read", async () => {
    service.get.mockRejectedValueOnce(new Error("db down")).mockRejectedValueOnce("db down");
    expect((await getOne(new Request("http://localhost"), params("4"))).status).toBe(500);
    const res = await getOne(new Request("http://localhost"), params("4"));
    expect(await res.json()).toEqual({ error: "db down" });
  });
});

describe("GET /api/discogs/imports/:id/log", () => {
  it("pages the log after a line id, capping the page size", async () => {
    service.readLog.mockResolvedValue({ lines: [{ id: 3, line: "x" }], next_after: 3 });
    const res = await getLog(new Request("http://localhost/log?after=2&limit=5000"), params("4"));
    expect(await res.json()).toEqual({ lines: [{ id: 3, line: "x" }], next_after: 3 });
    expect(service.readLog).toHaveBeenCalledWith(4, 2, 1000);
    await getLog(new Request("http://localhost/log"), params("4"));
    expect(service.readLog).toHaveBeenLastCalledWith(4, 0, 500);
  });

  it.each(["?after=-1", "?after=x", "?limit=0"])("rejects %s", async (query) => {
    const res = await getLog(new Request(`http://localhost/log${query}`), params("4"));
    expect(res.status).toBe(400);
  });

  it("rejects a bad id, and is a 500 when the log can't be read", async () => {
    expect((await getLog(new Request("http://localhost/log"), params("x"))).status).toBe(400);
    service.readLog.mockRejectedValueOnce(new Error("db down")).mockRejectedValueOnce("db down");
    expect((await getLog(new Request("http://localhost/log"), params("4"))).status).toBe(500);
    const res = await getLog(new Request("http://localhost/log"), params("4"));
    expect(await res.json()).toEqual({ error: "db down" });
  });
});
