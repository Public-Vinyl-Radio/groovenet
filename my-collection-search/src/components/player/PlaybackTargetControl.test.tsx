// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";
import { renderWithProviders } from "@/test/renderWithProviders";
import { player } from "@/test/serverPlayerFixtures";
import { usePlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { PlaybackTargetControl, usePlaybackTargetLabel } from "./PlaybackTargetControl";
let target: ReturnType<typeof usePlaybackTarget>;
const unlock = vi.fn(); const lock = vi.fn(); const select = vi.fn(); const load = vi.fn();
vi.mock("@/providers/PlaybackTargetProvider", () => ({ usePlaybackTarget: () => target, useOptionalPlaybackTarget: () => target }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));
vi.mock("./ServerPlayerPanel", () => ({ ServerPlayerPanel: () => <div>Remote controls</div> }));
beforeEach(() => {
  vi.clearAllMocks(); usePlaybackTargetDialog.setState({ open: true }); unlock.mockResolvedValue(undefined);
  target = { target: "", authorized: false, players: [], remote: { player: null, problem: null }, problem: null, unlock, lock, select, loadPlayers: load } as unknown as ReturnType<typeof usePlaybackTarget>;
});
describe("playback target selector", () => {
  it("keeps local identity clear and unlocks with a cleared password field", async () => {
    const { user } = renderWithProviders(<PlaybackTargetControl />);
    const input = await screen.findByLabelText("Household web passphrase");
    await user.type(input, "web-passphrase"); await user.click(screen.getByRole("button", { name: "Unlock server players" }));
    expect(unlock).toHaveBeenCalledWith("web-passphrase"); expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/Local audio plays in this browser/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close playback panel" }));
  });
  it("lists configured players, refreshes, locks and changes only the viewed target", async () => {
    target.authorized = true; target.players = [player(), player("aswitch")]; target.target = "lounge";
    const { user } = renderWithProviders(<PlaybackTargetControl />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Control playback on" }), "aswitch"); expect(select).toHaveBeenCalledWith("aswitch");
    await user.click(screen.getByRole("button", { name: "Refresh players" })); expect(load).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Lock browser access" })); expect(lock).toHaveBeenCalled(); expect(screen.getByText("Remote controls")).toBeTruthy();
  });
  it("preserves a removed player selection and surfaces server problems as toasts", async () => {
    target.target = "removed"; target.problem = "Access unavailable"; target.remote.problem = "Connection lost";
    const { rerender } = renderWithProviders(<PlaybackTargetControl />);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Connection lost", type: "error" }));
    expect(await screen.findByRole("option", { name: "Server · removed" })).toBeTruthy(); expect(screen.getByText(/Unlock access to view/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Access unavailable");
    target.remote.problem = null; rerender(<PlaybackTargetControl />);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Access unavailable" }));
    target.problem = null; target.authorized = true; target.remote.player = player(); target.remote.player.state.error = { code: "FAIL", message: "Persistent failure" };
    rerender(<PlaybackTargetControl />); expect(screen.getByText(/No configured players found/)).toBeTruthy();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Persistent failure" }));
  });
  it("stays quiet about problems while the local browser is the target", () => {
    target.problem = "Access unavailable";
    renderWithProviders(<PlaybackTargetControl />);
    expect(toast).not.toHaveBeenCalled();
  });
  it("labels the current target for the nav triggers", () => {
    const Label = () => <span data-testid="label">{usePlaybackTargetLabel()}</span>;
    target.target = "lounge"; target.players = [player()];
    const { rerender } = renderWithProviders(<Label />);
    expect(screen.getByTestId("label").textContent).toBe("Server · Lounge");
    target.target = "gone"; target.players = []; rerender(<Label />);
    expect(screen.getByTestId("label").textContent).toBe("Server · gone");
    target.target = ""; rerender(<Label />);
    expect(screen.getByTestId("label").textContent).toBe("Local browser");
  });
});
