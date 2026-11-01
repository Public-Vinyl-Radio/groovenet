// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import {
  logEntryFixture,
  progressFixture,
  queueFixture,
  queueItem,
  stackFixture,
} from "@/components/chores/fixtures";
import { ANOTHER_STACK_OPEN_MESSAGE } from "@/components/chores/careLog";

const api = vi.hoisted(() => ({
  getRecordCareQueue: vi.fn(),
  getRecordCareProgress: vi.fn(),
  listRecordCareStacks: vi.fn(),
  pullRecordCareStack: vi.fn(),
  discardRecordCareStack: vi.fn(),
  getRecordCareSummary: vi.fn(),
  listRecordCareLog: vi.fn(),
  logRecordCareSession: vi.fn(),
  voidRecordCareSession: vi.fn(),
}));
vi.mock("@/services/internalApi/recordCare", () => api);
const toaster = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/components/ui/toaster", () => ({ toaster }));
const username = vi.hoisted(() => ({
  current: { friend: { id: 7 } as { id: number } | null, isHydrated: true },
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => username.current }));

import ChorePage from "./page";
import ChoreLayout, { metadata } from "./layout";

const noStack = { items: [], limit: 1, offset: 0 };
const emptyLog = { items: [], total: 0, limit: 10, offset: 0 };

beforeEach(() => {
  vi.resetAllMocks();
  username.current = { friend: { id: 7 }, isHydrated: true };
  api.getRecordCareQueue.mockResolvedValue(queueFixture());
  api.getRecordCareProgress.mockResolvedValue(progressFixture);
  api.listRecordCareStacks.mockResolvedValue(noStack);
  api.getRecordCareSummary.mockResolvedValue({ needs_sleeve_type: "poly" });
  api.listRecordCareLog.mockResolvedValue(emptyLog);
});

const checkbox = (name: RegExp) => screen.getByRole("checkbox", { name });
const checked = (name: RegExp) => checkbox(name).getAttribute("aria-checked") === "true";
const bar = () => screen.getByTestId("chores-selection-bar");

async function renderPage() {
  const view = renderWithProviders(<ChorePage />);
  await screen.findByRole("checkbox", { name: /Album 1/ });
  return view;
}

describe("Chores page", () => {
  it("names the route", () => {
    expect(metadata.title).toBe("Chores");
    const child = <span>child</span>;
    expect(ChoreLayout({ children: child })).toBe(child);
  });

  it("waits for the friend", () => {
    username.current = { friend: null, isHydrated: true };
    renderWithProviders(<ChorePage />);
    expect(api.getRecordCareQueue).not.toHaveBeenCalled();
  });

  it("shows progress, the to-do count and the three groups with their meta", async () => {
    await renderPage();

    expect(api.getRecordCareQueue).toHaveBeenCalledWith({ friend_id: 7, limit: 20 });
    expect(screen.getByRole("tab", { name: "TO DO · 402" })).toBeTruthy();
    expect(screen.getByTestId("chores-overview")).toBeTruthy();
    expect(checkbox(/Album 1/).textContent).toContain("SPUN 3× IN OCT");
    expect(checkbox(/Album 3/).textContent).toContain("ADDED OCT 17");
    expect(checkbox(/Album 4/).textContent).toContain("SLEEVE ?");
    expect(checkbox(/Album 5/).textContent).not.toContain("SLEEVE ?");
    expect(screen.getByRole("article", { name: "BACKLOG · A–Z" })).toBeTruthy();
    expect(screen.getByText("THIS MONTH · 11 RECORDS · 2 SESSIONS")).toBeTruthy();
  });

  it("hides empty groups", async () => {
    api.getRecordCareQueue.mockResolvedValue(queueFixture({ spun: [], fresh: [1] }));
    renderWithProviders(<ChorePage />);
    await screen.findByRole("checkbox", { name: /Album 1/ });
    expect(screen.queryByRole("article", { name: "SPUN RECENTLY · NEVER CLEANED" })).toBeNull();
    expect(screen.getByRole("article", { name: "NEW ARRIVALS" })).toBeTruthy();
  });

  it("says so when nothing is left to clean, and disables the pull", async () => {
    api.getRecordCareQueue.mockResolvedValue(queueFixture({ spun: [], fresh: [], backlog: [] }));
    api.getRecordCareProgress.mockResolvedValue({
      ...progressFixture,
      cleaned: 412,
      stacks_done: 42,
      next_stack_no: null,
    });
    renderWithProviders(<ChorePage />);
    expect(await screen.findByText(/NOTHING LEFT TO CLEAN/)).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "PULL NEXT STACK OF 10" }).hasAttribute("disabled"),
      ).toBe(true),
    );
  });

  it("reports a queue or progress failure", async () => {
    api.getRecordCareQueue.mockRejectedValue(new Error("boom"));
    api.getRecordCareProgress.mockRejectedValue(new Error("nope"));
    renderWithProviders(<ChorePage />);
    expect(await screen.findByText(/COULDN'T LOAD THE QUEUE · BOOM/)).toBeTruthy();
    expect(await screen.findByText(/COULDN'T LOAD PROGRESS · NOPE/)).toBeTruthy();
  });

  it("selects and deselects rows, and counts an ad-hoc pick", async () => {
    const { user } = await renderPage();

    await user.click(checkbox(/Album 4/));
    expect(checked(/Album 4/)).toBe(true);
    expect(within(bar()).getAllByText("1 SELECTED").length).toBeGreaterThan(0);
    await user.click(checkbox(/Album 4/));
    expect(checked(/Album 4/)).toBe(false);
  });

  it("selects and clears a section", async () => {
    const { user } = await renderPage();
    const spun = screen.getByRole("article", { name: "SPUN RECENTLY · NEVER CLEANED" });

    await user.click(within(spun).getByRole("button", { name: "SELECT SECTION" }));
    expect(checked(/Album 1/) && checked(/Album 2/)).toBe(true);
    expect(checked(/Album 3/)).toBe(false);

    await user.click(within(spun).getByRole("button", { name: "CLEAR SECTION" }));
    expect(checked(/Album 1/) || checked(/Album 2/)).toBe(false);
  });

  it("clears an ad-hoc pick without touching a stack", async () => {
    const { user } = await renderPage();
    await user.click(checkbox(/Album 4/));
    await user.click(within(bar()).getByRole("button", { name: "CLEAR" }));
    expect(checked(/Album 4/)).toBe(false);
    expect(api.discardRecordCareStack).not.toHaveBeenCalled();
  });

  it("pulls a stack as the web app and selects it", async () => {
    const stack = stackFixture([6, 7]);
    api.pullRecordCareStack.mockResolvedValue({ stack, created: true });
    const { user } = await renderPage();
    api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [stack] });

    await user.click(screen.getByRole("button", { name: "PULL NEXT STACK OF 10" }));

    expect(api.pullRecordCareStack).toHaveBeenCalledWith({ friend_id: 7, size: 10 });
    const group = await screen.findByRole("article", { name: "STACK 2 · PULLED" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(2);
    expect(checked(/Album 6/) && checked(/Album 7/)).toBe(true);
    expect(within(bar()).getByText("STACK 2 · 2")).toBeTruthy();
    expect(within(bar()).getByText("groovenet records clean --stack 2")).toBeTruthy();
  });

  it("re-selects the open stack when pulled again after a deselect", async () => {
    const stack = stackFixture([6]);
    api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [stack] });
    api.pullRecordCareStack.mockResolvedValue({ stack, created: false });
    const { user } = renderWithProviders(<ChorePage />);
    await waitFor(() => expect(checked(/Album 6/)).toBe(true));

    await user.click(checkbox(/Album 6/));
    expect(checked(/Album 6/)).toBe(false);
    await user.click(screen.getByRole("button", { name: "PULL NEXT STACK OF 10" }));
    await waitFor(() => expect(checked(/Album 6/)).toBe(true));
  });

  it("toasts a failed pull", async () => {
    api.pullRecordCareStack.mockRejectedValue(new Error("no copies"));
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "PULL NEXT STACK OF 10" }));
    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't pull a stack", description: "no copies" }),
      ),
    );
  });

  it("toasts a non-Error rejection as text", async () => {
    api.pullRecordCareStack.mockRejectedValue("offline");
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "PULL NEXT STACK OF 10" }));
    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: "offline" }),
      ),
    );
  });

  it("leaves the meta off a new arrival with no import time", async () => {
    const queue = queueFixture();
    queue.new_arrivals.items[0] = { ...queue.new_arrivals.items[0], added_at: null };
    api.getRecordCareQueue.mockResolvedValue(queue);
    await renderPage();
    expect(checkbox(/Album 3/).textContent).not.toContain("ADDED");
  });

  it("restores an open stack on load, selected", async () => {
    api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [stackFixture([6, 7], 3)] });
    renderWithProviders(<ChorePage />);

    await waitFor(() => expect(checked(/Album 6/) && checked(/Album 7/)).toBe(true));
    expect(api.listRecordCareStacks).toHaveBeenCalledWith({
      friend_id: 7,
      status: "open",
      limit: 1,
    });
    expect(within(bar()).getByText("STACK 3 · 2")).toBeTruthy();
  });

  it("drops the stack label once the pick goes beyond the stack", async () => {
    api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [stackFixture([6])] });
    const { user } = renderWithProviders(<ChorePage />);
    await waitFor(() => expect(checked(/Album 6/)).toBe(true));

    await user.click(checkbox(/Album 4/));
    expect(within(bar()).getAllByText("2 SELECTED").length).toBeGreaterThan(0);
    expect(within(bar()).queryByText(/from the terminal/)).toBeNull();
  });

  it("discards a pulled stack on CLEAR", async () => {
    const stack = stackFixture([6]);
    api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [stack] });
    api.discardRecordCareStack.mockResolvedValue({ stack, success: true });
    const { user } = renderWithProviders(<ChorePage />);
    await waitFor(() => expect(checked(/Album 6/)).toBe(true));
    api.listRecordCareStacks.mockResolvedValue(noStack);

    await user.click(within(bar()).getByRole("button", { name: "CLEAR" }));

    expect(api.discardRecordCareStack).toHaveBeenCalledWith(50, 7);
    await waitFor(() => expect(screen.queryByRole("article", { name: /PULLED/ })).toBeNull());
  });

  it("keeps the selection and toasts when the discard fails", async () => {
    api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [stackFixture([6])] });
    api.discardRecordCareStack.mockRejectedValue(new Error("gone"));
    const { user } = renderWithProviders(<ChorePage />);
    await waitFor(() => expect(checked(/Album 6/)).toBe(true));

    await user.click(within(bar()).getByRole("button", { name: "CLEAR" }));

    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't clear the stack" }),
      ),
    );
    expect(checked(/Album 6/)).toBe(true);
  });

  it("names an ad-hoc open stack without a number", async () => {
    api.listRecordCareStacks.mockResolvedValue({
      ...noStack,
      items: [{ ...stackFixture([6]), stack_no: null }],
    });
    renderWithProviders(<ChorePage />);
    expect(await screen.findByRole("article", { name: "PULLED STACK" })).toBeTruthy();
  });

  it("pages the backlog", async () => {
    api.getRecordCareQueue.mockResolvedValue(queueFixture({ backlogTotal: 30 }));
    const { user } = await renderPage();

    await user.click(screen.getByRole("button", { name: /28 MORE IN THE BACKLOG/ }));

    await waitFor(() =>
      expect(api.getRecordCareQueue).toHaveBeenCalledWith({ friend_id: 7, limit: 40 }),
    );
  });

  it("hides more once the backlog is all shown", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: /MORE IN THE BACKLOG/ })).toBeNull();
  });

  it("switches to the care log tab on a phone", async () => {
    const { user } = await renderPage();
    await user.click(screen.getByRole("tab", { name: "CARE LOG" }));
    expect(screen.getByRole("tab", { name: "CARE LOG" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "FULL CARE HISTORY →" }).getAttribute("href")).toBe(
      "/chore/history",
    );
    expect(screen.queryByRole("checkbox", { name: /Album 1/ })).toBeNull();
  });

  describe("logging care", () => {
    const logged = (stack: ReturnType<typeof stackFixture>) => ({
      session: { ...stack, status: "logged", logged_at: "2026-11-01T18:09:00Z" },
      actions: [],
      copies: [],
    });
    const dialog = () => screen.getByRole("dialog");
    const logCare = () => within(bar()).getByRole("button", { name: "LOG CARE →" });
    // jsdom applies the phone layout, where the log and the queue are tabs.
    const tab = (name: RegExp) => screen.getByRole("tab", { name });
    const afterSave = async (user: { click: (el: Element) => Promise<void> }) => {
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await user.click(tab(/CARE LOG/));
    };

    it("logs a pulled stack by id, and offers UNDO on the new entry", async () => {
      const stack = stackFixture([6, 7]);
      api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [stack] });
      api.logRecordCareSession.mockResolvedValue(logged(stack));
      const { user } = renderWithProviders(<ChorePage />);
      await waitFor(() => expect(checked(/Album 6/)).toBe(true));

      await user.click(logCare());
      expect(within(dialog()).getByText("LOG CARE · STACK 2 · 2 RECORDS")).toBeTruthy();
      expect(within(dialog()).getByText("Album 6 · Album 7")).toBeTruthy();
      api.listRecordCareStacks.mockResolvedValue(noStack);
      api.listRecordCareLog.mockResolvedValue({
        ...emptyLog,
        items: [logEntryFixture({ session_id: stack.id, stack_no: 2, record_count: 2 })],
        total: 1,
      });
      await user.click(within(dialog()).getByRole("button", { name: /^SAVE FOR 2/ }));

      expect(api.logRecordCareSession).toHaveBeenCalledWith({
        friend_id: 7,
        stack_id: 50,
        action_types: ["cleaned"],
        occurred_at: expect.any(String),
      });
      await afterSave(user);
      expect(
        await screen.findByRole("button", { name: "UNDO STACK 2 · CLEANED · 2 RECORDS" }),
      ).toBeTruthy();
      await waitFor(() => expect(screen.queryByRole("article", { name: /PULLED/ })).toBeNull());
      expect(api.getRecordCareQueue.mock.calls.length).toBeGreaterThan(1);
    });

    it("logs an ad-hoc pick by copy, starting a sleeve change on the summary's sleeve", async () => {
      api.logRecordCareSession.mockResolvedValue(logged({ ...stackFixture([4]), stack_no: null }));
      const { user } = await renderPage();

      await user.click(checkbox(/Album 4/));
      await user.click(logCare());
      expect(within(dialog()).getByText("LOG CARE · 1 RECORD")).toBeTruthy();
      await user.click(within(dialog()).getByRole("button", { name: "SLEEVE CHANGE" }));
      expect((within(dialog()).getByLabelText("SLEEVE") as HTMLSelectElement).value).toBe("poly");
      await user.click(within(dialog()).getByRole("button", { name: /^SAVE FOR 1/ }));

      expect(api.logRecordCareSession).toHaveBeenCalledWith(
        expect.objectContaining({
          friend_id: 7,
          copies: [{ release_id: "rel-4" }],
          action_types: ["cleaned", "sleeved"],
          sleeve_type: "poly",
        }),
      );
      await waitFor(() => expect(checked(/Album 4/)).toBe(false));
    });

    it("logs part of a stack copy by copy", async () => {
      api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [stackFixture([6, 7])] });
      api.logRecordCareSession.mockResolvedValue(logged({ ...stackFixture([6]), stack_no: null }));
      const { user } = renderWithProviders(<ChorePage />);
      await waitFor(() => expect(checked(/Album 7/)).toBe(true));

      await user.click(checkbox(/Album 7/));
      await user.click(logCare());
      expect(within(dialog()).getByText("LOG CARE · 1 RECORD")).toBeTruthy();
      await user.click(within(dialog()).getByRole("button", { name: /^SAVE FOR 1/ }));

      expect(api.logRecordCareSession).toHaveBeenCalledWith(
        expect.objectContaining({ copies: [{ release_id: "rel-6" }] }),
      );
    });

    it("undoes a stack's log and re-selects the reopened stack", async () => {
      const stack = stackFixture([6, 7]);
      api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [stack] });
      api.logRecordCareSession.mockResolvedValue(logged(stack));
      api.voidRecordCareSession.mockResolvedValue({ session: stack, actions: [], copies: [] });
      const { user } = renderWithProviders(<ChorePage />);
      await waitFor(() => expect(checked(/Album 6/)).toBe(true));
      await user.click(logCare());
      api.listRecordCareStacks.mockResolvedValue(noStack);
      api.listRecordCareLog.mockResolvedValue({
        ...emptyLog,
        items: [logEntryFixture({ session_id: stack.id, stack_no: 2, record_count: 2 })],
      });
      await user.click(within(dialog()).getByRole("button", { name: /^SAVE FOR 2/ }));
      await afterSave(user);
      const undo = await screen.findByRole("button", { name: /^UNDO STACK 2/ });

      api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [stack] });
      api.listRecordCareLog.mockResolvedValue({
        ...emptyLog,
        items: [logEntryFixture({ session_id: stack.id, stack_no: 2, voided: true })],
      });
      await user.click(undo);

      expect(api.voidRecordCareSession).toHaveBeenCalledWith(stack.id, 7);
      await waitFor(() => expect(screen.queryByRole("button", { name: /^UNDO/ })).toBeNull());
      await user.click(tab(/TO DO/));
      await waitFor(() => expect(checked(/Album 6/) && checked(/Album 7/)).toBe(true));
      expect(within(bar()).getByText("STACK 2 · 2")).toBeTruthy();
    });

    it("undoes an ad-hoc log and re-selects its copies", async () => {
      const session = { ...stackFixture([4]), id: 70, stack_no: null };
      api.logRecordCareSession.mockResolvedValue(logged(session));
      api.voidRecordCareSession.mockResolvedValue({
        session: { ...session, status: "logged", voided_at: "2026-11-01T18:10:00Z" },
        actions: [],
        copies: [{ id: 99, release_id: "rel-4" }],
      });
      const { user } = await renderPage();
      await user.click(checkbox(/Album 4/));
      await user.click(logCare());
      api.listRecordCareLog.mockResolvedValue({
        ...emptyLog,
        items: [logEntryFixture({ session_id: 70, stack_no: null, record_count: 1 })],
      });
      await user.click(within(dialog()).getByRole("button", { name: /^SAVE FOR 1/ }));
      await afterSave(user);
      const undo = await screen.findByRole("button", { name: "UNDO CLEANED · 1 RECORD" });

      // Logging made the implicit copy real; the queue lists it by id now.
      api.getRecordCareQueue.mockResolvedValue({
        ...queueFixture({ backlog: [] }),
        backlog: { items: [queueItem(4, { copy_id: 99 })], total: 1, limit: 20, offset: 0 },
      });
      await user.click(undo);

      expect(api.voidRecordCareSession).toHaveBeenCalledWith(70, 7);
      await user.click(tab(/TO DO/));
      await waitFor(() => expect(checked(/Album 4/)).toBe(true));
    });

    it("counts restored copies the queue doesn't list yet", async () => {
      const session = { ...stackFixture([4]), id: 72, stack_no: null };
      api.logRecordCareSession.mockResolvedValue(logged(session));
      api.voidRecordCareSession.mockResolvedValue({
        session: { ...session, status: "logged" },
        actions: [],
        copies: [{ id: 98, release_id: "rel-gone" }],
      });
      const { user } = await renderPage();
      await user.click(checkbox(/Album 4/));
      await user.click(logCare());
      api.listRecordCareLog.mockResolvedValue({
        ...emptyLog,
        items: [logEntryFixture({ session_id: 72, stack_no: null, record_count: 1 })],
      });
      await user.click(within(dialog()).getByRole("button", { name: /^SAVE FOR 1/ }));
      await afterSave(user);
      await user.click(await screen.findByRole("button", { name: /^UNDO/ }));
      await waitFor(() => expect(api.voidRecordCareSession).toHaveBeenCalled());
      await user.click(tab(/TO DO/));

      await user.click(within(bar()).getByRole("button", { name: "LOG CARE →" }));
      expect(within(dialog()).getByText("LOG CARE · 1 RECORD")).toBeTruthy();
      expect(within(dialog()).queryByText(/Album/)).toBeNull();
    });

    it("explains an undo blocked by another open stack", async () => {
      const session = { ...stackFixture([6]), id: 71 };
      api.listRecordCareStacks.mockResolvedValue({ ...noStack, items: [session] });
      api.logRecordCareSession.mockResolvedValue(logged(session));
      api.voidRecordCareSession.mockRejectedValue(new Error(ANOTHER_STACK_OPEN_MESSAGE));
      const { user } = renderWithProviders(<ChorePage />);
      await waitFor(() => expect(checked(/Album 6/)).toBe(true));
      await user.click(logCare());
      api.listRecordCareLog.mockResolvedValue({
        ...emptyLog,
        items: [logEntryFixture({ session_id: 71 })],
      });
      await user.click(within(dialog()).getByRole("button", { name: /^SAVE FOR 1/ }));
      await afterSave(user);

      await user.click(await screen.findByRole("button", { name: /^UNDO/ }));

      expect(
        await screen.findByText("Another stack is open. Log or clear it, then undo this one."),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: /^UNDO/ })).toBeTruthy();
    });

    it("keeps the dialog open with the API's error", async () => {
      api.logRecordCareSession.mockRejectedValue(new Error("Record copy not found"));
      const { user } = await renderPage();
      await user.click(checkbox(/Album 4/));
      await user.click(logCare());
      await user.click(within(dialog()).getByRole("button", { name: /^SAVE FOR 1/ }));

      expect((await within(dialog()).findByRole("alert")).textContent).toBe(
        "Couldn't save: Record copy not found",
      );
      expect(api.listRecordCareLog).toHaveBeenCalledTimes(1);
    });
  });
});
