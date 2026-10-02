import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/http", () => ({ http: httpMock }));

import {
  createRecordAction,
  createRecordCopy,
  deleteRecordCopy,
  getRecordCareSummary,
  listRecordActions,
  listRecordCare,
  listRecordCopies,
  updateDefaultRecordCopy,
  updateRecordCopy,
  voidRecordAction,
} from "./recordCare";

const GET_NO_STORE = { method: "GET", cache: "no-store" };

function jsonInit(method: string, body: unknown) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

beforeEach(() => {
  httpMock.mockReset();
  httpMock.mockResolvedValue({ ok: true });
});

describe("record copies", () => {
  it("lists a release's copies", async () => {
    await expect(listRecordCopies({ friend_id: 7, release_id: "r 1" })).resolves.toEqual({
      ok: true,
    });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-copies?friend_id=7&release_id=r+1",
      GET_NO_STORE
    );
  });

  it("lists every copy when no release is named", async () => {
    await listRecordCopies({ friend_id: 7 });
    expect(httpMock).toHaveBeenCalledWith("/api/record-copies?friend_id=7", GET_NO_STORE);
  });

  it("adds a copy", async () => {
    const body = { friend_id: 7, release_id: "rel", label: "Copy 2" };
    await createRecordCopy(body);
    expect(httpMock).toHaveBeenCalledWith("/api/record-copies", jsonInit("POST", body));
  });

  it("edits a copy by id", async () => {
    await updateRecordCopy(4, { friend_id: 7, notes: "VG+" });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-copies/4",
      jsonInit("PATCH", { friend_id: 7, notes: "VG+" })
    );
  });

  it("edits the default copy by release", async () => {
    const body = { friend_id: 7, release_id: "rel", label: "DJ copy" };
    await updateDefaultRecordCopy(body);
    expect(httpMock).toHaveBeenCalledWith("/api/record-copies/default", jsonInit("PATCH", body));
  });

  it("removes a copy", async () => {
    await deleteRecordCopy(4, 7);
    expect(httpMock).toHaveBeenCalledWith("/api/record-copies/4?friend_id=7", {
      method: "DELETE",
    });
  });
});

describe("record actions", () => {
  it("lists a copy's history with only the params given", async () => {
    await listRecordActions(4, { friend_id: 7, include_voided: true, limit: 20 });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-copies/4/actions?friend_id=7&include_voided=true&limit=20",
      GET_NO_STORE
    );
  });

  it("logs an action", async () => {
    const body = {
      friend_id: 7,
      release_id: "rel",
      action_type: "sleeved" as const,
      sleeve_type: "poly-rice-paper-poly" as const,
    };
    await createRecordAction(body);
    expect(httpMock).toHaveBeenCalledWith("/api/record-actions", jsonInit("POST", body));
  });

  it("voids an action", async () => {
    await voidRecordAction(11, 7);
    expect(httpMock).toHaveBeenCalledWith("/api/record-actions/11?friend_id=7", {
      method: "DELETE",
    });
  });
});

describe("care", () => {
  it("lists copies needing care", async () => {
    await listRecordCare({ friend_id: 7, status: "overdue", overdue_days: 90, limit: 50, offset: 50 });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-copies/care?friend_id=7&status=overdue&overdue_days=90&limit=50&offset=50",
      GET_NO_STORE
    );
  });

  it("gets the summary counts", async () => {
    await getRecordCareSummary({ friend_id: 7, needs_sleeve: "poly" });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-copies/care/summary?friend_id=7&needs_sleeve=poly",
      GET_NO_STORE
    );
  });
});
