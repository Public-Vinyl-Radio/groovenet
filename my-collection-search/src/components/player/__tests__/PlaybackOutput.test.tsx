// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";
import { player } from "@/test/serverPlayerFixtures";

type Target = { target: string; airPlayActive: boolean; remote: { player: ReturnType<typeof player> | null }; players: ReturnType<typeof player>[] };
const state = vi.hoisted(() => ({ target: null as Target | null }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({ useOptionalPlaybackTarget: () => state.target }));
vi.mock("@/lib/deviceLabel", () => ({ useDeviceLabel: () => "This Mac" }));

import { OutputButton, OutputTag, PlayOnRow, usePlaybackTargetLabel } from "@/components/player/PlaybackOutput";

const local = (airPlayActive = false): Target => ({ target: "", airPlayActive, remote: { player: null }, players: [] });
const server = (connected = true): Target => ({ target: "lounge", airPlayActive: false, remote: { player: connected ? player() : null }, players: connected ? [] : [player()] });

describe("playback output entry points", () => {
  beforeEach(() => {
    state.target = local();
    usePlaybackTargetDialog.setState({ open: false });
  });

  it.each([
    ["PLAY ON row", PlayOnRow],
    ["output button", OutputButton],
  ])("the %s names this device and opens the Play on picker", async (_name, Component) => {
    const { user } = renderWithProviders(<Component />);
    const trigger = screen.getByRole("button", { name: "Play on: This Mac" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    await user.click(trigger);
    expect(usePlaybackTargetDialog.getState().open).toBe(true);
  });

  it.each([true, false])("names the server, from its snapshot or the list (connected: %s)", (connected) => {
    state.target = server(connected);
    renderWithProviders(<OutputButton />);
    expect(screen.getByRole("button", { name: "Play on: Lounge" })).toBeTruthy();
  });

  it("falls back to the player ID before anything has loaded", () => {
    state.target = { ...server(), remote: { player: null } };
    expect(renderHook(usePlaybackTargetLabel).result.current).toBe("lounge");
  });

  it("tags the mini player ON <SERVER> or AIRPLAY, and nothing on this device", () => {
    const { rerender } = renderWithProviders(<OutputTag />);
    expect(screen.queryByTestId("output-tag")).toBeNull();
    state.target = local(true);
    rerender(<OutputTag />);
    expect(screen.getByTestId("output-tag").textContent).toBe("AIRPLAY");
    state.target = server();
    rerender(<OutputTag />);
    expect(screen.getByTestId("output-tag").textContent).toBe("ON LOUNGE");
  });

  it("hides without a playback-target provider", () => {
    state.target = null;
    renderWithProviders(
      <>
        <PlayOnRow />
        <OutputButton />
        <OutputTag />
      </>
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(renderHook(usePlaybackTargetLabel).result.current).toBeNull();
  });
});
