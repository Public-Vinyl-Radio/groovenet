// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import ChoresSelectionBar from "./ChoresSelectionBar";
import ChoresCareLogSlot, { thisMonthLine } from "./ChoresCareLogSlot";

describe("ChoresSelectionBar", () => {
  it("prompts when nothing is selected, with no actions", () => {
    renderWithProviders(<ChoresSelectionBar selected={0} stackNo={null} onClear={vi.fn()} />);
    expect(screen.getAllByText("Select records, or pull the next stack.").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("button", { name: "CLEAR" })).toBeNull();
  });

  it("names a pulled stack and gives the terminal hint", () => {
    renderWithProviders(<ChoresSelectionBar selected={10} stackNo={2} onClear={vi.fn()} />);
    expect(screen.getByText("STACK 2 · 10 SELECTED")).toBeTruthy();
    expect(screen.getByText("STACK 2 · 10")).toBeTruthy();
    expect(screen.getByText("groovenet records clean --stack 2")).toBeTruthy();
  });

  it("counts an ad-hoc pick without a hint", () => {
    renderWithProviders(<ChoresSelectionBar selected={3} stackNo={null} onClear={vi.fn()} />);
    expect(screen.getAllByText("3 SELECTED")).toHaveLength(2);
    expect(screen.queryByText(/from the terminal/)).toBeNull();
  });

  it("clears, and keeps LOG CARE disabled until the modal exists", async () => {
    const onClear = vi.fn();
    const { user } = renderWithProviders(
      <ChoresSelectionBar selected={3} stackNo={null} onClear={onClear} />,
    );
    await user.click(screen.getByRole("button", { name: "CLEAR" }));
    expect(onClear).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "LOG CARE →" })).toHaveProperty("disabled", true);
  });

  it("opens the log when given a handler", async () => {
    const onLogCare = vi.fn();
    const { user } = renderWithProviders(
      <ChoresSelectionBar selected={3} stackNo={null} onClear={vi.fn()} onLogCare={onLogCare} />,
    );
    await user.click(screen.getByRole("button", { name: "LOG CARE →" }));
    expect(onLogCare).toHaveBeenCalled();
  });
});

describe("ChoresCareLogSlot", () => {
  it("shows this month and the coming-soon slot", () => {
    renderWithProviders(<ChoresCareLogSlot thisMonth={{ records: 11, sessions: 2 }} />);
    expect(screen.getByText("THIS MONTH · 11 RECORDS · 2 SESSIONS")).toBeTruthy();
    expect(screen.getByText("CARE LOG COMING SOON")).toBeTruthy();
  });

  it("leaves the month line out without it", () => {
    renderWithProviders(<ChoresCareLogSlot thisMonth={null} />);
    expect(screen.queryByText(/THIS MONTH/)).toBeNull();
  });

  it("uses singulars", () => {
    expect(thisMonthLine({ records: 1, sessions: 1 })).toBe("THIS MONTH · 1 RECORD · 1 SESSION");
  });
});
