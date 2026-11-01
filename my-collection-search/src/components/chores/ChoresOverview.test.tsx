// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import ChoresOverview from "./ChoresOverview";
import { progressFixture } from "./fixtures";

describe("ChoresOverview", () => {
  it("shows cleaned / total and one block per stack, the next one outlined", () => {
    const { container } = renderWithProviders(<ChoresOverview progress={progressFixture} />);

    expect(screen.getByText("/ 412 CLEANED").previousSibling?.textContent).toBe("10");
    expect(screen.getByText("STACK 2 OF 42 UP NEXT")).toBeTruthy();
    const grid = screen.getByRole("img", { name: "10 of 412 copies cleaned, in stacks of 10" });
    expect(grid.children).toHaveLength(42);
    expect(container.querySelectorAll('[data-block="done"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-block="next"]')).toHaveLength(1);
  });

  it("hides the pace clause when there is no pace", () => {
    renderWithProviders(<ChoresOverview progress={progressFixture} />);
    expect(screen.getByText("ONE BLOCK = ONE STACK OF 10")).toBeTruthy();
    expect(screen.queryByText(/STACKS\/WEEK/)).toBeNull();
  });

  it("shows the pace and finish date when there is one", () => {
    renderWithProviders(
      <ChoresOverview
        progress={{
          ...progressFixture,
          pace: { stacks_per_week: 2, projected_finish_date: "2027-02-10T12:00:00Z" },
        }}
      />,
    );
    expect(screen.getByText(/2 STACKS\/WEEK FINISHES BY FEB 10, 2027/)).toBeTruthy();
  });

  it("draws the sleeves bar with a text label and counts", () => {
    const { container } = renderWithProviders(<ChoresOverview progress={progressFixture} />);

    expect(
      screen.getByRole("img", {
        name: "Copies by sleeve: 10 poly / rice paper / poly; 402 unknown",
      }),
    ).toBeTruthy();
    expect(container.querySelectorAll("[data-sleeve]")).toHaveLength(2);
    expect(screen.getByText("Poly / rice paper / poly")).toBeTruthy();
    expect(screen.getByText("402")).toBeTruthy();
    expect(screen.getByText("POLY 0 · PAPER 0 · ORIGINAL 0")).toBeTruthy();
    expect(screen.getByText("POLY/RICE/POLY 10 · UNKNOWN 402")).toBeTruthy();
  });

  it("leaves out the zero line when every sleeve is used, and the grid when empty", () => {
    renderWithProviders(
      <ChoresOverview
        progress={{
          ...progressFixture,
          total: 0,
          cleaned: 0,
          stacks_total: 0,
          stacks_done: 0,
          next_stack_no: null,
          by_sleeve_type: { original: 1, paper: 1, "poly-rice-paper-poly": 1, poly: 1, unknown: 1 },
        }}
      />,
    );
    expect(screen.queryByText(/ORIGINAL 0/)).toBeNull();
    expect(screen.queryByRole("img", { name: /copies cleaned/ })).toBeNull();
    expect(screen.getAllByText("NO RECORDS YET")).toHaveLength(2);
  });
});
