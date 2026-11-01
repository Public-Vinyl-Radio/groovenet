import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/http", () => ({ http: httpMock }));

import {
  createRecordAction,
  createRecordCopy,
  deleteRecordCopy,
  discardRecordCareStack,
  getRecordCareProgress,
  getRecordCareQueue,
  getRecordCareSummary,
  listRecordActions,
  listRecordCare,
  listRecordCareLog,
  listRecordCareStacks,
  listRecordCopies,
  logRecordCareSession,
  pullRecordCareStack,
  updateDefaultRecordCopy,
  updateRecordCopy,
  voidRecordAction,
  voidRecordCareSession,
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
      GET_NO_STORE,
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
      jsonInit("PATCH", { friend_id: 7, notes: "VG+" }),
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
      GET_NO_STORE,
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
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-actions",
      jsonInit("POST", { source: "web", ...body }),
    );
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
    await listRecordCare({
      friend_id: 7,
      status: "overdue",
      overdue_days: 90,
      limit: 50,
      offset: 50,
    });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-copies/care?friend_id=7&status=overdue&overdue_days=90&limit=50&offset=50",
      GET_NO_STORE,
    );
  });

  it("gets the summary counts", async () => {
    await getRecordCareSummary({ friend_id: 7, needs_sleeve: "poly" });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-copies/care/summary?friend_id=7&needs_sleeve=poly",
      GET_NO_STORE,
    );
  });
});

describe("chores", () => {
  it("gets the queue with a backlog page", async () => {
    await getRecordCareQueue({ friend_id: 7, month: "2026-10", limit: 20, offset: 40 });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-care/queue?friend_id=7&month=2026-10&limit=20&offset=40",
      GET_NO_STORE,
    );
  });

  it("gets the queue with the server's defaults", async () => {
    await getRecordCareQueue({ friend_id: 7 });
    expect(httpMock).toHaveBeenCalledWith("/api/record-care/queue?friend_id=7", GET_NO_STORE);
  });

  it("gets cleaning progress", async () => {
    await getRecordCareProgress({ friend_id: 7, stack_size: 10 });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-care/progress?friend_id=7&stack_size=10",
      GET_NO_STORE,
    );
  });

  it("pulls a stack as the web app", async () => {
    await pullRecordCareStack({ friend_id: 7, size: 10 });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-care/stacks",
      jsonInit("POST", { source: "web", friend_id: 7, size: 10 }),
    );
  });

  it("lets the caller name the source", async () => {
    await pullRecordCareStack({ friend_id: 7, source: "api" });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-care/stacks",
      jsonInit("POST", { source: "api", friend_id: 7 }),
    );
  });

  it("lists open stacks", async () => {
    await listRecordCareStacks({ friend_id: 7, status: "open", limit: 1, offset: 0 });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-care/stacks?friend_id=7&status=open&limit=1&offset=0",
      GET_NO_STORE,
    );
  });

  it("discards a stack", async () => {
    await discardRecordCareStack(12, 7);
    expect(httpMock).toHaveBeenCalledWith("/api/record-care/stacks/12?friend_id=7", {
      method: "DELETE",
    });
  });
});

describe("care sessions", () => {
  it("logs a stack as the web app", async () => {
    await logRecordCareSession({ friend_id: 7, stack_id: 50, action_types: ["cleaned"] });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-care/sessions",
      jsonInit("POST", { source: "web", friend_id: 7, stack_id: 50, action_types: ["cleaned"] }),
    );
  });

  it("logs an ad-hoc selection by copy and release", async () => {
    await logRecordCareSession({
      friend_id: 7,
      copies: [{ copy_id: 3 }, { release_id: "rel-1" }],
      action_types: ["sleeved"],
      sleeve_type: "poly",
    });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-care/sessions",
      jsonInit("POST", {
        source: "web",
        friend_id: 7,
        copies: [{ copy_id: 3 }, { release_id: "rel-1" }],
        action_types: ["sleeved"],
        sleeve_type: "poly",
      }),
    );
  });

  it("voids a session", async () => {
    await voidRecordCareSession(12, 7);
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-care/sessions/12/void",
      jsonInit("POST", { friend_id: 7 }),
    );
  });

  it("lists the care log", async () => {
    await listRecordCareLog({ friend_id: 7, limit: 8, offset: 0 });
    expect(httpMock).toHaveBeenCalledWith(
      "/api/record-care/sessions?friend_id=7&limit=8&offset=0",
      GET_NO_STORE,
    );
  });

  it("leaves paging to the server's defaults", async () => {
    await listRecordCareLog({ friend_id: 7 });
    expect(httpMock).toHaveBeenCalledWith("/api/record-care/sessions?friend_id=7", GET_NO_STORE);
  });
});
