// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { ServerPlayer } from "@groovenet/contracts";
import { renderWithProviders } from "@/test/renderWithProviders";
import { player } from "@/test/serverPlayerFixtures";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";
import type { Track } from "@/types/track";

const local = vi.hoisted(() => ({
  playlist: [] as Track[],
  currentTrackIndex: null as number | null,
  finishedTrack: null,
  isAirPlayAvailable: false,
  showAirPlayPicker: vi.fn(),
}));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({ usePlaylistPlayer: () => local }));
vi.mock("@/lib/deviceLabel", () => ({ useDeviceLabel: () => "This iPhone" }));
vi.mock("@/hooks/useServerQueueTracks", () => ({
  useServerQueueTracks: (entries: ServerPlayer["state"]["queue"]) =>
    entries.map((e) => ({
      track_id: e.track_id,
      friend_id: e.friend_id,
      title: e.title,
      artist: e.artist,
    })),
}));
vi.mock("@/components/player/SpeakerDetails", () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <button onClick={onBack}>Speaker details view</button>
  ),
}));
vi.mock("@/components/player/ServerNotice", () => ({ default: () => <p>Server notice</p> }));
const target = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/providers/PlaybackTargetProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/providers/PlaybackTargetProvider")>()),
  usePlaybackTarget: () => target.value,
}));

import PlayOnPicker from "@/components/player/PlayOnPicker";

const api = {
  join: vi.fn(),
  playHere: vi.fn(),
  loadPlayers: vi.fn(async () => {}),
  unlock: vi.fn(async () => {}),
  lock: vi.fn(async () => {}),
};
function idle(): ServerPlayer {
  const p = player("aswitch");
  p.state.status = "stopped";
  p.state.current_entry_id = null;
  p.state.queue = [];
  return p;
}
function live(): ServerPlayer {
  const p = player();
  p.state.status = "playing";
  p.state.position = 36;
  p.state.duration = 242;
  return p;
}
function setTarget(patch: Record<string, unknown> = {}) {
  target.value = {
    target: "",
    authorized: true,
    problem: null,
    players: [live(), idle()],
    remote: { player: null },
    ...api,
    ...patch,
  };
}
const track = (id: string) =>
  ({ track_id: id, friend_id: 1, title: id, artist: "A" }) as unknown as Track;
const open = () => {
  usePlaybackTargetDialog.setState({ open: true });
  return renderWithProviders(<PlayOnPicker />);
};

beforeEach(() => {
  vi.clearAllMocks();
  setTarget();
  local.playlist = [track("played"), track("now"), track("next")];
  local.currentTrackIndex = 1;
  local.isAirPlayAvailable = false;
});

describe("Play on picker", () => {
  it("lists this device and every server, LIVE or IDLE, from the shared live list", async () => {
    open();
    const dialog = await screen.findByRole("dialog", { name: "Choose where audio plays" });
    expect(api.loadPlayers).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("radio", { name: /This iPhone/ })).toHaveProperty(
      "checked",
      true,
    );
    expect(within(dialog).getByText("LIVE")).toBeTruthy();
    expect(within(dialog).getByText("IDLE")).toBeTruthy();
    expect(
      within(dialog).getByText("Playing here never stops a server. It keeps playing its queue."),
    ).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /AirPlay/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("previews a live session and joins it with the queue from the current track on", async () => {
    const { user } = open();
    await user.click(await screen.findByRole("radio", { name: /Lounge/ }));
    const preview = screen.getByRole("region", { name: "Active session on the server" });
    expect(within(preview).getByText("ACTIVE SESSION · LOUNGE")).toBeTruthy();
    expect(within(preview).getByText("Artist · 0:36 / 4:02")).toBeTruthy();
    expect(within(preview).getByText("1 up next")).toBeTruthy();
    expect(
      within(preview).getByText("Your queue (2 tracks) joins the end of this one."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Join Lounge" }));
    expect(api.join).toHaveBeenCalledWith("lounge");
    expect(usePlaybackTargetDialog.getState().open).toBe(false);
  });

  it("says an idle server starts a session with your queue, or just connects without one", async () => {
    const { user } = open();
    await user.click(await screen.findByRole("radio", { name: /Aswitch/ }));
    expect(screen.getByRole("region", { name: "Idle server" }).textContent).toBe(
      "Nothing playing on Aswitch. Joining starts a new session with your queue (2 tracks).",
    );
    local.playlist = [];
    local.currentTrackIndex = null;
    await user.click(screen.getByRole("radio", { name: /Lounge/ }));
    await user.click(screen.getByRole("radio", { name: /Aswitch/ }));
    expect(screen.getByRole("region", { name: "Idle server" }).textContent).toBe(
      "Nothing playing on Aswitch. Join to control its queue from here.",
    );
  });

  it("while on a server: Play here comes back without a command, another server is a switch, Done closes", async () => {
    setTarget({ target: "lounge", remote: { player: live() } });
    const { user } = open();
    expect(await screen.findByText("Connected · shared queue")).toBeTruthy();
    expect(screen.getByText("You're controlling this server's queue.")).toBeTruthy();
    expect(screen.getByText("Server notice")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /Aswitch/ }));
    expect(
      screen.getByText("Nothing playing on Aswitch. Switch to control this server's queue."),
    ).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /This iPhone/ }));
    await user.click(screen.getByRole("button", { name: "Play here" }));
    expect(api.playHere).toHaveBeenCalledTimes(1);
    expect(api.join).not.toHaveBeenCalled();
  });

  it("opens Speaker details for the connected server and comes back", async () => {
    setTarget({ target: "lounge", remote: { player: live() }, players: [] });
    const { user } = open();
    await user.click(await screen.findByRole("button", { name: "Speaker details" }));
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Speaker details view" }));
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(api.join).not.toHaveBeenCalled();
    expect(api.playHere).not.toHaveBeenCalled();
  });

  it("previews a session still loading, before it has a current entry or duration", async () => {
    const loading = live();
    loading.state.status = "loading";
    loading.state.current_entry_id = null;
    loading.state.duration = null;
    setTarget({ players: [loading] });
    const { user } = open();
    await user.click(await screen.findByRole("radio", { name: /Lounge/ }));
    const preview = screen.getByRole("region", { name: "Active session on the server" });
    expect(within(preview).getByText("2 up next")).toBeTruthy();
    expect(within(preview).queryByText(/Artist ·/)).toBeNull();
  });

  it("opens AirPlay straight from this device", async () => {
    local.isAirPlayAvailable = true;
    const { user } = open();
    expect(await screen.findByText("Plays here, through this device or AirPlay")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /AirPlay…/ }));
    expect(api.playHere).not.toHaveBeenCalled();
    expect(local.showAirPlayPicker).toHaveBeenCalledTimes(1);
  });

  it("offers AirPlay from this device only when the browser has it, returning to local first", async () => {
    local.isAirPlayAvailable = true;
    setTarget({ target: "lounge", remote: { player: live() } });
    const { user } = open();
    await user.click(await screen.findByRole("button", { name: /AirPlay…/ }));
    expect(api.playHere).toHaveBeenCalledTimes(1);
    expect(local.showAirPlayPicker).toHaveBeenCalledTimes(1);
  });

  it("shows the unlock form in place of the servers while locked", async () => {
    setTarget({ authorized: false, players: [], problem: "denied" });
    const { user } = open();
    expect(api.loadPlayers).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "denied");
    expect(screen.queryByRole("button", { name: "Lock server access" })).toBeNull();
    const field = screen.getByLabelText("Household web passphrase");
    await user.type(field, "secret");
    await user.click(screen.getByRole("button", { name: "Unlock music servers" }));
    expect(api.unlock).toHaveBeenCalledWith("secret");
    expect((field as HTMLInputElement).value).toBe("");
  });

  it("retries a failed list, says when there are no servers, and locks access", async () => {
    setTarget({ players: [], problem: "worker unavailable" });
    const { user, rerender } = open();
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(api.loadPlayers).toHaveBeenCalledTimes(1);
    setTarget({ players: [] });
    rerender(<PlayOnPicker />);
    expect(screen.getByText("No music servers are configured yet.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Lock server access" }));
    expect(api.lock).toHaveBeenCalledTimes(1);
  });
});
