// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { TRACK_MISSING_OPTIONS } from "@/lib/trackFilters";

import MissingFilter, { MissingChecklist } from "./MissingFilter";

const open = async (user: ReturnType<typeof renderWithProviders>["user"]) =>
  user.click(screen.getByRole("button", { name: /Missing data filters/ }));

describe("MissingFilter (#447)", () => {
  it("lists every check, ticking the ones that are on, and counts them", async () => {
    const { user } = renderWithProviders(
      <MissingFilter
        options={TRACK_MISSING_OPTIONS}
        active={{ missingAudio: true, missingYouTube: true }}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Missing data filters, 2 on" })).toBeTruthy();

    await open(user);
    const items = await screen.findAllByRole("menuitemcheckbox");
    expect(items.map((item) => item.textContent)).toEqual([
      "Audio",
      "Metadata (BPM/key)",
      "Any streaming URL",
      "Apple Music",
      "YouTube",
      "SoundCloud",
    ]);
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "true", "false", "false", "false", "true", "false",
    ]);
  });

  it("hands back the key of a clicked check and stays open for another", async () => {
    const onToggle = vi.fn();
    const { user } = renderWithProviders(
      <MissingFilter options={TRACK_MISSING_OPTIONS} active={{}} onToggle={onToggle} />
    );
    expect(screen.getByRole("button", { name: "Missing data filters" })).toBeTruthy();

    await open(user);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "YouTube" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Audio" }));

    expect(onToggle.mock.calls).toEqual([["missingYouTube"], ["missingAudio"]]);
  });

  it("disables the single services while any streaming URL is on", async () => {
    const onToggle = vi.fn();
    const { user } = renderWithProviders(
      <MissingFilter
        options={TRACK_MISSING_OPTIONS}
        active={{ missingAnyStreamingUrl: true }}
        onToggle={onToggle}
      />
    );

    await open(user);
    const disabled = (await screen.findAllByRole("menuitemcheckbox"))
      .filter((item) => item.getAttribute("aria-disabled") === "true")
      .map((item) => item.textContent);
    expect(disabled).toEqual(["Apple Music", "YouTube", "SoundCloud"]);

    await user.click(screen.getByRole("menuitemcheckbox", { name: "YouTube" }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("MissingChecklist (#447)", () => {
  it("shows the same checks as checkboxes, with the single services off under any streaming URL", async () => {
    const onToggle = vi.fn();
    const { user } = renderWithProviders(
      <MissingChecklist
        options={TRACK_MISSING_OPTIONS}
        active={{ missingAudio: true, missingAnyStreamingUrl: true }}
        onToggle={onToggle}
      />
    );
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([true, false, true, false, false, false]);
    expect(boxes.map((box) => box.disabled)).toEqual([false, false, false, true, true, true]);

    await user.click(screen.getByText("Metadata (BPM/key)"));
    expect(onToggle).toHaveBeenCalledWith("missingMetadata");
  });
});
