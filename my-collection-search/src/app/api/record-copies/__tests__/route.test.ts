import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  listCopies: vi.fn(),
  createCopy: vi.fn(),
  updateCopy: vi.fn(),
  deleteCopy: vi.fn(),
  listActions: vi.fn(),
  listCare: vi.fn(),
  careSummary: vi.fn(),
}));

vi.mock("@/server/services/recordCareService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/recordCareService")>()),
  recordCareService: service,
}));

import { GET, POST } from "../route";
import { DELETE, PATCH } from "../[id]/route";
import { GET as GET_ACTIONS } from "../[id]/actions/route";
import { GET as GET_CARE } from "../care/route";
import { GET as GET_SUMMARY } from "../care/summary/route";

const TS = "2026-10-01T12:00:00.000Z";

const copy = {
  id: 3,
  friend_id: 7,
  release_id: "rel",
  is_default: true,
  label: null,
  notes: null,
  inner_sleeve_type: "poly-rice-paper-poly",
  last_cleaned_at: TS,
  deleted_at: null,
  created_at: TS,
  updated_at: TS,
};

const action = {
  id: 11,
  copy_id: 3,
  friend_id: 7,
  action_type: "cleaned",
  occurred_at: TS,
  notes: null,
  sleeve_type: null,
  details: { method: "vacuum" },
  voided_at: null,
  created_at: TS,
};

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => vi.resetAllMocks());

describe("GET /api/record-copies", () => {
  it("requires friend_id", async () => {
    const res = await GET(new Request("http://localhost/api/record-copies") as never);
    expect(res.status).toBe(400);
  });

  it("lists a release's copies", async () => {
    service.listCopies.mockResolvedValue([copy]);

    const res = await GET(
      new Request("http://localhost/api/record-copies?friend_id=7&release_id=rel") as never
    );

    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([copy]);
    expect(service.listCopies).toHaveBeenCalledWith(7, "rel");
  });
});

describe("POST /api/record-copies", () => {
  it("creates a copy", async () => {
    service.createCopy.mockResolvedValue({ ...copy, label: "Copy 2" });

    const res = await POST(
      jsonRequest("http://localhost/api/record-copies", "POST", {
        friend_id: 7,
        release_id: "rel",
        label: "Copy 2",
      })
    );

    expect(res.status).toBe(201);
    expect((await res.json()).copy.label).toBe("Copy 2");
  });

  it("returns 404 for a release not in the collection", async () => {
    service.createCopy.mockRejectedValue(new Error("Album not found"));

    const res = await POST(
      jsonRequest("http://localhost/api/record-copies", "POST", { friend_id: 7, release_id: "x" })
    );

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/record-copies/:id", () => {
  it("rejects a body with nothing to change", async () => {
    const res = await PATCH(
      jsonRequest("http://localhost/api/record-copies/3", "PATCH", { friend_id: 7 }),
      idParams("3")
    );
    expect(res.status).toBe(400);
    expect(service.updateCopy).not.toHaveBeenCalled();
  });

  it("does not accept a sleeve; that is an action", async () => {
    service.updateCopy.mockResolvedValue(copy);

    await PATCH(
      jsonRequest("http://localhost/api/record-copies/3", "PATCH", {
        friend_id: 7,
        notes: "Warped",
        inner_sleeve_type: "poly",
      }),
      idParams("3")
    );

    expect(service.updateCopy).toHaveBeenCalledWith(3, 7, { notes: "Warped" });
  });

  it("returns 404 for a copy that is not the friend's", async () => {
    service.updateCopy.mockResolvedValue(null);
    const res = await PATCH(
      jsonRequest("http://localhost/api/record-copies/3", "PATCH", { friend_id: 7, label: "x" }),
      idParams("3")
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/record-copies/:id", () => {
  it("soft-deletes the copy", async () => {
    service.deleteCopy.mockResolvedValue({ ...copy, deleted_at: TS });

    const res = await DELETE(
      new Request("http://localhost/api/record-copies/3?friend_id=7", { method: "DELETE" }) as never,
      idParams("3")
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, copy: { deleted_at: TS } });
  });

  it("returns 409 for a default copy that still has siblings", async () => {
    service.deleteCopy.mockRejectedValue(
      new Error("The default copy cannot be deleted while the release has other copies")
    );

    const res = await DELETE(
      new Request("http://localhost/api/record-copies/3?friend_id=7", { method: "DELETE" }) as never,
      idParams("3")
    );

    expect(res.status).toBe(409);
  });
});

describe("GET /api/record-copies/:id/actions", () => {
  it("lists history with paging and include_voided", async () => {
    service.listActions.mockResolvedValue([action]);

    const res = await GET_ACTIONS(
      new Request(
        "http://localhost/api/record-copies/3/actions?friend_id=7&include_voided=true&limit=5"
      ) as never,
      idParams("3")
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [action], limit: 5, offset: 0 });
    expect(service.listActions).toHaveBeenCalledWith({
      copy_id: 3,
      friend_id: 7,
      action_type: undefined,
      include_voided: true,
      limit: 5,
      offset: 0,
    });
  });

  it("returns 404 for a copy that is not the friend's", async () => {
    service.listActions.mockResolvedValue(null);
    const res = await GET_ACTIONS(
      new Request("http://localhost/api/record-copies/3/actions?friend_id=8") as never,
      idParams("3")
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/record-copies/care", () => {
  it("rejects an unknown status or sleeve", async () => {
    const bad = await GET_CARE(
      new Request("http://localhost/api/record-copies/care?friend_id=7&status=dusty") as never
    );
    const badSleeve = await GET_CARE(
      new Request("http://localhost/api/record-copies/care?friend_id=7&needs_sleeve=rice-paper") as never
    );
    const zeroDays = await GET_CARE(
      new Request("http://localhost/api/record-copies/care?friend_id=7&overdue_days=0") as never
    );
    expect([bad.status, badSleeve.status, zeroDays.status]).toEqual([400, 400, 400]);
  });

  it("returns implicit default copies with a null copy_id", async () => {
    service.listCare.mockResolvedValue({
      items: [
        {
          friend_id: 7,
          release_id: "rel",
          album_title: "Selected Ambient Works",
          album_artist: "Aphex Twin",
          album_thumbnail: null,
          copy_id: null,
          is_default: true,
          label: null,
          inner_sleeve_type: null,
          last_cleaned_at: null,
        },
      ],
      total: 1,
      overdue_days: 365,
      needs_sleeve_type: "poly-rice-paper-poly",
    });

    const res = await GET_CARE(
      new Request(
        "http://localhost/api/record-copies/care?friend_id=7&status=never_cleaned&sleeve_type=unknown"
      ) as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].copy_id).toBeNull();
    expect(body).toMatchObject({ total: 1, limit: 50, offset: 0 });
    expect(service.listCare).toHaveBeenCalledWith(
      expect.objectContaining({ friend_id: 7, status: "never_cleaned", sleeve_type: "unknown" })
    );
  });
});

describe("GET /api/record-copies/care/summary", () => {
  it("passes the overrides through", async () => {
    service.careSummary.mockResolvedValue({
      total: 2,
      never_cleaned: 1,
      overdue: 1,
      needs_sleeve: 2,
      by_sleeve_type: { original: 0, paper: 0, "poly-rice-paper-poly": 0, poly: 0, unknown: 2 },
      overdue_days: 90,
      needs_sleeve_type: "poly",
    });

    const res = await GET_SUMMARY(
      new Request(
        "http://localhost/api/record-copies/care/summary?friend_id=7&overdue_days=90&needs_sleeve=poly"
      ) as never
    );

    expect(res.status).toBe(200);
    expect(service.careSummary).toHaveBeenCalledWith(7, {
      overdue_days: 90,
      needs_sleeve: "poly",
    });
  });
});
