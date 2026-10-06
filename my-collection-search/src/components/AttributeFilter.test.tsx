// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { TrackAttributeFilters } from "@/lib/trackFilters";

import AttributeFilter from "./AttributeFilter";

/**
 * Open the popover, and wait for it to take focus: it does so a tick later,
 * which would otherwise pull focus out of a box mid-type.
 */
async function openPopover(user: ReturnType<typeof renderWithProviders>["user"]) {
  await user.click(screen.getByRole("button", { name: /BPM, key and rating/ }));
  await waitFor(() => expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true));
}

function setup(value: TrackAttributeFilters = {}) {
  const onChange = vi.fn();
  const view = renderWithProviders(<AttributeFilter value={value} onChange={onChange} />);
  const open = () => openPopover(view.user);
  return { ...view, onChange, open };
}

describe("AttributeFilter (#447)", () => {
  it("counts the filters that are on", () => {
    setup({ bpm_min: 120, bpm_max: 126, key: "A minor" });
    expect(screen.getByRole("button", { name: "BPM, key and rating filters, 2 on" })).toBeTruthy();
  });

  it("applies the BPM range on Enter, not while typing", async () => {
    const { user, onChange, open } = setup({ key: "A minor", bpm_min: 120 });
    await open();

    await user.type(await screen.findByLabelText("Maximum BPM"), "126");
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ key: "A minor", bpm_min: 120, bpm_max: 126 });
  });

  it("applies the BPM range when a box loses focus, and only if it changed", async () => {
    const { user, onChange, open } = setup({ bpm_min: 100 });
    await open();
    const min = await screen.findByLabelText("Minimum BPM");
    expect((min as HTMLInputElement).value).toBe("100");

    await user.click(min);
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();

    await user.clear(min);
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith({ bpm_min: undefined, bpm_max: undefined });
  });

  it("refuses a min above the max", async () => {
    const { user, onChange, open } = setup();
    await open();

    await user.type(await screen.findByLabelText("Minimum BPM"), "130");
    await user.type(screen.getByLabelText("Maximum BPM"), "120{Enter}");
    expect(screen.getByText("Min must not be above max")).toBeTruthy();
    // Leaving the min box applied it alone; the inverted range never goes out.
    expect(onChange.mock.calls).toEqual([[{ bpm_min: 130, bpm_max: undefined }]]);
  });

  it("follows the range when it's cleared from outside", async () => {
    const onChange = vi.fn();
    const { user, rerender } = renderWithProviders(
      <AttributeFilter value={{ bpm_min: 120, bpm_max: 126 }} onChange={onChange} />
    );
    await openPopover(user);
    rerender(<AttributeFilter value={{}} onChange={onChange} />);

    expect(((await screen.findByLabelText("Minimum BPM")) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Maximum BPM") as HTMLInputElement).value).toBe("");
  });

  it("sets and clears the key", async () => {
    const { user, onChange, open, rerender } = setup();
    await open();

    await user.selectOptions(await screen.findByLabelText("Key"), "F# minor");
    expect(onChange).toHaveBeenLastCalledWith({ key: "F# minor" });

    rerender(<AttributeFilter value={{ key: "F# minor" }} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("Key"), "Any key");
    expect(onChange).toHaveBeenLastCalledWith({ key: undefined });
  });

  it("sets a minimum rating, and clears it on the same star", async () => {
    const { user, onChange, open, rerender } = setup();
    await open();

    await user.click(await screen.findByRole("button", { name: "4 stars and up" }));
    expect(onChange).toHaveBeenLastCalledWith({ star_rating: 4 });

    rerender(<AttributeFilter value={{ star_rating: 4 }} onChange={onChange} />);
    const four = screen.getByRole("button", { name: "4 stars and up" });
    expect(four.getAttribute("aria-pressed")).toBe("true");
    await user.click(four);
    expect(onChange).toHaveBeenLastCalledWith({ star_rating: undefined });

    await user.click(screen.getByRole("button", { name: "1 star and up" }));
    expect(onChange).toHaveBeenLastCalledWith({ star_rating: 1 });
  });
});
