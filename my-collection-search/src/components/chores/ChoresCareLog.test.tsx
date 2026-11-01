// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import ChoresCareLog, { CareLogEntryCard, careLogEntryKey, thisMonthLine } from "./ChoresCareLog";
import { careLogFixture, logEntryFixture } from "./fixtures";

const TZ = "America/Los_Angeles";
const NOW = new Date("2026-11-01T20:00:00Z");

type Props = Partial<React.ComponentProps<typeof ChoresCareLog>>;

function renderLog(props: Props = {}) {
  const onUndo = vi.fn();
  const view = renderWithProviders(
    <ChoresCareLog
      thisMonth={{ records: 11, sessions: 2 }}
      entries={careLogFixture}
      timeZone={TZ}
      justSavedSessionId={null}
      onUndo={onUndo}
      {...props}
    />,
  );
  return { ...view, onUndo };
}

const entry = (name: RegExp) => screen.getByRole("article", { name });

describe("ChoresCareLog", () => {
  it("heads the log with this month and links the full history", () => {
    renderLog();
    expect(screen.getByText("THIS MONTH · 11 RECORDS · 2 SESSIONS")).toBeTruthy();
    expect(screen.getByRole("link", { name: "FULL CARE HISTORY →" }).getAttribute("href")).toBe(
      "/chore/history",
    );
  });

  it("leaves the month line out without it", () => {
    renderLog({ thisMonth: null });
    expect(screen.queryByText(/THIS MONTH/)).toBeNull();
  });

  it("uses singulars", () => {
    expect(thisMonthLine({ records: 1, sessions: 1 })).toBe("THIS MONTH · 1 RECORD · 1 SESSION");
  });

  it("lists entries with headlines and source badges", () => {
    renderLog();
    const cli = entry(/^STACK 1 · CLEANED \+ SLEEVE CHANGE · 10 RECORDS$/);
    const badge = within(cli).getByTestId("care-log-source");
    expect(badge.textContent).toBe("VIA CLI");
    expect(badge.getAttribute("data-border")).toBe("solid");
    const mcp = entry(/^INSPECTED · 1 RECORD$/);
    expect(within(mcp).getByTestId("care-log-source").textContent).toBe("VIA MCP");
  });

  it("shows METHOD for a cleaning, SLEEVE for a sleeve change, and NOTE when present", () => {
    renderLog();
    const cli = entry(/^STACK 1/);
    expect(within(cli).getByText("METHOD")).toBeTruthy();
    expect(within(cli).getByText("Vacuum machine")).toBeTruthy();
    expect(within(cli).getByText("Poly / rice paper / poly")).toBeTruthy();
    expect(within(cli).getByText("Moved to poly / rice paper / poly.")).toBeTruthy();

    const mcp = entry(/^INSPECTED/);
    expect(within(mcp).queryByText("METHOD")).toBeNull();
    expect(within(mcp).queryByText("SLEEVE")).toBeNull();
    expect(within(mcp).getByText("NOTE")).toBeTruthy();
  });

  it("says Not recorded for a cleaning with no method, and leaves a bare entry's details out", () => {
    renderLog({
      entries: [
        logEntryFixture({ session_id: 1, stack_no: 4 }),
        logEntryFixture({ session_id: 2, stack_no: 5, action_types: ["repaired"] }),
      ],
    });
    expect(within(entry(/^STACK 4/)).getByText("Not recorded")).toBeTruthy();
    expect(within(entry(/^STACK 5/)).queryByRole("definition")).toBeNull();
  });

  it("draws covers", () => {
    renderLog({ entries: [logEntryFixture({ thumbnails: ["/a.jpg", "/b.jpg"] })] });
    expect(document.querySelectorAll("article img")).toHaveLength(2);
  });

  it("offers UNDO only on the log just saved", async () => {
    const saved = logEntryFixture({ session_id: 63, stack_no: 2 });
    const { user, onUndo } = renderLog({
      entries: [saved, ...careLogFixture],
      justSavedSessionId: 63,
    });
    expect(screen.getAllByRole("button", { name: /^UNDO/ })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "UNDO STACK 2 · CLEANED · 10 RECORDS" }));
    expect(onUndo).toHaveBeenCalledWith(63);
  });

  it("shows why an undo failed inside the entry", () => {
    renderLog({
      entries: [logEntryFixture({ session_id: 63 })],
      justSavedSessionId: 63,
      undoError: "Another stack is open. Log or clear it, then undo this one.",
    });
    expect(within(entry(/^STACK 1/)).getByRole("alert").textContent).toBe(
      "Another stack is open. Log or clear it, then undo this one.",
    );
  });

  it("leaves undone logs to the full history", () => {
    renderLog({
      entries: [logEntryFixture({ session_id: 63, voided: true }), ...careLogFixture],
      justSavedSessionId: 63,
    });
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^UNDO/ })).toBeNull();
  });

  it("caps the column", () => {
    renderLog({
      entries: Array.from({ length: 8 }, (_, i) => logEntryFixture({ session_id: i + 1 })),
    });
    expect(screen.getAllByRole("article")).toHaveLength(5);
  });

  it("says when nothing is logged, is loading or failed", () => {
    const { unmount } = renderLog({ entries: [] });
    expect(screen.getByText(/NOTHING LOGGED YET/)).toBeTruthy();
    unmount();

    const loading = renderLog({ entries: undefined });
    expect(screen.queryByRole("article")).toBeNull();
    loading.unmount();

    renderLog({ entries: undefined, error: new Error("boom") });
    expect(screen.getByRole("alert").textContent).toBe("COULDN'T LOAD THE CARE LOG · BOOM");
  });
});

describe("CareLogEntryCard", () => {
  it("strikes a voided entry through and says so", () => {
    renderWithProviders(
      <CareLogEntryCard
        entry={logEntryFixture({ voided: true, thumbnails: ["/a.jpg"] })}
        timeZone={TZ}
        justSaved
        now={NOW}
      />,
    );
    const card = screen.getByRole("article", { name: /, voided$/ });
    expect(within(card).getByText("VOIDED")).toBeTruthy();
    expect(within(card).getByText("TODAY · 10:09 AM")).toBeTruthy();
    expect(within(card).getByText("STACK 1 · CLEANED · 10 RECORDS")).toBeTruthy();
  });

  it("shows a pending action", () => {
    renderWithProviders(
      <CareLogEntryCard
        entry={logEntryFixture()}
        timeZone={TZ}
        action={{ label: "VOID", onClick: vi.fn(), pending: true }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "VOID STACK 1 · CLEANED · 10 RECORDS" }),
    ).toHaveProperty("disabled", true);
  });

  it("keys sessions and lone actions apart", () => {
    expect(careLogEntryKey({ kind: "session", session_id: 4, action_id: null })).toBe("session:4");
    expect(careLogEntryKey({ kind: "action", session_id: null, action_id: 9 })).toBe("action:9");
  });
});
