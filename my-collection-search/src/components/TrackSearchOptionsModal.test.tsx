// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree: vi.fn().mockResolvedValue([]) }));

import TrackSearchOptionsModal from "./TrackSearchOptionsModal";
import { createEmptyFilters } from "@/lib/trackFilters";

function setup(props: Partial<React.ComponentProps<typeof TrackSearchOptionsModal>> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onModeChange: vi.fn(),
    onAddGenre: vi.fn(),
    onRemoveGenre: vi.fn(),
    onIncludeSimilarChange: vi.fn(),
    onAttributesChange: vi.fn(),
    onToggleMissing: vi.fn(),
    onReset: vi.fn(),
  };
  const view = renderWithProviders(
    <TrackSearchOptionsModal
      open
      mode="lexical"
      genres={[]}
      includeSimilar={false}
      attributes={{}}
      missing={createEmptyFilters()}
      activeCount={0}
      resultCount={1234}
      {...handlers}
      {...props}
    />,
  );
  return { ...view, ...handlers };
}

describe("TrackSearchOptionsModal (#751)", () => {
  it("shows the result count on the primary button and closes from it", async () => {
    const { user, onOpenChange } = setup();
    await user.click(await screen.findByRole("button", { name: "Show 1,234 results" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("says 'result' for exactly one", async () => {
    setup({ resultCount: 1 });
    expect(await screen.findByRole("button", { name: "Show 1 result" })).toBeTruthy();
  });

  it("disables Reset with nothing active, and resets when something is", async () => {
    const first = setup();
    expect(
      ((await screen.findByRole("button", { name: "Reset" })) as HTMLButtonElement).disabled,
    ).toBe(true);
    first.unmount();

    const { user, onReset } = setup({ activeCount: 2 });
    await user.click(await screen.findByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("changes mode and explains each one in a line", async () => {
    const { user, onModeChange, rerender } = setup();
    expect((await screen.findByTestId("search-mode-hint")).textContent).toMatch(/words you type/);
    await user.click(screen.getByText("Hybrid"));
    expect(onModeChange).toHaveBeenCalledWith("hybrid");

    rerender(
      <TrackSearchOptionsModal
        open
        mode="semantic"
        onOpenChange={vi.fn()}
        onModeChange={onModeChange}
        genres={[]}
        onAddGenre={vi.fn()}
        onRemoveGenre={vi.fn()}
        includeSimilar={false}
        onIncludeSimilarChange={vi.fn()}
        attributes={{}}
        onAttributesChange={vi.fn()}
        missing={createEmptyFilters()}
        onToggleMissing={vi.fn()}
        activeCount={0}
        resultCount={0}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByTestId("search-mode-hint").textContent).toMatch(/not exact words/);
  });

  it("offers the missing checks as pressable chips, with the metadata one short", async () => {
    const { user, onToggleMissing } = setup({
      missing: { ...createEmptyFilters(), missingYouTube: true },
    });
    const group = await screen.findByRole("group", { name: "Only tracks missing" });
    const labels = within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual([
      "Audio",
      "BPM/key",
      "Any streaming URL",
      "Apple Music",
      "YouTube",
      "SoundCloud",
    ]);
    expect(
      within(group).getByRole("button", { name: "YouTube" }).getAttribute("aria-pressed"),
    ).toBe("true");

    await user.click(within(group).getByRole("button", { name: "BPM/key" }));
    expect(onToggleMissing).toHaveBeenCalledWith("missingMetadata");
  });

  it("disables the single services while any streaming URL is on", async () => {
    setup({ missing: { ...createEmptyFilters(), missingAnyStreamingUrl: true } });
    const group = await screen.findByRole("group", { name: "Only tracks missing" });
    expect(
      (within(group).getByRole("button", { name: "Apple Music" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (within(group).getByRole("button", { name: "Audio" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("shows Include similar only once a genre is chosen", async () => {
    const first = setup();
    await screen.findByRole("dialog");
    expect(screen.queryByText("Include similar")).toBeNull();
    first.unmount();

    const { user, onIncludeSimilarChange } = setup({ genres: ["salsa"] });
    await user.click(await screen.findByText("Include similar"));
    expect(onIncludeSimilarChange).toHaveBeenCalledWith(true);
  });

  it("edits key, BPM and rating through the attribute callback", async () => {
    const { user, onAttributesChange } = setup({ attributes: { bpm_min: 120 } });
    await user.selectOptions(await screen.findByLabelText("Key"), "A minor");
    expect(onAttributesChange).toHaveBeenLastCalledWith({ bpm_min: 120, key: "A minor" });

    await user.type(screen.getByLabelText("Maximum BPM"), "126{Enter}");
    expect(onAttributesChange).toHaveBeenLastCalledWith({ bpm_min: 120, bpm_max: 126 });

    await user.click(screen.getByRole("button", { name: "4 stars and up" }));
    expect(onAttributesChange).toHaveBeenLastCalledWith({ bpm_min: 120, star_rating: 4 });
  });
});
