// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PageHeader from "./PageHeader";

const action = (label: string, onClick = vi.fn()) => ({ label, icon: <span>i</span>, onClick });

describe("PageHeader", () => {
  it("renders a title only", () => {
    renderWithProviders(<PageHeader title="Albums" />);
    expect(screen.getByRole("heading", { level: 1, name: "Albums" })).toBeTruthy();
    expect(screen.queryByTestId("page-header-count")).toBeNull();
    expect(screen.queryByTestId("page-header-leading")).toBeNull();
    expect(screen.queryByRole("button", { hidden: true })).toBeNull();
  });

  it("shows a numeric count localised, and a string count verbatim", () => {
    const { rerender } = renderWithProviders(<PageHeader title="Tracks" count={1234} />);
    expect(screen.getByTestId("page-header-count").textContent).toBe((1234).toLocaleString());
    rerender(<PageHeader title="Tracks" count="12 of 40" />);
    expect(screen.getByTestId("page-header-count").textContent).toBe("12 of 40");
  });

  it("renders leading content", () => {
    renderWithProviders(<PageHeader title="Track" leading={<button>Back to Tracks</button>} />);
    expect(screen.getByRole("button", { name: "Back to Tracks" })).toBeTruthy();
  });

  it("renders one and two actions as labelled buttons that fire", () => {
    const onClick = vi.fn();
    renderWithProviders(
      <PageHeader title="Albums" actions={[action("Sort", onClick), action("Search")]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort", hidden: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Search", hidden: true })).toBeTruthy();
  });

  it("drops a third action rather than crowding the bar", () => {
    renderWithProviders(
      <PageHeader title="Albums" actions={[action("A"), action("B"), action("C")]} />,
    );
    expect(screen.queryByRole("button", { name: "C", hidden: true })).toBeNull();
  });

  it("opens an overflow menu and runs the chosen item", async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <PageHeader title="Genres" overflow={[{ label: "Show empty genres", onClick }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "More actions", hidden: true }));
    fireEvent.click(await screen.findByText("Show empty genres"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("flags <html> while mounted so the shell drops its legacy padding", () => {
    const { unmount } = renderWithProviders(<PageHeader title="Chores" />);
    expect(document.documentElement.hasAttribute("data-page-header")).toBe(true);
    unmount();
    expect(document.documentElement.hasAttribute("data-page-header")).toBe(false);
  });
});
