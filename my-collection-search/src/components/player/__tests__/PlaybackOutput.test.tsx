// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";

const label = vi.hoisted(() => ({ value: "Local browser" as string | null }));
vi.mock("@/components/player/PlaybackTargetControl", () => ({ usePlaybackTargetLabel: () => label.value }));

import { OutputButton, PlayOnRow } from "@/components/player/PlaybackOutput";

describe("playback output entry points", () => {
  beforeEach(() => {
    label.value = "Local browser";
    usePlaybackTargetDialog.setState({ open: false });
  });

  it.each([
    ["PLAY ON row", PlayOnRow],
    ["output button", OutputButton],
  ])("the %s labels the current target and opens the playback-target dialog", async (_name, Component) => {
    const { user } = renderWithProviders(<Component />);
    const trigger = screen.getByRole("button", { name: "Play on: Local browser" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.getByText("Local browser")).toBeTruthy();
    await user.click(trigger);
    expect(usePlaybackTargetDialog.getState().open).toBe(true);
  });

  it("hides without a playback-target provider", () => {
    label.value = null;
    renderWithProviders(
      <>
        <PlayOnRow />
        <OutputButton />
      </>
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
