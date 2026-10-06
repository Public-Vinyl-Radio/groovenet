import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const service = vi.hoisted(() => ({
  startRun: vi.fn(),
  getRun: vi.fn(),
  getCoverage: vi.fn(),
  updateProposal: vi.fn(),
  applyProposals: vi.fn(),
  decideProposals: vi.fn(),
  restoreProposals: vi.fn(),
  getProposalTracks: vi.fn(),
}));
const listProposals = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/genreReconciliationService", async (original) => ({
  ...(await original<typeof import("@/server/services/genreReconciliationService")>()),
  ...service,
}));
vi.mock("@/server/repositories/genreReconciliationRepository", () => ({
  genreReconciliationRepository: { listProposals },
}));

import { GenreReconciliationError } from "@/server/services/genreReconciliationService";
import { POST as startRun } from "../reconciliation/runs/route";
import { GET as getRun } from "../reconciliation/runs/[id]/route";
import { GET as getCoverage } from "../reconciliation/coverage/route";
import { GET as listProposalsRoute } from "../proposals/route";
import { PATCH as updateProposal } from "../proposals/[id]/route";
import { POST as applyProposals } from "../proposals/apply/route";
import { POST as decide } from "../proposals/decisions/route";
import { POST as restore } from "../proposals/restore/route";
import { GET as proposalTracks } from "../proposals/[id]/tracks/route";

const id = "6df3a956-f05c-4ef2-a218-0813d0ca7c47";
const now = new Date("2026-10-05T00:00:00.000Z");
const run = {
  id, status: "running", options: { ai: true, new_genre_min_tracks: 5, limit: null, refresh: false },
  model: "gpt-5-mini", distinct_values: 0, exact_matches: 0, kept: 0, ai_pending: 0, ai_proposed: 0,
  ai_failed: 0, ai_batches: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, error: null,
  started_at: now, updated_at: now, finished_at: null,
};
const proposal = {
  id, value_normalized: "cumbia", raw_examples: ["Cumbia"], track_count: 2, action: "map",
  target_genre_ids: [id], target_genres: [{ id, name: "Cumbia", parent_name: "Latin" }],
  proposed_genre_name: null, proposed_parent_id: null, proposed_parent_name: null, confidence: 1,
  method: "exact", status: "accepted", run_id: id, created_genre_id: null, applied_at: null,
  created_at: now, updated_at: now,
};
const coverage = {
  tracks: { with_local_tags: 1, with_genres: 1, descriptors_only: 0, no_genre: 0, unresolved: 0 },
  values: {
    distinct: 1, proposed: 1, exact: 1, exact_share: 1,
    by_status: { pending: 0, accepted: 1, rejected: 0, edited: 0 },
    by_action: { map: 1, new_genre: 0, descriptor: 0, drop: 0 },
  },
};
const summary = { proposals_applied: 1, tracks_linked: 2, descriptors_added: 0, aliases_added: 0, genres_created: 0, skipped: [] };

const req = (body?: string, url = "http://localhost/api/genres") =>
  new NextRequest(url, { method: "POST", ...(body === undefined ? {} : { body }) });
const ctx = (value = id) => ({ params: Promise.resolve({ id: value }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/genres/reconciliation/runs", () => {
  it("starts a run with no body and returns 202 with ISO timestamps", async () => {
    service.startRun.mockResolvedValue(run);
    const response = await startRun(req());
    expect(response.status).toBe(202);
    // `run` predates the friend scope: its options have no friend_id.
    expect(await response.json()).toMatchObject({ id, started_at: now.toISOString(), options: { friend_id: null } });
    expect(service.startRun).toHaveBeenCalledWith({});
  });

  it("passes options and validates them", async () => {
    service.startRun.mockResolvedValue(run);
    await startRun(req(JSON.stringify({ ai: false, limit: 10, friend_id: 6 })));
    expect(service.startRun).toHaveBeenCalledWith({ ai: false, limit: 10, friend_id: 6 });
    expect((await startRun(req(JSON.stringify({ limit: 0 })))).status).toBe(400);
    expect((await startRun(req(JSON.stringify({ bogus: true })))).status).toBe(400);
    expect((await startRun(req("{"))).status).toBe(400);
  });

  it("returns 409 with the running run, and 503 without a key", async () => {
    service.startRun.mockRejectedValueOnce(new GenreReconciliationError("busy", 409, run as never));
    const busy = await startRun(req());
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ error: "busy", run: { id } });

    service.startRun.mockRejectedValueOnce(new GenreReconciliationError("no key", 503));
    const noKey = await startRun(req());
    expect(noKey.status).toBe(503);
    expect(await noKey.json()).toEqual({ error: "no key" });
  });

  it("hides unexpected errors behind a 500", async () => {
    service.startRun.mockRejectedValue(new Error("db down"));
    const response = await startRun(req());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Genre reconciliation failed" });
  });
});

describe("GET /api/genres/reconciliation/runs/{id}", () => {
  it("returns the run, 404 or 400", async () => {
    service.getRun.mockResolvedValueOnce(run).mockRejectedValueOnce(new GenreReconciliationError("gone", 404));
    expect((await getRun(req(), ctx())).status).toBe(200);
    expect((await getRun(req(), ctx())).status).toBe(404);
    expect((await getRun(req(), ctx("bad"))).status).toBe(400);
  });
});

describe("GET /api/genres/reconciliation/coverage", () => {
  const coverageReq = (query = "") => new NextRequest(`http://localhost/api/genres/reconciliation/coverage${query}`);

  it("returns coverage for everyone or one friend, or a 500", async () => {
    service.getCoverage.mockResolvedValue(coverage);
    const ok = await getCoverage(coverageReq());
    expect(await ok.json()).toEqual(coverage);
    expect(service.getCoverage).toHaveBeenCalledWith(null);
    await getCoverage(coverageReq("?friend_id=6"));
    expect(service.getCoverage).toHaveBeenLastCalledWith(6);
    service.getCoverage.mockRejectedValueOnce(new Error("x"));
    expect((await getCoverage(coverageReq())).status).toBe(500);
  });

  it("rejects a bad friend_id", async () => {
    expect((await getCoverage(coverageReq("?friend_id=0"))).status).toBe(400);
    expect(service.getCoverage).not.toHaveBeenCalled();
  });
});

describe("GET /api/genres/proposals", () => {
  it("lists with filters and default paging", async () => {
    listProposals.mockResolvedValue({ proposals: [proposal], total: 1 });
    const response = await listProposalsRoute(new NextRequest("http://localhost/api/genres/proposals?status=pending&limit=5"));
    expect(response.status).toBe(200);
    expect(listProposals).toHaveBeenCalledWith({ status: "pending", limit: 5, offset: 0 });
    await listProposalsRoute(new NextRequest("http://localhost/api/genres/proposals"));
    expect(listProposals).toHaveBeenLastCalledWith({ limit: 50, offset: 0 });
  });

  it("rejects a bad filter and reports failures", async () => {
    expect((await listProposalsRoute(new NextRequest("http://localhost/api/genres/proposals?status=done"))).status).toBe(400);
    expect((await listProposalsRoute(new NextRequest("http://localhost/api/genres/proposals?limit=501"))).status).toBe(400);
    listProposals.mockRejectedValue(new Error("x"));
    expect((await listProposalsRoute(new NextRequest("http://localhost/api/genres/proposals"))).status).toBe(500);
  });
});

describe("PATCH /api/genres/proposals/{id}", () => {
  it("updates a proposal", async () => {
    service.updateProposal.mockResolvedValue(proposal);
    const response = await updateProposal(req(JSON.stringify({ status: "accepted" })), ctx());
    expect(response.status).toBe(200);
    expect(service.updateProposal).toHaveBeenCalledWith(id, { status: "accepted" });
  });

  it("validates the id and body, and maps service errors", async () => {
    expect((await updateProposal(req(JSON.stringify({ status: "accepted" })), ctx("bad"))).status).toBe(400);
    expect((await updateProposal(req("{}"), ctx())).status).toBe(400);
    expect((await updateProposal(req(JSON.stringify({ status: "done" })), ctx())).status).toBe(400);
    service.updateProposal.mockRejectedValue(new GenreReconciliationError("Unknown genres: X", 400));
    const response = await updateProposal(req(JSON.stringify({ target_genres: ["X"] })), ctx());
    expect(await response.json()).toEqual({ error: "Unknown genres: X" });
  });
});

describe("POST /api/genres/proposals/apply", () => {
  it("applies all approved proposals, or the ones named", async () => {
    service.applyProposals.mockResolvedValue(summary);
    expect(await (await applyProposals(req())).json()).toEqual(summary);
    expect(service.applyProposals).toHaveBeenCalledWith(undefined, null);
    await applyProposals(req(JSON.stringify({ ids: [id], friend_id: 6 })));
    expect(service.applyProposals).toHaveBeenLastCalledWith([id], 6);
  });

  it("rejects bad ids and reports failures", async () => {
    expect((await applyProposals(req(JSON.stringify({ ids: ["bad"] })))).status).toBe(400);
    service.applyProposals.mockRejectedValue(new Error("x"));
    expect((await applyProposals(req())).status).toBe(500);
  });
});

const snapshot = {
  id, status: "pending", action: "map", target_genre_ids: [id],
  proposed_genre_name: null, proposed_parent_id: null, method: "ai",
};

describe("POST /api/genres/proposals/decisions", () => {
  it("records a batch and returns before and after", async () => {
    service.decideProposals.mockResolvedValue({ proposals: [proposal], previous: [snapshot] });
    const response = await decide(req(JSON.stringify({ decisions: [{ id, status: "accepted" }] })));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ proposals: [{ id }], previous: [snapshot] });
    expect(service.decideProposals).toHaveBeenCalledWith([{ id, status: "accepted" }]);
  });

  it("rejects empty batches, empty decisions and unknown fields", async () => {
    for (const body of [{ decisions: [] }, { decisions: [{ id }] }, { decisions: [{ id, status: "accepted", bogus: 1 }] }, {}]) {
      expect((await decide(req(JSON.stringify(body)))).status).toBe(400);
    }
    expect(service.decideProposals).not.toHaveBeenCalled();
  });

  it("maps service errors", async () => {
    service.decideProposals.mockRejectedValue(new GenreReconciliationError("Proposal not found: x", 404));
    expect((await decide(req(JSON.stringify({ decisions: [{ id, status: "accepted" }] })))).status).toBe(404);
  });
});

describe("POST /api/genres/proposals/restore", () => {
  it("restores snapshots", async () => {
    service.restoreProposals.mockResolvedValue({ restored: 1 });
    const response = await restore(req(JSON.stringify({ snapshots: [snapshot] })));
    expect(await response.json()).toEqual({ restored: 1 });
    expect(service.restoreProposals).toHaveBeenCalledWith([snapshot]);
  });

  it("rejects partial snapshots and maps errors", async () => {
    expect((await restore(req(JSON.stringify({ snapshots: [{ id }] })))).status).toBe(400);
    service.restoreProposals.mockRejectedValue(new Error("x"));
    expect((await restore(req(JSON.stringify({ snapshots: [snapshot] })))).status).toBe(500);
  });
});

describe("GET /api/genres/proposals/{id}/tracks", () => {
  const tracksReq = (query = "") => new NextRequest(`http://localhost/api/genres/proposals/${id}/tracks${query}`);
  const track = { track_id: "1", friend_id: 6, title: "T", artist: "A", album: null, styles: ["Cumbia"] };

  it("returns example tracks, defaulting to three for everyone", async () => {
    service.getProposalTracks.mockResolvedValue([track]);
    expect(await (await proposalTracks(tracksReq(), ctx())).json()).toEqual({ tracks: [track] });
    expect(service.getProposalTracks).toHaveBeenCalledWith(id, null, 3);
    await proposalTracks(tracksReq("?friend_id=6&limit=5"), ctx());
    expect(service.getProposalTracks).toHaveBeenLastCalledWith(id, 6, 5);
  });

  it("validates the id and query, and maps errors", async () => {
    expect((await proposalTracks(tracksReq(), ctx("bad"))).status).toBe(400);
    expect((await proposalTracks(tracksReq("?limit=21"), ctx())).status).toBe(400);
    service.getProposalTracks.mockRejectedValue(new GenreReconciliationError("Proposal not found", 404));
    expect((await proposalTracks(tracksReq(), ctx())).status).toBe(404);
  });
});
