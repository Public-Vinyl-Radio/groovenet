// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { DiscogsImport } from "@/services/internalApi/discogsImports";

const state = vi.hoisted(() => ({
  imports: [] as unknown[],
  start: { isPending: false, error: null as Error | null, mutate: vi.fn() },
  idlePollMs: undefined as unknown,
}));
vi.mock("@/hooks/useDiscogsImports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useDiscogsImports")>();
  return {
    ...actual,
    useDiscogsImportsQuery: (options: { idlePollMs?: number }) => {
      state.idlePollMs = options.idlePollMs;
      return { data: { imports: state.imports } };
    },
    useStartDiscogsImport: () => state.start,
  };
});

import { useDiscogsImport } from "./useDiscogsImport";

const job = (patch: Partial<DiscogsImport> = {}): DiscogsImport => ({
  id: 1,
  username: "Alice",
  status: "running",
  phase: "fetching",
  found: 340,
  total: 340,
  fetched: 2,
  added: 0,
  removed: 0,
  failed_releases: 0,
  last_error: null,
  attempts: 1,
  stalled: false,
  created_at: "2026-11-24T10:00:00.000Z",
  started_at: "2026-11-24T10:00:00.000Z",
  updated_at: "2026-11-24T10:00:00.000Z",
  finished_at: null,
  ...patch,
});

beforeEach(() => {
  localStorage.clear();
  state.imports = [];
  state.start = { isPending: false, error: null, mutate: vi.fn() };
});

const run = (username: string | null = "alice") =>
  renderHook(() => useDiscogsImport(username)).result.current;

describe("useDiscogsImport", () => {
  it("is idle before any import, and looks for one started elsewhere", () => {
    expect(run()).toMatchObject({ running: false, progress: null, failure: null, finished: false });
    expect(state.idlePollMs).toBe(15_000);
  });

  it("is running while its own request is pending", () => {
    state.start.isPending = true;
    expect(run()).toMatchObject({ running: true, progress: "Starting sync" });
  });

  it("shows an import the server is running, whoever started it: reload, other tab or device", () => {
    state.imports = [job()];
    expect(run()).toMatchObject({ running: true, progress: "Fetching 2 of 340" });
  });

  it("only reads the import of its own library", () => {
    state.imports = [job({ username: "bob" })];
    expect(run()).toMatchObject({ running: false, progress: null });
    expect(run(null)).toMatchObject({ running: false });
  });

  it("reports a failed import with its last error, to resume", () => {
    state.imports = [job({ status: "failed", last_error: "Discogs 401" })];
    expect(run()).toMatchObject({ running: false, failure: "Discogs 401", finished: false });
  });

  it("reports an interrupted import, with a reason even when it has none", () => {
    state.imports = [job({ status: "interrupted", last_error: null })];
    expect(run().failure).toBe("The import stopped");
  });

  it("reads a refused request as a failure (429 from the rate limit, 500 for credentials)", () => {
    state.start.error = new Error("Too many requests. Try again in 312 seconds.");
    expect(run()).toMatchObject({
      running: false,
      failure: "Too many requests. Try again in 312 seconds.",
      finished: false,
    });
  });

  it("is finished, not failed, when its import completed", () => {
    state.imports = [job({ status: "completed", phase: "done" })];
    expect(run()).toMatchObject({ running: false, failure: null, finished: true });
  });

  it("queues the import and flags the checklist for this device", () => {
    run().start("alice");
    expect(state.start.mutate).toHaveBeenCalledWith("alice");
    expect(localStorage.getItem("gn:first-import")).toBe("pending");
  });
});
