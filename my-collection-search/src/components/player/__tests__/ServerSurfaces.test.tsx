// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { device, player } from "@/test/serverPlayerFixtures";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";
import { playerApi } from "@/services/internalApi/players";

const target = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  useOptionalPlaybackTarget: () => target.value,
  usePlaybackTarget: () => target.value,
}));
vi.mock("@/services/internalApi/players", () => ({ playerApi: { get: vi.fn() } }));

import ServerNotice from "@/components/player/ServerNotice";
import ServerSessionStrip from "@/components/player/ServerSessionStrip";
import SpeakerDetails from "@/components/player/SpeakerDetails";

const controller = {
  acknowledge: vi.fn(),
  dismissAcknowledgement: vi.fn(),
  dismissProblem: vi.fn(),
  command: vi.fn(),
  refresh: vi.fn(),
};
const actions = { playHere: vi.fn(), reportProblem: vi.fn() };
function server(remote: Record<string, unknown> = {}, patch: Record<string, unknown> = {}) {
  target.value = {
    target: "lounge",
    authorized: true,
    problem: null,
    players: [],
    controller,
    ...actions,
    remote: {
      player: player(),
      devices: [],
      connected: true,
      busy: false,
      problem: null,
      acknowledgement: null,
      ...remote,
    },
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usePlaybackTargetDialog.setState({ open: false });
});

describe("ServerNotice", () => {
  it("renders nothing on this device or with nothing to say", () => {
    target.value = { target: "" };
    const { rerender } = renderWithProviders(<ServerNotice />);
    expect(screen.queryByTestId("server-notice")).toBeNull();
    server();
    rerender(<ServerNotice />);
    expect(screen.queryByTestId("server-notice")).toBeNull();
  });

  it.each([
    [
      "AVAILABILITY_UNKNOWN",
      "Speaker status unknown. Playing may interrupt another sender.",
      "Play anyway",
    ],
    ["SPEAKER_OCCUPIED", "Speaker in use by another sender.", "Take over"],
  ])(
    "asks before playing over %s, and never acknowledges on its own",
    async (code, text, action) => {
      server({ acknowledgement: { command: { type: "play" }, code, revision: 3 } });
      const { user } = renderWithProviders(<ServerNotice />);
      const notice = screen.getByRole("alertdialog", { name: "Confirm playback" });
      expect(notice.textContent).toContain(text);
      expect(controller.acknowledge).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: action }));
      expect(controller.acknowledge).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(controller.dismissAcknowledgement).toHaveBeenCalledTimes(1);
    },
  );

  it("offers Unlock while access is locked, naming the server from the list", async () => {
    server({ player: null }, { authorized: false, controller: null, players: [player()] });
    const { user } = renderWithProviders(<ServerNotice />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Unlock server access to control Lounge.",
    );
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(usePlaybackTargetDialog.getState().open).toBe(true);
  });

  it("keeps a playback error the server holds, then shows dismissible request problems", async () => {
    const failed = player();
    failed.state.error = { code: "RECEIVER", message: "Receiver lost" };
    server({ player: failed, problem: "ignored while the error stands" });
    const { user, rerender } = renderWithProviders(<ServerNotice />);
    expect(screen.getByRole("alert").textContent).toContain("Playback error: Receiver lost");
    expect(screen.queryByRole("button")).toBeNull();
    server({ problem: "Connection lost" });
    rerender(<ServerNotice />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(controller.dismissProblem).toHaveBeenCalledTimes(1);
    server({}, { problem: "Unlock server access before trying this action again.", players: [] });
    rerender(<ServerNotice />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(actions.reportProblem).toHaveBeenCalledWith(null);
  });

  it("renders a notice it is handed instead of its own", () => {
    target.value = { target: "" };
    renderWithProviders(<ServerNotice notice={{ tone: "error", text: "Handed in" }} />);
    expect(screen.getByRole("alert").textContent).toBe("Handed in");
  });
});

describe("ServerSessionStrip", () => {
  it("names the server's shared queue and plays here without commands", async () => {
    server({ player: null }, { players: [player()] });
    const { user } = renderWithProviders(<ServerSessionStrip />);
    expect(screen.getByRole("region", { name: "Server session" }).textContent).toContain(
      "SERVER SESSIONLounge · shared queue",
    );
    await user.click(screen.getByRole("button", { name: "Play here" }));
    expect(actions.playHere).toHaveBeenCalledTimes(1);
    expect(controller.command).not.toHaveBeenCalled();
  });

  it("falls back to the player ID before anything has loaded", () => {
    server({ player: null }, { authorized: false, controller: null });
    renderWithProviders(
      <>
        <ServerSessionStrip />
        <ServerNotice />
      </>,
    );
    expect(screen.getByRole("region", { name: "Server session" }).textContent).toContain(
      "lounge · shared queue",
    );
    expect(screen.getByRole("alert").textContent).toContain("control lounge.");
  });

  it("is absent on this device", () => {
    target.value = { target: "" };
    renderWithProviders(<ServerSessionStrip />);
    expect(screen.queryByRole("region", { name: "Server session" })).toBeNull();
  });
});

describe("SpeakerDetails", () => {
  const claimed = { ...device, assigned_player_id: "aswitch" };

  it("shows output routing and remembers a desired output without playing", async () => {
    server({ devices: [device] });
    const onBack = vi.fn();
    const { user } = renderWithProviders(<SpeakerDetails onBack={onBack} />);
    expect(screen.getByText("Desired: speaker")).toBeTruthy();
    expect(screen.getByText("Assigned: None")).toBeTruthy();
    expect(screen.getByText("Speaker · unknown")).toBeTruthy();
    await user.selectOptions(screen.getByRole("combobox", { name: "Output" }), "speaker");
    expect(screen.getByText(/Observed unknown via unconfigured/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remember desired output" }));
    expect(controller.command).toHaveBeenCalledWith({
      type: "output.select",
      output_id: "speaker",
    });
    await user.click(screen.getByRole("button", { name: "Refresh outputs" }));
    expect(controller.refresh).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("reviews a transfer, needing the speaker confirm before it plays", async () => {
    const source = player("aswitch", 6);
    vi.mocked(playerApi.get).mockResolvedValue(source);
    server({ devices: [claimed] });
    const { user } = renderWithProviders(<SpeakerDetails onBack={vi.fn()} />);
    expect(screen.getByText("Speaker · unknown · Claimed by aswitch")).toBeTruthy();
    await user.selectOptions(screen.getByRole("combobox", { name: "Output" }), "speaker");
    await user.click(screen.getByRole("button", { name: "Review transfer from aswitch" }));
    await screen.findByText(/Transfer Speaker from Aswitch to Lounge/);
    await user.click(screen.getByRole("checkbox", { name: /Start playback on Lounge/ }));
    const confirm = screen.getByRole("button", { name: "Confirm transfer and play" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: /play anyway/ }));
    await user.click(confirm);
    expect(controller.command).toHaveBeenCalledWith({
      type: "output.transfer",
      from_player_id: "aswitch",
      from_revision: 6,
      output_id: "speaker",
      play: true,
      allow_unknown: true,
      takeover: false,
    });
    expect(screen.queryByText(/Transfer Speaker from/)).toBeNull();
  });

  it("asks to take over an occupied speaker, cancels, and reports an unreadable source", async () => {
    vi.mocked(playerApi.get)
      .mockResolvedValueOnce(player("aswitch"))
      .mockRejectedValueOnce(new Error("offline"));
    server({
      devices: [{ ...claimed, observed: { ...claimed.observed, availability: "occupied" } }],
    });
    const { user } = renderWithProviders(<SpeakerDetails onBack={vi.fn()} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Output" }), "speaker");
    await user.click(screen.getByRole("button", { name: "Review transfer from aswitch" }));
    await user.click(await screen.findByRole("checkbox", { name: /Start playback/ }));
    await user.click(screen.getByRole("checkbox", { name: /Take over the speaker/ }));
    await user.click(screen.getByRole("button", { name: "Cancel transfer" }));
    expect(controller.command).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Review transfer from aswitch" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Unable to read the source player"),
    );
  });

  it("says when no outputs are reported", () => {
    server({ player: null, devices: [] });
    renderWithProviders(<SpeakerDetails onBack={vi.fn()} />);
    expect(screen.getByText("No outputs reported.")).toBeTruthy();
    expect(screen.getByText("Speaker details · lounge")).toBeTruthy();
  });
});
