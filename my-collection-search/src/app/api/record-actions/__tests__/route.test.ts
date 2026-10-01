import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ logAction: vi.fn(), voidAction: vi.fn() }));

vi.mock("@/server/services/recordCareService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/recordCareService")>()),
  recordCareService: service,
}));

import { POST } from "../route";
import { DELETE } from "../[id]/route";

const TS = "2026-10-01T12:00:00.000Z";

const copy = {
  id: 3,
  friend_id: 7,
  release_id: "rel",
  is_default: true,
  label: null,
  notes: null,
  inner_sleeve_type: "poly-rice-paper-poly",
  last_cleaned_at: null,
  deleted_at: null,
  created_at: TS,
  updated_at: TS,
};

const action = {
  id: 11,
  copy_id: 3,
  friend_id: 7,
  action_type: "sleeved",
  occurred_at: TS,
  notes: null,
  sleeve_type: "poly-rice-paper-poly",
  details: {},
  voided_at: null,
  created_at: TS,
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/record-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => vi.resetAllMocks());

describe("POST /api/record-actions", () => {
  it.each([
    ["neither copy_id nor release_id", { friend_id: 7, action_type: "cleaned" }],
    ["both copy_id and release_id", { friend_id: 7, copy_id: 3, release_id: "rel", action_type: "cleaned" }],
    ["a sleeved action without a sleeve", { friend_id: 7, copy_id: 3, action_type: "sleeved" }],
    ["a sleeve on a cleaning", { friend_id: 7, copy_id: 3, action_type: "cleaned", sleeve_type: "poly" }],
    ["a cleaning method on an inspection", { friend_id: 7, copy_id: 3, action_type: "inspected", details: { method: "vacuum" } }],
    ["an unknown detail", { friend_id: 7, copy_id: 3, action_type: "cleaned", details: { solution: "isopropyl" } }],
    ["an unknown sleeve", { friend_id: 7, copy_id: 3, action_type: "sleeved", sleeve_type: "rice-paper" }],
    ["played, which is not yet an action", { friend_id: 7, copy_id: 3, action_type: "played" }],
    ["a date that is not one", { friend_id: 7, copy_id: 3, action_type: "cleaned", occurred_at: "last week" }],
  ])("rejects %s", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(service.logAction).not.toHaveBeenCalled();
  });

  it("logs a sleeve change against a release", async () => {
    service.logAction.mockResolvedValue({ action, copy });

    const res = await post({
      friend_id: 7,
      release_id: "rel",
      action_type: "sleeved",
      sleeve_type: "poly-rice-paper-poly",
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ action, copy });
    expect(service.logAction).toHaveBeenCalledWith({
      friend_id: 7,
      release_id: "rel",
      action_type: "sleeved",
      sleeve_type: "poly-rice-paper-poly",
    });
  });

  it("logs a backdated cleaning against a copy", async () => {
    service.logAction.mockResolvedValue({
      action: { ...action, action_type: "cleaned", sleeve_type: null, details: { method: "wet-manual" } },
      copy,
    });

    const res = await post({
      friend_id: 7,
      copy_id: 3,
      action_type: "cleaned",
      occurred_at: "2026-03-14T10:00:00Z",
      notes: "Before the gig",
      details: { method: "wet-manual" },
    });

    expect(res.status).toBe(201);
    expect(service.logAction).toHaveBeenCalledWith({
      friend_id: 7,
      copy_id: 3,
      action_type: "cleaned",
      occurred_at: "2026-03-14T10:00:00Z",
      notes: "Before the gig",
      details: { method: "wet-manual" },
    });
  });

  it.each([
    ["Album not found", 404],
    ["Record copy not found", 404],
    ["connection reset", 500],
  ])("maps %s to %i", async (message, status) => {
    service.logAction.mockRejectedValue(new Error(message));
    const res = await post({ friend_id: 7, copy_id: 3, action_type: "repaired" });
    expect(res.status).toBe(status);
  });
});

describe("DELETE /api/record-actions/:id", () => {
  const del = (url: string) =>
    DELETE(new Request(url, { method: "DELETE" }) as never, {
      params: Promise.resolve({ id: "11" }),
    });

  it("voids the action and returns the recomputed copy", async () => {
    service.voidAction.mockResolvedValue({ action: { ...action, voided_at: TS }, copy });

    const res = await del("http://localhost/api/record-actions/11?friend_id=7");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, action: { voided_at: TS } });
    expect(service.voidAction).toHaveBeenCalledWith(11, 7);
  });

  it("requires friend_id, and 404s an action that is not the friend's", async () => {
    expect((await del("http://localhost/api/record-actions/11")).status).toBe(400);

    service.voidAction.mockResolvedValue(null);
    expect((await del("http://localhost/api/record-actions/11?friend_id=8")).status).toBe(404);
  });
});
