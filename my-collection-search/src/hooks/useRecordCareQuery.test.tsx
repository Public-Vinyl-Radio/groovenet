// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

const api = vi.hoisted(() => ({
  listRecordCopies: vi.fn(),
  createRecordCopy: vi.fn(),
  updateRecordCopy: vi.fn(),
  updateDefaultRecordCopy: vi.fn(),
  deleteRecordCopy: vi.fn(),
  listRecordActions: vi.fn(),
  createRecordAction: vi.fn(),
  voidRecordAction: vi.fn(),
  listRecordCare: vi.fn(),
  getRecordCareSummary: vi.fn(),
}));
vi.mock("@/services/internalApi/recordCare", () => api);

import {
  useRecordActionsQuery,
  useRecordCareMutations,
  useRecordCareQuery,
  useRecordCareSummaryQuery,
  useRecordCopiesQuery,
} from "./useRecordCareQuery";
import type { RecordCopyListItem } from "@/services/internalApi/recordCare";

const copy: RecordCopyListItem = {
  id: 3,
  friend_id: 7,
  release_id: "rel",
  is_default: true,
  label: null,
  notes: null,
  inner_sleeve_type: null,
  last_cleaned_at: null,
  deleted_at: null,
  created_at: null,
  updated_at: null,
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

beforeEach(() => vi.resetAllMocks());

describe("useRecordCopiesQuery", () => {
  it("returns the copies and the overdue threshold", async () => {
    api.listRecordCopies.mockResolvedValue({ items: [copy], overdue_days: 365 });
    const { wrapper } = setup();

    const { result } = renderHook(
      () => useRecordCopiesQuery({ friend_id: 7, release_id: "rel" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.copies).toEqual([copy]));
    expect(result.current.overdueDays).toBe(365);
    expect(api.listRecordCopies).toHaveBeenCalledWith({ friend_id: 7, release_id: "rel" });
  });

  it("is empty until loaded, and waits while disabled", () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useRecordCopiesQuery({ friend_id: 7, release_id: "rel" }, { enabled: false }),
      { wrapper }
    );
    expect(result.current.copies).toEqual([]);
    expect(result.current.overdueDays).toBeUndefined();
    expect(api.listRecordCopies).not.toHaveBeenCalled();
  });
});

describe("useRecordActionsQuery", () => {
  it("fetches a real copy's history", async () => {
    api.listRecordActions.mockResolvedValue({ items: [{ id: 11 }], limit: 100, offset: 0 });
    const { wrapper } = setup();

    const { result } = renderHook(() => useRecordActionsQuery(3, { friend_id: 7 }), { wrapper });

    await waitFor(() => expect(result.current.actions).toEqual([{ id: 11 }]));
    expect(api.listRecordActions).toHaveBeenCalledWith(3, { friend_id: 7, limit: 100 });
  });

  it("fetches nothing for an implicit copy", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useRecordActionsQuery(null, { friend_id: 7 }), { wrapper });
    expect(result.current.actions).toEqual([]);
    expect(api.listRecordActions).not.toHaveBeenCalled();
  });
});

describe("useRecordCareQuery", () => {
  it("returns a page of copies needing care", async () => {
    api.listRecordCare.mockResolvedValue({ items: [{ release_id: "rel" }], total: 1 });
    const { wrapper } = setup();
    const params = { friend_id: 7, status: "never_cleaned" as const, limit: 50, offset: 0 };

    const { result } = renderHook(() => useRecordCareQuery(params), { wrapper });

    await waitFor(() => expect(result.current.items).toEqual([{ release_id: "rel" }]));
    expect(api.listRecordCare).toHaveBeenCalledWith(params);
  });

  it("is empty while disabled", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useRecordCareQuery({ friend_id: 0 }, { enabled: false }), {
      wrapper,
    });
    expect(result.current.items).toEqual([]);
  });
});

describe("useRecordCareSummaryQuery", () => {
  it("gets the counts", async () => {
    api.getRecordCareSummary.mockResolvedValue({ total: 4 });
    const { wrapper } = setup();

    const { result } = renderHook(() => useRecordCareSummaryQuery({ friend_id: 7 }), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ total: 4 }));
  });

  it("waits while disabled", () => {
    const { wrapper } = setup();
    renderHook(() => useRecordCareSummaryQuery({ friend_id: 7 }, { enabled: false }), { wrapper });
    expect(api.getRecordCareSummary).not.toHaveBeenCalled();
  });
});

describe("useRecordCareMutations", () => {
  async function run(act: (m: ReturnType<typeof useRecordCareMutations>) => Promise<unknown>) {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useRecordCareMutations(7), { wrapper });
    await act(result.current);
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.recordCareRoot() })
    );
  }

  it("adds a copy for the friend", async () => {
    api.createRecordCopy.mockResolvedValue({});
    await run((m) => m.addCopy({ release_id: "rel", label: "Copy 2" }));
    expect(api.createRecordCopy).toHaveBeenCalledWith({
      friend_id: 7,
      release_id: "rel",
      label: "Copy 2",
    });
  });

  it("edits a real copy by id", async () => {
    api.updateRecordCopy.mockResolvedValue({});
    await run((m) => m.updateCopy(copy, { notes: "VG+" }));
    expect(api.updateRecordCopy).toHaveBeenCalledWith(3, { friend_id: 7, notes: "VG+" });
    expect(api.updateDefaultRecordCopy).not.toHaveBeenCalled();
  });

  it("edits an implicit default copy by release", async () => {
    api.updateDefaultRecordCopy.mockResolvedValue({});
    await run((m) => m.updateCopy({ ...copy, id: null }, { label: "DJ copy" }));
    expect(api.updateDefaultRecordCopy).toHaveBeenCalledWith({
      friend_id: 7,
      release_id: "rel",
      label: "DJ copy",
    });
    expect(api.updateRecordCopy).not.toHaveBeenCalled();
  });

  it("removes a copy", async () => {
    api.deleteRecordCopy.mockResolvedValue({});
    await run((m) => m.removeCopy(4));
    expect(api.deleteRecordCopy).toHaveBeenCalledWith(4, 7);
  });

  it("logs an action for the friend", async () => {
    api.createRecordAction.mockResolvedValue({});
    await run((m) => m.logAction({ copy_id: 3, action_type: "inspected" }));
    expect(api.createRecordAction).toHaveBeenCalledWith({
      friend_id: 7,
      copy_id: 3,
      action_type: "inspected",
    });
  });

  it("voids an action", async () => {
    api.voidRecordAction.mockResolvedValue({});
    await run((m) => m.voidAction(11));
    expect(api.voidRecordAction).toHaveBeenCalledWith(11, 7);
  });
});
