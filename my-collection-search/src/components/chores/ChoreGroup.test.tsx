// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import ChoreGroup, { type ChoreRowData } from "./ChoreGroup";

const rows: ChoreRowData[] = [
  {
    key: "a",
    title: "Innerspeaker",
    artist: "Tame Impala",
    thumbnail: null,
    meta: "SPUN 3× IN OCT",
    sleeveUnknown: true,
  },
  { key: "b", title: "ATF", artist: "After The Fire", thumbnail: null, sleeveUnknown: false },
];

function renderGroup(props: Partial<React.ComponentProps<typeof ChoreGroup>> = {}) {
  const onToggle = vi.fn();
  const onToggleSection = vi.fn();
  const view = renderWithProviders(
    <ChoreGroup
      id="g"
      title="SPUN RECENTLY · NEVER CLEANED"
      reason="Played records wear first."
      rows={rows}
      selected={new Set()}
      onToggle={onToggle}
      onToggleSection={onToggleSection}
      {...props}
    />,
  );
  return { ...view, onToggle, onToggleSection };
}

describe("ChoreGroup", () => {
  it("renders rows as checkboxes with meta and the unknown-sleeve chip", () => {
    renderGroup({ selected: new Set(["a"]) });

    expect(screen.getByRole("article", { name: "SPUN RECENTLY · NEVER CLEANED" })).toBeTruthy();
    expect(screen.getByText("Played records wear first.")).toBeTruthy();
    const [first, second] = screen.getAllByRole("checkbox");
    expect(first.getAttribute("aria-checked")).toBe("true");
    expect(second.getAttribute("aria-checked")).toBe("false");
    expect(within(first).getByText("SPUN 3× IN OCT")).toBeTruthy();
    expect(within(first).getByText("SLEEVE ?")).toBeTruthy();
    expect(within(first).getByText("Sleeve unknown")).toBeTruthy();
    expect(within(second).queryByText("SLEEVE ?")).toBeNull();
  });

  it("toggles a row", async () => {
    const { user, onToggle } = renderGroup();
    await user.click(screen.getByRole("checkbox", { name: /ATF/ }));
    expect(onToggle).toHaveBeenCalledWith("b");
  });

  it("selects the whole section", async () => {
    const { user, onToggleSection } = renderGroup({ selected: new Set(["a"]) });
    await user.click(screen.getByRole("button", { name: "SELECT SECTION" }));
    expect(onToggleSection).toHaveBeenCalledWith(["a", "b"], true);
  });

  it("clears the section once every row is selected", async () => {
    const { user, onToggleSection } = renderGroup({ selected: new Set(["a", "b"]) });
    await user.click(screen.getByRole("button", { name: "CLEAR SECTION" }));
    expect(onToggleSection).toHaveBeenCalledWith(["a", "b"], false);
  });

  it("renders nothing when empty", () => {
    const { container } = renderGroup({ rows: [] });
    expect(container.querySelector("article")).toBeNull();
  });

  it("pages with the more button", async () => {
    const onClick = vi.fn();
    const { user } = renderGroup({ more: { label: "380 MORE IN THE BACKLOG", onClick } });
    await user.click(screen.getByRole("button", { name: /380 MORE IN THE BACKLOG/ }));
    expect(onClick).toHaveBeenCalled();
  });

  it("disables more while the next page loads", () => {
    renderGroup({ more: { label: "380 MORE IN THE BACKLOG", onClick: vi.fn(), loading: true } });
    expect(screen.getByRole("button", { name: /380 MORE IN THE BACKLOG/ })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
