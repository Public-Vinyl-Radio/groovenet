// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

import FilterSheet, { FilterSheetSection } from "./FilterSheet";

const sheet = (props: Partial<React.ComponentProps<typeof FilterSheet>> = {}) => (
  <FilterSheet count={0} {...props}>
    <FilterSheetSection title="Missing">
      <p>checks</p>
    </FilterSheetSection>
  </FilterSheet>
);

describe("FilterSheet (#447)", () => {
  it("mounts its controls only once opened, under their section titles", async () => {
    const { user } = renderWithProviders(sheet());
    expect(screen.queryByText("checks")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Filters" }));

    expect(await screen.findByRole("dialog", { name: "Filters" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Missing" })).toBeTruthy();
    expect(screen.getByText("checks")).toBeTruthy();
  });

  it("shows the count, and offers Clear all only when given it", async () => {
    const onClearAll = vi.fn();
    const { user, rerender } = renderWithProviders(sheet({ count: 2, onClearAll }));

    await user.click(screen.getByRole("button", { name: "Filters, 2 on" }));
    await user.click(await screen.findByRole("button", { name: "Clear all" }));
    expect(onClearAll).toHaveBeenCalledOnce();

    rerender(sheet());
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("closes on Done", async () => {
    const { user } = renderWithProviders(sheet());
    await user.click(screen.getByRole("button", { name: "Filters" }));

    await user.click(await screen.findByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByText("checks")).toBeNull());
  });
});
