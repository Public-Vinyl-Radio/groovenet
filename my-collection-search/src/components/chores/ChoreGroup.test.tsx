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
    code: "LP-182",
    editHref: "/albums/a/edit?friend_id=7",
    meta: "SPUN 3× IN OCT",
    sleeveUnknown: true,
  },
  {
    key: "b",
    title: "ATF",
    artist: "After The Fire",
    thumbnail: null,
    code: null,
    editHref: "/albums/b/edit?friend_id=7",
    sleeveUnknown: false,
  },
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
    const [firstRow, secondRow] = screen.getAllByRole("listitem");
    expect(within(firstRow).getByText("SPUN 3× IN OCT")).toBeTruthy();
    expect(within(firstRow).getByText("Sleeve unknown")).toBeTruthy();
    expect(within(secondRow).queryByText("Sleeve unknown")).toBeNull();
  });

  it("shows the shelf code, or a No ID link to the album's edit page", () => {
    renderGroup();
    const [firstRow, secondRow] = screen.getAllByRole("listitem");
    expect(within(firstRow).getByText("LP-182")).toBeTruthy();
    expect(within(firstRow).queryByText("No ID")).toBeNull();
    const link = within(secondRow).getByRole("link", { name: /No ID for ATF/ });
    expect(link.getAttribute("href")).toBe("/albums/b/edit?friend_id=7");
    expect(screen.getByRole("checkbox", { name: "No ID, ATF, After The Fire" })).toBeTruthy();
  });

  it("lists by default and has no switch without a view", () => {
    renderGroup();
    expect(screen.queryByRole("radio", { name: "Grid" })).toBeNull();
  });

  it("switches between list and grid, and cards still select", async () => {
    const onChange = vi.fn();
    const { user, onToggle } = renderGroup({ view: { mode: "card", onChange } });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("LP-182")).toBeTruthy();
    expect(screen.getByRole("link", { name: /No ID for ATF/ }).getAttribute("href")).toBe(
      "/albums/b/edit?friend_id=7",
    );
    await user.click(screen.getByRole("checkbox", { name: "LP-182, Innerspeaker, Tame Impala" }));
    expect(onToggle).toHaveBeenCalledWith("a");
    await user.click(screen.getByText("List"));
    expect(onChange).toHaveBeenCalledWith("row");
  });

  it("shows the sleeve chip on a card only when unknown", () => {
    renderGroup({ view: { mode: "card", onChange: vi.fn() } });
    expect(screen.getAllByText("Sleeve unknown")).toHaveLength(1);
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
