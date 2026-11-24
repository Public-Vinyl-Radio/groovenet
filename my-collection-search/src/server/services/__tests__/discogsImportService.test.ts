import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscogsImportRow } from "@/server/repositories/discogsImportRepository";

vi.mock("@/server/repositories/discogsImportRepository", () => ({ discogsImportRepository: {} }));
vi.mock("@/server/services/discogsImportWorker", () => ({ kickDiscogsImportWorker: vi.fn() }));

import {
  DiscogsCredentialsMissingError,
  DiscogsImportService,
  toDiscogsImport,
} from "../discogsImportService";

const row = (patch: Partial<DiscogsImportRow> = {}): DiscogsImportRow => ({
  id: 3,
  username: "dj",
  status: "queued",
  phase: "queued",
  found: 0,
  total: null,
  fetched: 0,
  added: 0,
  removed: 0,
  failed_releases: 0,
  last_error: null,
  attempts: 0,
  lease_owner: "host:1:abc",
  stalled: false,
  created_at: new Date("2026-11-24T10:00:00Z") as unknown as string,
  started_at: null,
  updated_at: new Date("2026-11-24T10:00:01Z") as unknown as string,
  finished_at: new Date("2026-11-24T10:05:00Z") as unknown as string,
  ...patch,
});

const repo = {
  create: vi.fn(),
  get: vi.fn(),
  listLatest: vi.fn(),
  readLog: vi.fn(),
};
const kick = vi.fn();
const service = new DiscogsImportService({ repo, kick });
const env = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.DISCOGS_USER_TOKEN = "token";
  process.env.DISCOGS_USERNAME = "owner";
});

afterEach(() => {
  process.env = { ...env };
});

describe("toDiscogsImport", () => {
  it("drops the lease holder and writes timestamps as ISO strings", () => {
    const out = toDiscogsImport(row());
    expect(out).not.toHaveProperty("lease_owner");
    expect(out.created_at).toBe("2026-11-24T10:00:00.000Z");
    expect(out.started_at).toBeNull();
    expect(out.finished_at).toBe("2026-11-24T10:05:00.000Z");
  });
});

describe("DiscogsImportService", () => {
  it("queues an import for the given username, else the server's account, and wakes the worker", async () => {
    repo.create.mockResolvedValue({ row: row(), created: true });

    expect(await service.start("  collector ")).toMatchObject({
      created: true,
      import: { id: 3 },
    });
    expect(repo.create).toHaveBeenCalledWith("collector");
    await service.start(undefined);
    expect(repo.create).toHaveBeenLastCalledWith("owner");
    expect(kick).toHaveBeenCalledTimes(2);
  });

  it("passes on the import already running instead of starting another", async () => {
    repo.create.mockResolvedValue({ row: row({ status: "running" }), created: false });
    expect(await service.start("dj")).toMatchObject({
      created: false,
      import: { status: "running" },
    });
  });

  it.each([
    ["no token", { DISCOGS_USER_TOKEN: " " }, "dj"],
    ["no username at all", { DISCOGS_USERNAME: "" }, null],
  ])("refuses with %s, as the route's 500 always has", async (_name, patch, username) => {
    Object.assign(process.env, patch);
    await expect(service.start(username)).rejects.toBeInstanceOf(DiscogsCredentialsMissingError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("reads one import, or null", async () => {
    repo.get.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    expect((await service.get(3))?.id).toBe(3);
    expect(await service.get(4)).toBeNull();
  });

  it("lists the latest imports, optionally only active ones", async () => {
    repo.listLatest.mockResolvedValue([row()]);
    expect(await service.list(true)).toHaveLength(1);
    expect(repo.listLatest).toHaveBeenCalledWith({ activeOnly: true });
  });

  it("pages the log from the last line read", async () => {
    repo.readLog
      .mockResolvedValueOnce([
        { id: 4, line: "a" },
        { id: 9, line: "b" },
      ])
      .mockResolvedValueOnce([]);
    expect(await service.readLog(3, 0, 500)).toEqual({
      lines: [
        { id: 4, line: "a" },
        { id: 9, line: "b" },
      ],
      next_after: 9,
    });
    expect(await service.readLog(3, 9, 500)).toEqual({ lines: [], next_after: 9 });
  });
});
