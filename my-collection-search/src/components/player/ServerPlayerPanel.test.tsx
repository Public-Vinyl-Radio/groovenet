// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { player, device } from "@/test/serverPlayerFixtures";
import { usePlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { playerApi } from "@/services/internalApi/players";
import { toaster } from "@/components/ui/toaster";
import { ServerPlayerPanel } from "./ServerPlayerPanel";
let target: ReturnType<typeof usePlaybackTarget>;
const acknowledge = vi.fn();
const command = vi.fn(); const refresh = vi.fn(); const cancel = vi.fn();
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: vi.fn() } }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({ usePlaybackTarget: () => target }));
vi.mock("@/services/internalApi/players", () => ({ playerApi: { get: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks(); command.mockResolvedValue(player()); vi.mocked(playerApi.get).mockResolvedValue(player("aswitch", 8));
  target = { target: "lounge", remote: { player: player(), devices: [device], connected: true, busy: false, problem: null, acknowledgement: null }, controller: { command, acknowledge, refresh, dismissAcknowledgement: cancel, getSnapshot: () => target.remote } } as unknown as ReturnType<typeof usePlaybackTarget>;
});
describe("server player controls", () => {
  it("renders identity, current status, independent queue, desired output and actual assignment", () => {
    renderWithProviders(<ServerPlayerPanel />);
    expect(screen.getByText("Server: Lounge · paused")).toBeTruthy(); expect(screen.getByText("12 / 100 seconds")).toBeTruthy();
    expect(screen.getByText("Desired output: speaker")).toBeTruthy(); expect(screen.getByText("Actual assignment: None")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove queue entry 2" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Move queue entry 1 up" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("sends transport, seek, volume, UUID queue edits and output selection only on user actions", async () => {
    const { user } = renderWithProviders(<ServerPlayerPanel />);
    for (const name of ["Previous", "Play", "Pause", "Stop", "Next", "Clear server queue"]) await user.click(screen.getByRole("button", { name }));
    fireEvent.change(screen.getByLabelText("Seek to seconds"), { target: { value: "40" } }); await user.click(screen.getByRole("button", { name: "Seek" }));
    fireEvent.change(screen.getByLabelText("Requested sender volume (%)"), { target: { value: "65" } }); await user.click(screen.getByRole("button", { name: "Set volume" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Output" }), "speaker"); await user.click(screen.getByRole("button", { name: "Remember desired output" }));
    await user.click(screen.getByRole("button", { name: "Play queue entry 2" })); await user.click(screen.getByRole("button", { name: "Move queue entry 2 up" })); await user.click(screen.getByRole("button", { name: "Move queue entry 1 down" })); await user.click(screen.getByRole("button", { name: "Remove queue entry 2" }));
    await user.click(screen.getByRole("button", { name: "Refresh state and outputs" })); expect(refresh).toHaveBeenCalledTimes(1);
    expect(command.mock.calls.map(call => call[0].type)).toEqual(["previous", "resume", "pause", "stop", "next", "queue.clear", "seek", "volume", "output.select", "play", "queue.move", "queue.move", "queue.remove"]);
    expect(command.mock.calls[6]![0]).toEqual({ type: "seek", seconds: 40 }); expect(command.mock.calls[7]![0]).toEqual({ type: "volume", volume: 65 });
    expect(command.mock.calls[9]![0].entry_id).toBe(player().state.queue[1]!.id);
  });
  it.each(["AVAILABILITY_UNKNOWN", "SPEAKER_OCCUPIED"])("requires explicit %s acknowledgement", async code => {
    target.remote.acknowledgement = { command: { type: "play" }, code, revision: 3 };
    const { user } = renderWithProviders(<ServerPlayerPanel />);
    expect(command).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: code === "AVAILABILITY_UNKNOWN" ? "Acknowledge unknown activity and continue" : "Take over occupied output" }));
    expect(acknowledge).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" })); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it.each(["unknown", "occupied", "idle"] as const)("reviews a claimed output and requires deliberate transfer/availability actions (%s)", async availability => {
    target.remote.devices = [{ ...device, assigned_player_id: "aswitch", observed: { ...device.observed, availability } }];
    const { user } = renderWithProviders(<ServerPlayerPanel />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Output" }), "speaker"); await user.click(screen.getByRole("button", { name: "Review transfer from aswitch" }));
    await screen.findByRole("button", { name: "Confirm transfer without playback" }); expect(command).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText("Start destination playback as part of this transfer"));
    const confirm = screen.getByRole("button", { name: "Confirm transfer and play" }) as HTMLButtonElement;
    if (availability !== "idle") {
      expect(confirm.disabled).toBe(true);
      await user.click(screen.getByRole("checkbox", { name: availability === "unknown" ? /I acknowledge unknown/ : /Take over occupied/ }));
    }
    await user.click(confirm);
    expect(command).toHaveBeenCalledWith({ type: "output.transfer", from_player_id: "aswitch", from_revision: 8, output_id: "speaker", play: true, allow_unknown: availability === "unknown", takeover: availability === "occupied" });
  });
  it("can transfer without playing, cancel review, change output and expose source lookup failures", async () => {
    target.remote.devices = [{ ...device, assigned_player_id: "aswitch" }];
    const { user } = renderWithProviders(<ServerPlayerPanel />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Output" }), "speaker");
    const review = screen.getByRole("button", { name: "Review transfer from aswitch" }); await user.click(review);
    await user.click(await screen.findByRole("button", { name: "Cancel transfer" })); expect(command).not.toHaveBeenCalled();
    await user.click(review); await user.click(await screen.findByRole("button", { name: "Confirm transfer without playback" }));
    expect(command.mock.lastCall?.[0]).toMatchObject({ play: false });
    vi.mocked(playerApi.get).mockRejectedValueOnce(new Error("unavailable")); await user.click(review);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Unable to read the source player. Refresh outputs and try again.");
    await user.selectOptions(screen.getByRole("combobox", { name: "Output" }), ""); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("disables disconnected operations and displays stopped checkpoints, partial transfer errors and persistent failures", () => {
    const p = player(); p.state.current_entry_id = null; p.state.duration = null; p.state.checkpoint = true; p.state.error = { code: "FAILED", message: "Receiver lost" };
    target.remote = { ...target.remote, player: p, connected: false, problem: "Transfer partially completed" };
    const { rerender } = renderWithProviders(<ServerPlayerPanel />);
    expect(screen.getByText("No current track")).toBeTruthy(); expect(screen.getByText(/Saved checkpoint/)).toBeTruthy(); expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
    target.remote = { ...target.remote, player: null }; rerender(<ServerPlayerPanel />); expect(screen.getByText(/Server: lounge/)).toBeTruthy();
  });
});

it("starts a stopped checkpoint explicitly", async () => {
  target.remote.player!.state.status = "stopped";
  const { user } = renderWithProviders(<ServerPlayerPanel />);
  await user.click(screen.getByRole("button", { name: "Play" })); expect(command).toHaveBeenCalledWith({ type: "play" });
});

describe("server queue Clear and Undo", () => {
  it.each(["playing", "paused"] as const)("restores identical entry IDs and saved position after clearing %s audio", async status => {
    const before = player(); before.state.status = status;
    target.remote.player = before;
    const cleared = player("lounge", 4); cleared.state.queue = []; cleared.state.current_entry_id = null; cleared.state.position = 0; cleared.state.status = "stopped";
    command.mockResolvedValueOnce(cleared);
    const { user } = renderWithProviders(<ServerPlayerPanel />);
    await user.click(screen.getByRole("button", { name: "Clear server queue" }));
    expect(command).toHaveBeenCalledExactlyOnceWith({ type: "queue.clear" });
    const toast = vi.mocked(toaster.create).mock.calls[0]![0];
    expect(toast.title).toBe("Queue cleared"); expect(toast.action?.label).toBe("Undo");
    target.remote.player = cleared;
    toast.action!.onClick();
    expect(command).toHaveBeenLastCalledWith({ type: "queue.replace", entries: before.state.queue.map(({ id, track_id, friend_id }) => ({ id, track_id, friend_id })), current_entry_id: before.state.current_entry_id, position: 12, play: status === "playing" });
  });
  it("does not offer Undo after a failed clear", async () => {
    command.mockResolvedValueOnce(null);
    const { user } = renderWithProviders(<ServerPlayerPanel />);
    await user.click(screen.getByRole("button", { name: "Clear server queue" }));
    expect(toaster.create).not.toHaveBeenCalled();
  });
  it("does not overwrite server changes made after Clear", async () => {
    command.mockResolvedValueOnce(player("lounge", 4));
    const { user } = renderWithProviders(<ServerPlayerPanel />);
    await user.click(screen.getByRole("button", { name: "Clear server queue" }));
    const toast = vi.mocked(toaster.create).mock.calls[0]![0];
    target.remote.player = player("lounge", 5);
    toast.action!.onClick();
    expect(command).toHaveBeenCalledTimes(1);
    expect(toaster.create).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Queue changed since it was cleared" }));
  });
});

it("does not clear without an available controller", async () => {
  target.controller = null;
  const { user } = renderWithProviders(<ServerPlayerPanel />);
  await user.click(screen.getByRole("button", { name: "Clear server queue" }));
  expect(command).not.toHaveBeenCalled(); expect(toaster.create).not.toHaveBeenCalled();
});
