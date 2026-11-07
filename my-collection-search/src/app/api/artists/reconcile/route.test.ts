import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const svc = vi.hoisted(() => ({ reconcileArtists: vi.fn() }));
vi.mock("@/server/services/artistReconcileService", () => svc);

import { POST } from "./route";

const counts = { pending: 0, linked: 0, failed: 0 };
const report = {
  dry_run: true,
  friend_id: null,
  baseline: {
    albums: 0,
    distinct_strings: 0,
    spelling_groups: 0,
    inversions: 0,
    various: 0,
    unknown_artist: 0,
  },
  albums: counts,
  tracks: counts,
  credits: { discogs: 0, legacy: 0 },
  artists: { matched_by_discogs_id: 0, matched_by_name: 0, created: 0 },
  sort_names: { pending: 0, updated: 0 },
  review_queue: [],
  errors: [],
};
const post = (body?: string) =>
  POST(new NextRequest("http://x/api/artists/reconcile", { method: "POST", body }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/artists/reconcile", () => {
  it("treats an empty body as a full run", async () => {
    svc.reconcileArtists.mockResolvedValue({ ...report, dry_run: false });
    const res = await post();
    expect(res.status).toBe(200);
    expect(svc.reconcileArtists).toHaveBeenCalledWith({});
    expect((await res.json()).dry_run).toBe(false);
  });

  it("passes a dry run and friend scope through", async () => {
    svc.reconcileArtists.mockResolvedValue({ ...report, friend_id: 6 });
    const res = await post(JSON.stringify({ dry_run: true, friend_id: 6 }));
    expect(svc.reconcileArtists).toHaveBeenCalledWith({ dry_run: true, friend_id: 6 });
    expect(await res.json()).toEqual({ ...report, friend_id: 6 });
  });

  it("rejects bad JSON and unknown fields", async () => {
    expect((await post("{")).status).toBe(400);
    expect((await post(JSON.stringify({ dryRun: true }))).status).toBe(400);
    expect(svc.reconcileArtists).not.toHaveBeenCalled();
  });

  it("is a 500 when the run fails", async () => {
    svc.reconcileArtists.mockRejectedValue(new Error("db"));
    const res = await post("{}");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Artist reconcile failed" });
  });
});
