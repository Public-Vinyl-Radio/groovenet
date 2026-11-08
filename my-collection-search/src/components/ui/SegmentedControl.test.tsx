// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Tabs } from "@chakra-ui/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { SegmentedControl } from "./SegmentedControl";

const items = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

describe("SegmentedControl", () => {
  it("toggles buttons, marking the selected one pressed", async () => {
    const onValueChange = vi.fn();
    const { user } = renderWithProviders(
      <SegmentedControl
        framed
        aria-label="Pick"
        items={items}
        value="b"
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Pick" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Beta" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Alpha" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Gamma" }));
    expect(onValueChange).toHaveBeenCalledWith("c");
  });

  it("joins the segments with single rules, no outline of their own", () => {
    renderWithProviders(
      <SegmentedControl aria-label="Pick" items={items} value="a" onValueChange={() => {}} />,
    );
    const [first, second] = ["Alpha", "Beta"].map((name) =>
      getComputedStyle(screen.getByRole("button", { name })),
    );
    expect(first.borderInlineStartWidth).toBe("0px");
    expect(second.borderInlineStartWidth).toBe("var(--chakra-border-widths-rule)");
    expect(second.borderRadius).toBe("0px");
  });

  it("is a tablist that selects inside Tabs.Root", async () => {
    const { user } = renderWithProviders(
      <Tabs.Root defaultValue="a" activationMode="automatic">
        <SegmentedControl tabs aria-label="Pick" items={items} />
      </Tabs.Root>,
    );
    expect(screen.getByRole("tablist", { name: "Pick" })).toBeTruthy();
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    expect(alpha.getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("tab", { name: "Beta" }));
    expect(screen.getByRole("tab", { name: "Beta" }).getAttribute("aria-selected")).toBe("true");
  });
});
