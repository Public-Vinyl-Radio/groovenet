import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  pullStack: vi.fn(),
  listStacks: vi.fn(),
  getStack: vi.fn(),
  discardStack: vi.fn(),
  logSession: vi.fn(),
  listLog: vi.fn(),
  voidSession: vi.fn(),
}));

vi.mock("@/server/services/recordCareSessionService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/recordCareSessionService")>()),
  recordCareSessionService: service,
}));

import { GET as listStacks, POST as pullStack } from "../stacks/route";
import { DELETE as discardStack, GET as getStack } from "../stacks/[id]/route";
import { GET as listLog, POST as logSession } from "../sessions/route";
import { POST as voidSession } from "../sessions/[id]/void/route";
import { getRecordCareSessionErrorStatus } from "../recordCareSessionErrorStatus";
import {
  ANOTHER_STACK_OPEN,
  NOTHING_TO_PULL,
  RECORD_CARE_SESSION_NOT_FOUND,
  SESSION_NOT_LOGGED,
  STACK_NOT_OPEN,
} from "@/server/services/recordCareSessionService";
import { ALBUM_NOT_FOUND } from "@/server/services/recordCareService";
import { setAnalyticsProvider } from "@/lib/analytics/server";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";

const analyticsEvents = new MemoryAnalyticsProvider();
setAnalyticsProvider(analyticsEvents);

const TS = "2026-10-01T12:00:00.000Z";

const stack = {
  id: 5,
  friend_id: 7,
  stack_no: 2,
  source: "web",
  status: "open",
  created_at: TS,
  logged_at: null,
  voided_at: null,
  items: [
    {
      position: 0,
      copy_id: 3,
      release_id: "rel",
      album_title: "Album",
      album_artist: "Artist",
      album_thumbnail: null,
      library_identifier: null,
      inner_sleeve_type: null,
      last_cleaned_at: null,
    },
  ],
};

const copy = {
  id: 3,
  friend_id: 7,
  release_id: "rel",
  is_default: true,
  label: null,
  notes: null,
  inner_sleeve_type: "poly",
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
  session_id: 5,
  source: "web",
  created_at: TS,
};

const json = (method: string, url: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  analyticsEvents.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("error statuses", () => {
  it("maps session errors, then falls back to the care errors", () => {
    expect(getRecordCareSessionErrorStatus(RECORD_CARE_SESSION_NOT_FOUND)).toBe(404);
    for (const message of [
      STACK_NOT_OPEN,
      SESSION_NOT_LOGGED,
      ANOTHER_STACK_OPEN,
      NOTHING_TO_PULL,
    ]) {
      expect(getRecordCareSessionErrorStatus(message)).toBe(409);
    }
    expect(getRecordCareSessionErrorStatus(ALBUM_NOT_FOUND)).toBe(404);
    expect(getRecordCareSessionErrorStatus("boom")).toBe(500);
  });
});

describe("POST /api/record-care/stacks", () => {
  it("creates a stack (201) and returns an open one (200)", async () => {
    service.pullStack.mockResolvedValueOnce({ stack, created: true });
    const created = await pullStack(json("POST", "/api/record-care/stacks", { friend_id: "7" }));
    expect(created.status).toBe(201);
    expect(service.pullStack).toHaveBeenCalledWith({ friend_id: 7 });
    expect(analyticsEvents.events[0]).toMatchObject({
      event: "record_care_stack_pulled",
      properties: { session_id: 5, stack_no: 2, record_count: 1, created: true },
    });

    service.pullStack.mockResolvedValueOnce({ stack, created: false });
    const existing = await pullStack(json("POST", "/api/record-care/stacks", { friend_id: 7 }));
    expect(existing.status).toBe(200);
    expect(await existing.json()).toMatchObject({ created: false, stack: { id: 5 } });
  });

  it("rejects a bad body and maps service errors", async () => {
    const bad = await pullStack(json("POST", "/api/record-care/stacks", { friend_id: 7, size: 0 }));
    expect(bad.status).toBe(400);

    service.pullStack.mockRejectedValueOnce(new Error(NOTHING_TO_PULL));
    const empty = await pullStack(json("POST", "/api/record-care/stacks", { friend_id: 7 }));
    expect(empty.status).toBe(409);
    expect(await empty.json()).toEqual({ error: NOTHING_TO_PULL });

    service.pullStack.mockRejectedValueOnce("not an error");
    const odd = await pullStack(json("POST", "/api/record-care/stacks", { friend_id: 7 }));
    expect(odd.status).toBe(500);
  });
});

describe("GET /api/record-care/stacks", () => {
  it("lists with paging defaults and a status filter", async () => {
    service.listStacks.mockResolvedValue([stack]);
    const res = await listStacks(json("GET", "/api/record-care/stacks?friend_id=7&status=open"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [stack], limit: 20, offset: 0 });
    expect(service.listStacks).toHaveBeenCalledWith({
      friend_id: 7,
      status: "open",
      limit: 20,
      offset: 0,
    });
  });

  it("rejects a bad query and reports failures", async () => {
    expect((await listStacks(json("GET", "/api/record-care/stacks?status=open"))).status).toBe(400);
    service.listStacks.mockRejectedValueOnce(new Error("db down"));
    const res = await listStacks(json("GET", "/api/record-care/stacks?friend_id=7"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });
  });
});

describe("/api/record-care/stacks/:id", () => {
  it("gets a stack, 404 when not the friend's", async () => {
    service.getStack.mockResolvedValueOnce(stack);
    const res = await getStack(json("GET", "/api/record-care/stacks/5?friend_id=7"), ctx("5"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stack });
    expect(service.getStack).toHaveBeenCalledWith(5, 7);

    service.getStack.mockResolvedValueOnce(null);
    expect(
      (await getStack(json("GET", "/api/record-care/stacks/5?friend_id=7"), ctx("5"))).status,
    ).toBe(404);
  });

  it("validates the id and friend", async () => {
    expect(
      (await getStack(json("GET", "/api/record-care/stacks/x?friend_id=7"), ctx("x"))).status,
    ).toBe(400);
    expect((await getStack(json("GET", "/api/record-care/stacks/5"), ctx("5"))).status).toBe(400);
    service.getStack.mockRejectedValueOnce(new Error("db down"));
    expect(
      (await getStack(json("GET", "/api/record-care/stacks/5?friend_id=7"), ctx("5"))).status,
    ).toBe(500);
  });

  it("discards an open stack", async () => {
    service.discardStack.mockResolvedValueOnce({ ...stack, status: "discarded" });
    const res = await discardStack(
      json("DELETE", "/api/record-care/stacks/5?friend_id=7"),
      ctx("5"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, stack: { status: "discarded" } });
    expect(analyticsEvents.events[0]).toMatchObject({
      event: "record_care_stack_discarded",
      properties: { session_id: 5, stack_no: 2 },
    });
  });

  it("404s, 409s and 400s a discard", async () => {
    service.discardStack.mockResolvedValueOnce(null);
    expect(
      (await discardStack(json("DELETE", "/api/record-care/stacks/5?friend_id=7"), ctx("5")))
        .status,
    ).toBe(404);
    service.discardStack.mockRejectedValueOnce(new Error(STACK_NOT_OPEN));
    expect(
      (await discardStack(json("DELETE", "/api/record-care/stacks/5?friend_id=7"), ctx("5")))
        .status,
    ).toBe(409);
    expect((await discardStack(json("DELETE", "/api/record-care/stacks/5"), ctx("5"))).status).toBe(
      400,
    );
  });
});

describe("POST /api/record-care/sessions", () => {
  const body = {
    friend_id: "7",
    stack_id: "5",
    action_types: ["cleaned"],
    details: { method: "vacuum" },
    source: "web",
  };

  it("logs a stack and reports it", async () => {
    service.logSession.mockResolvedValueOnce({
      session: { ...stack, status: "logged", logged_at: TS },
      actions: [action],
      copies: [copy],
    });

    const res = await logSession(json("POST", "/api/record-care/sessions", body));

    expect(res.status).toBe(201);
    expect(service.logSession).toHaveBeenCalledWith({
      friend_id: 7,
      stack_id: 5,
      action_types: ["cleaned"],
      details: { method: "vacuum" },
      source: "web",
    });
    expect(analyticsEvents.events[0]).toMatchObject({
      event: "record_care_session_logged",
      properties: {
        session_id: 5,
        stack_no: 2,
        action_types: ["cleaned"],
        record_count: 1,
        sleeve_type: null,
        method: "vacuum",
      },
    });
  });

  it("reports the sleeve of a sleeving log", async () => {
    service.logSession.mockResolvedValueOnce({ session: stack, actions: [], copies: [] });
    await logSession(
      json("POST", "/api/record-care/sessions", {
        friend_id: 7,
        copies: [{ release_id: "rel" }],
        action_types: ["sleeved"],
        sleeve_type: "poly",
      }),
    );
    expect(analyticsEvents.events[0].properties).toMatchObject({
      sleeve_type: "poly",
      method: null,
    });
  });

  it("enforces the batch rules and maps service errors", async () => {
    const bad = await logSession(
      json("POST", "/api/record-care/sessions", { ...body, action_types: ["sleeved"] }),
    );
    expect(bad.status).toBe(400);

    service.logSession.mockRejectedValueOnce(new Error(RECORD_CARE_SESSION_NOT_FOUND));
    expect((await logSession(json("POST", "/api/record-care/sessions", body))).status).toBe(404);
    service.logSession.mockRejectedValueOnce(new Error(STACK_NOT_OPEN));
    expect((await logSession(json("POST", "/api/record-care/sessions", body))).status).toBe(409);
  });
});

describe("GET /api/record-care/sessions", () => {
  it("pages the care log", async () => {
    service.listLog.mockResolvedValue({ items: [], total: 0 });
    const res = await listLog(
      json("GET", "/api/record-care/sessions?friend_id=7&limit=5&offset=10"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], total: 0, limit: 5, offset: 10 });
    expect(service.listLog).toHaveBeenCalledWith({ friend_id: 7, limit: 5, offset: 10 });
  });

  it("rejects a bad query and reports failures", async () => {
    expect((await listLog(json("GET", "/api/record-care/sessions"))).status).toBe(400);
    service.listLog.mockRejectedValueOnce(new Error("db down"));
    expect((await listLog(json("GET", "/api/record-care/sessions?friend_id=7"))).status).toBe(500);
  });
});

describe("POST /api/record-care/sessions/:id/void", () => {
  it("undoes a log", async () => {
    service.voidSession.mockResolvedValueOnce({
      session: { ...stack, voided_at: TS },
      actions: [{ ...action, voided_at: TS }],
      copies: [copy],
    });
    const res = await voidSession(
      json("POST", "/api/record-care/sessions/5/void", { friend_id: 7 }),
      ctx("5"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, session: { voided_at: TS } });
    expect(service.voidSession).toHaveBeenCalledWith(5, 7);
    expect(analyticsEvents.events[0]).toMatchObject({
      event: "record_care_session_voided",
      properties: { session_id: 5, stack_no: 2, action_count: 1 },
    });
  });

  it("400s, 404s and 409s", async () => {
    const url = "/api/record-care/sessions/5/void";
    expect((await voidSession(json("POST", url, { friend_id: 7 }), ctx("x"))).status).toBe(400);
    expect((await voidSession(json("POST", url, {}), ctx("5"))).status).toBe(400);

    service.voidSession.mockResolvedValueOnce(null);
    expect((await voidSession(json("POST", url, { friend_id: 7 }), ctx("5"))).status).toBe(404);

    service.voidSession.mockRejectedValueOnce(new Error(ANOTHER_STACK_OPEN));
    expect((await voidSession(json("POST", url, { friend_id: 7 }), ctx("5"))).status).toBe(409);
  });
});
