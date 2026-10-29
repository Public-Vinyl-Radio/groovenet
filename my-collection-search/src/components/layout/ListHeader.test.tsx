// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import {
  FiltersButton,
  HeaderButton,
  ListSearchRow,
  SearchField,
  ViewModeSwitch,
} from "./ListHeader";

describe("ListHeader (#794)", () => {
  it("labels FILTERS with the count, solid only while a filter is on", () => {
    const { rerender } = renderWithProviders(<FiltersButton activeCount={0} />);
    const off = screen.getByRole("button", { name: "Filters" });
    expect(off.className).not.toMatch(/solid/);

    rerender(<FiltersButton activeCount={4} />);
    expect(screen.getByRole("button", { name: "Filters · 4" })).toBeTruthy();
  });

  it("renders a labelled header button that fires", async () => {
    const onClick = vi.fn();
    const { user } = renderWithProviders(
      <HeaderButton quiet onClick={onClick}>
        Select
      </HeaderButton>,
    );
    await user.click(screen.getByRole("button", { name: "Select" }));
    expect(onClick).toHaveBeenCalled();
  });

  it("switches between LIST and GRID as a labelled radio group", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(<ViewModeSwitch value="row" onChange={onChange} />);

    const group = screen.getByRole("radiogroup", { name: "View" });
    expect(within(group).getByRole("radio", { name: "List" })).toHaveProperty("checked", true);
    await user.click(within(group).getByText("Grid"));
    expect(onChange).toHaveBeenCalledWith("card");
  });

  it("types into the search field, submits on Enter and carries an end control", async () => {
    const onChange = vi.fn();
    const onEnter = vi.fn();
    const { user } = renderWithProviders(
      <SearchField
        value=""
        onChange={onChange}
        onEnter={onEnter}
        label="Search tracks"
        placeholder="Search"
        endElement={<button>Semantic</button>}
      />,
    );

    const input = screen.getByRole("searchbox", { name: "Search tracks" });
    await user.type(input, "a");
    expect(onChange).toHaveBeenCalledWith("a");
    await user.type(input, "{Enter}");
    expect(onEnter).toHaveBeenCalled();
    expect(
      within(screen.getByTestId("search-field")).getByRole("button", {
        name: "Semantic",
        hidden: true,
      }),
    ).toBeTruthy();
  });

  it("submits nothing on Enter without a handler", async () => {
    const { user } = renderWithProviders(
      <SearchField value="" onChange={vi.fn()} label="Search albums" />,
    );
    await user.type(screen.getByRole("searchbox", { name: "Search albums" }), "{Enter}");
    expect(screen.getByTestId("search-field").children).toHaveLength(1);
  });

  it("keeps the search row's controls to desktop", () => {
    const { rerender } = renderWithProviders(
      <ListSearchRow field={<input aria-label="q" />} controls={<button>Filters</button>} />,
    );
    const controls = screen.getByRole("button", { name: "Filters", hidden: true })
      .parentElement as HTMLElement;
    expect(getComputedStyle(controls).display).toBe("none");

    rerender(<ListSearchRow field={<input aria-label="q" />} />);
    expect(screen.queryByRole("button", { hidden: true })).toBeNull();
  });
});
