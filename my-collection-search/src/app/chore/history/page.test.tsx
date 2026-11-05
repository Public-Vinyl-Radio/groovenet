// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { logEntryFixture } from "@/components/chores/fixtures";
import { ANOTHER_STACK_OPEN_MESSAGE } from "@/components/chores/careLog";

const api = vi.hoisted(() => ({
  listRecordCareLog: vi.fn(),
  voidRecordCareSession: vi.fn(),
  voidRecordAction: vi.fn(),
}));
vi.mock("@/services/internalApi/recordCare", () => api);
const username = vi.hoisted(() => ({
  current: { friend: { id: 7 } as { id: number } | null, isHydrated: true },
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => username.current }));

import CareHistoryPage from "./page";

const session = logEntryFixture({ session_id: 61, stack_no: 3 });
const voided = logEntryFixture({ session_id: 60, stack_no: 2, voided: true });
const lone = logEntryFixture({
  kind: "action",
  session_id: null,
  action_id: 900,
  stack_no: null,
  source: "api",
  action_types: ["repaired"],
  record_count: 1,
});

const page = (items = [session, voided, lone], total = items.length) => ({
  items,
  total,
  limit: 20,
  offset: 0,
});

beforeEach(() => {
  vi.resetAllMocks();
  username.current = { friend: { id: 7 }, isHydrated: true };
  api.listRecordCareLog.mockResolvedValue(page());
});

describe("Care history page", () => {
  it("waits for the friend", () => {
    username.current = { friend: null, isHydrated: true };
    renderWithProviders(<CareHistoryPage />);
    expect(api.listRecordCareLog).not.toHaveBeenCalled();
  });

  it("lists every entry, voided ones struck through without a VOID", async () => {
    renderWithProviders(<CareHistoryPage />);
    expect(await screen.findByText("3 entries")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId("page-header-meta").textContent).toBe("3 entries");
    expect(api.listRecordCareLog).toHaveBeenCalledWith({ friend_id: 7, limit: 20 });

    const struck = screen.getByRole("article", { name: "STACK 2 · CLEANED · 10 RECORDS, voided" });
    expect(within(struck).getByText("Voided")).toBeTruthy();
    expect(within(struck).queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^VOID / })).toHaveLength(2);
  });

  it("voids a session after confirming", async () => {
    api.voidRecordCareSession.mockResolvedValue({ session: {}, actions: [], copies: [] });
    const { user } = renderWithProviders(<CareHistoryPage />);
    await user.click(
      await screen.findByRole("button", { name: "VOID STACK 3 · CLEANED · 10 RECORDS" }),
    );
    const prompt = await screen.findByRole("alertdialog");
    expect(within(prompt).getByText(/STACK 3 · CLEANED · 10 RECORDS\. It stays/)).toBeTruthy();

    await user.click(within(prompt).getByRole("button", { name: "VOID" }));

    expect(api.voidRecordCareSession).toHaveBeenCalledWith(61, 7);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("voids an action logged on its own", async () => {
    api.voidRecordAction.mockResolvedValue({ success: true });
    const { user } = renderWithProviders(<CareHistoryPage />);
    await user.click(await screen.findByRole("button", { name: "VOID REPAIRED · 1 RECORD" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "VOID" }),
    );
    expect(api.voidRecordAction).toHaveBeenCalledWith(900, 7);
  });

  it("shows a failed void in its entry", async () => {
    api.voidRecordCareSession.mockRejectedValue(new Error(ANOTHER_STACK_OPEN_MESSAGE));
    const { user } = renderWithProviders(<CareHistoryPage />);
    await user.click(
      await screen.findByRole("button", { name: "VOID STACK 3 · CLEANED · 10 RECORDS" }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "VOID" }),
    );

    const card = screen.getByRole("article", { name: "STACK 3 · CLEANED · 10 RECORDS" });
    expect((await within(card).findByRole("alert")).textContent).toBe(
      "Another stack is open. Log or clear it, then undo this one.",
    );
  });

  it("cancels a void", async () => {
    const { user } = renderWithProviders(<CareHistoryPage />);
    await user.click(
      await screen.findByRole("button", { name: "VOID STACK 3 · CLEANED · 10 RECORDS" }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /cancel/i }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.voidRecordCareSession).not.toHaveBeenCalled();
  });

  it("pages the feed", async () => {
    api.listRecordCareLog.mockResolvedValue(page([session], 25));
    const { user } = renderWithProviders(<CareHistoryPage />);
    await user.click(await screen.findByRole("button", { name: "24 MORE →" }));
    await waitFor(() =>
      expect(api.listRecordCareLog).toHaveBeenCalledWith({ friend_id: 7, limit: 40 }),
    );
  });

  it("says when nothing is logged, and when it failed", async () => {
    api.listRecordCareLog.mockResolvedValue(page([], 0));
    const { unmount } = renderWithProviders(<CareHistoryPage />);
    expect(await screen.findByText("Nothing logged yet.")).toBeTruthy();
    expect(screen.getByText("0 entries")).toBeTruthy();
    unmount();

    api.listRecordCareLog.mockRejectedValue(new Error("boom"));
    renderWithProviders(<CareHistoryPage />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "COULDN'T LOAD THE CARE HISTORY · BOOM",
    );
  });

  it("says ENTRY for one", async () => {
    api.listRecordCareLog.mockResolvedValue(page([session]));
    renderWithProviders(<CareHistoryPage />);
    expect(await screen.findByText("1 entry")).toBeTruthy();
  });
});
