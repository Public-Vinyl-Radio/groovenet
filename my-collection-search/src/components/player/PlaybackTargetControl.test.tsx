// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { player } from "@/test/serverPlayerFixtures";
import { usePlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { PlaybackTargetControl } from "./PlaybackTargetControl";
let target: ReturnType<typeof usePlaybackTarget>;
const unlock = vi.fn(); const lock = vi.fn(); const select = vi.fn(); const load = vi.fn();
vi.mock("@/providers/PlaybackTargetProvider", () => ({ usePlaybackTarget: () => target }));
vi.mock("./ServerPlayerPanel", () => ({ ServerPlayerPanel: () => <div>Remote controls</div> }));
beforeEach(() => {
  vi.clearAllMocks(); unlock.mockResolvedValue(undefined);
  target = { target: "", authorized: false, players: [], remote: { player: null, problem: null }, problem: null, unlock, lock, select, loadPlayers: load } as unknown as ReturnType<typeof usePlaybackTarget>;
});
describe("playback target selector", () => {
  it("keeps local identity clear and unlocks with a cleared password field", async () => {
    const { user } = renderWithProviders(<PlaybackTargetControl />);
    await user.click(screen.getByRole("button", { name: "Playback: Local browser" }));
    const input = await screen.findByLabelText("Household web passphrase");
    await user.type(input, "web-passphrase"); await user.click(screen.getByRole("button", { name: "Unlock server players" }));
    expect(unlock).toHaveBeenCalledWith("web-passphrase"); expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/Local audio plays in this browser/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close playback panel" }));
  });
  it("lists configured players, refreshes, locks and changes only the viewed target", async () => {
    target.authorized = true; target.players = [player(), player("aswitch")]; target.target = "lounge";
    const { user } = renderWithProviders(<PlaybackTargetControl />);
    await user.click(screen.getByRole("button", { name: "Playback: Server · Lounge" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Control playback on" }), "aswitch"); expect(select).toHaveBeenCalledWith("aswitch");
    await user.click(screen.getByRole("button", { name: "Refresh players" })); expect(load).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Lock browser access" })); expect(lock).toHaveBeenCalled(); expect(screen.getByText("Remote controls")).toBeTruthy();
  });
  it("preserves a locked or removed player selection and keeps errors visible while browsing", async () => {
    target.target = "removed"; target.problem = "Access unavailable"; target.remote.problem = "Connection lost";
    const { user, rerender } = renderWithProviders(<PlaybackTargetControl />);
    expect(screen.getByRole("alert").textContent).toBe("Connection lost");
    await user.click(screen.getByRole("button", { name: "Playback: Server · removed" }));
    expect(await screen.findByRole("option", { name: "Server · removed" })).toBeTruthy(); expect(screen.getByText(/Unlock access to view/)).toBeTruthy(); expect(screen.getAllByRole("alert", { hidden: true })).toHaveLength(2);
    target.remote.problem = null; rerender(<PlaybackTargetControl />); expect(screen.getAllByText("Access unavailable")).toHaveLength(2);
    target.problem = null; target.authorized = true; target.remote.player = player(); target.remote.player.state.error = { code: "FAIL", message: "Persistent failure" };
    rerender(<PlaybackTargetControl />); expect(screen.getByText(/No configured players found/)).toBeTruthy(); expect(screen.getByText("Persistent failure")).toBeTruthy();
  });
});
