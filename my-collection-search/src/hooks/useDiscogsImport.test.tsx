// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const state = vi.hoisted(() => ({
  sync: { isPending: false, mutate: vi.fn() },
  discogs: { lines: [] as string[], done: false, error: null as string | null },
}));
vi.mock("@/hooks/useDiscogsQuery", () => ({ useSyncDiscogs: () => state.sync }));
vi.mock("@/providers/SyncStreamsProvider", () => ({
  useSyncStreams: () => ({ discogs: state.discogs }),
}));

import { useDiscogsImport } from "./useDiscogsImport";

beforeEach(() => {
  localStorage.clear();
  state.sync = { isPending: false, mutate: vi.fn() };
  state.discogs = { lines: [], done: false, error: null };
});

const run = () => renderHook(() => useDiscogsImport()).result.current;

describe("useDiscogsImport", () => {
  it("is idle before any import", () => {
    expect(run()).toMatchObject({ running: false, progress: null, failure: null, finished: false });
  });

  it("is running while its own mutation is pending", () => {
    state.sync.isPending = true;
    expect(run()).toMatchObject({ running: true, progress: "Starting sync" });
  });

  it("is still running when you return to a page mid-import: the stream outlives the page", () => {
    state.discogs = {
      lines: ["New IDs to fetch: 340", "Saved release ID: 1", "Saved release ID: 2"],
      done: false,
      error: null,
    };
    expect(run()).toMatchObject({ running: true, progress: "Fetching 2 of 340" });
  });

  it("reports a dropped connection as a failure to resume", () => {
    state.discogs = { lines: ["Found release ID: 1"], done: true, error: "network error" };
    expect(run()).toMatchObject({ running: false, failure: "network error", finished: false });
  });

  it("reports an in-stream error line as a failure", () => {
    state.discogs = { lines: ["Fetching…", "Error: Discogs 401"], done: true, error: null };
    expect(run()).toMatchObject({ running: false, failure: "Error: Discogs 401" });
  });

  it("reads a refused request as a failure: the stream helper hands over its JSON body as a line", () => {
    state.discogs = {
      lines: ['{"error":"Too many requests. Try again in 312 seconds."}'],
      done: true,
      error: null,
    };
    expect(run()).toMatchObject({
      running: false,
      failure: "Too many requests. Try again in 312 seconds.",
      finished: false,
    });
  });

  it("does not mistake other JSON, or a broken line, for a failure", () => {
    state.discogs = {
      lines: ['{"newReleases":[],"alreadyHave":[]}', '{"error":""}', "{not json", "{}", "null"],
      done: true,
      error: null,
    };
    expect(run()).toMatchObject({ failure: null, finished: true });
  });

  it("reports an error before the first line (a 500) as a failure", () => {
    state.discogs = {
      lines: [],
      done: true,
      error: "Discogs credentials not set in environment",
    };
    expect(run().failure).toBe("Discogs credentials not set in environment");
  });

  it("is finished, not failed, when a run completes", () => {
    state.discogs = { lines: ["🎉 All operations complete!"], done: true, error: null };
    expect(run()).toMatchObject({ running: false, failure: null, finished: true });
  });

  it("starts the sync without the dialog and flags the checklist for this device", () => {
    run().start("alice");
    expect(state.sync.mutate).toHaveBeenCalledWith({ username: "alice", showDialog: false });
    expect(localStorage.getItem("gn:first-import")).toBe("pending");
  });
});
