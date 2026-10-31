// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import { SpinDetailEmpty, SpinDetailModal, SpinDetailPanel } from "./SpinDetail";
import { findSpinSelection, type SpinSelection } from "./spinSelection";
import { groupListeningLog, type SpinListItem } from "./spinSummary";

const mocks = vi.hoisted(() => ({
  deleteSpin: vi.fn(),
  toast: vi.fn(),
  stats: null as null | { play_count: number; last_played_at: string | null },
  statsArgs: vi.fn(),
  album: undefined as undefined | { library_identifier?: string },
  albumQuery: vi.fn(),
  form: null as null | { open: boolean; spin?: SpinListItem },
}));
vi.mock("@/hooks/useSpinsQuery", () => ({
  useSpinMutations: () => ({ deleteSpin: mocks.deleteSpin, deleteSpinPending: false }),
  useSpinTrackStatsQuery: (...args: unknown[]) => {
    mocks.statsArgs(...args);
    return { stats: mocks.stats };
  },
}));
vi.mock("@/hooks/useAlbumsQuery", () => ({ useAlbumDetailQuery: mocks.albumQuery }));
vi.mock("@/hooks/useAlbum", () => ({ useAlbum: () => mocks.album }));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));
vi.mock("./SpinFormDialog", () => ({
  default: (props: { open: boolean; spin?: SpinListItem }) => {
    mocks.form = props;
    return null;
  },
}));

const NOW = new Date("2026-10-31T12:00:00Z");

function spin(
  session: Partial<SpinListItem["session"]> = {},
  positions: string[] = ["A1", "A2", "A3"],
): SpinListItem {
  const playedAt = "2026-10-27T19:00:00.000Z";
  return {
    session: {
      id: 9,
      friend_id: 7,
      release_id: "r1",
      medium: "vinyl",
      selection_mode: "tracks",
      played_at: playedAt,
      provenance: "manual",
      created_at: playedAt,
      updated_at: playedAt,
      ...session,
    },
    selections: [],
    track_events: positions.map((position, ordinal) => ({
      friend_id: 7,
      release_id: "r1",
      track_id: `r1-${position}`,
      played_at: new Date(Date.parse(playedAt) + ordinal * 5 * 60_000).toISOString(),
      ordinal,
      position_snapshot: position,
      title_snapshot: `Song ${position}`,
    })),
    album: { title: "Innerspeaker", artist: "Tame Impala", thumbnail: null },
    derived: {
      is_full_album_spin: false,
      selected_side_count: 0,
      album_side_count: 0,
      track_count: positions.length,
    },
  };
}

function select(item: SpinListItem, key: string): SpinSelection {
  return findSpinSelection(groupListeningLog([item], "UTC", NOW), key)!;
}

const handlers = () => ({ onSelect: vi.fn(), onClose: vi.fn(), onDeleted: vi.fn() });

function renderPanel(selection: SpinSelection, props = handlers()) {
  const view = renderWithProviders(
    <DisplayTimeZoneProvider timeZone="UTC">
      <SpinDetailPanel selection={selection} {...props} />
    </DisplayTimeZoneProvider>,
  );
  return { ...view, props };
}

function renderModal(selection: SpinSelection, props = handlers()) {
  const view = renderWithProviders(
    <DisplayTimeZoneProvider timeZone="UTC">
      <SpinDetailModal selection={selection} {...props} />
    </DisplayTimeZoneProvider>,
  );
  return { ...view, props };
}

function fact(label: string) {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.deleteSpin.mockReset();
  mocks.toast.mockReset();
  mocks.statsArgs.mockReset();
  mocks.albumQuery.mockReset();
  mocks.stats = null;
  mocks.album = undefined;
  mocks.form = null;
});

describe("SpinDetailPanel content", () => {
  it("shows an auto-detected vinyl spin with its library identifier", () => {
    mocks.album = { library_identifier: "LP-342" };
    mocks.stats = { play_count: 4, last_played_at: "2026-10-27T19:10:00Z" };
    renderPanel(select(spin({ provenance: "automatic" }), "9:2"));

    expect(screen.getByText("LP-342 · SIDE A3")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Song A3" })).toBeTruthy();
    expect(screen.getByText("Tame Impala · Innerspeaker")).toBeTruthy();
    expect(fact("SOURCE")).toBe("Vinyl");
    expect(fact("LOGGED BY")).toBe("Auto-detected");
    expect(fact("LOGGED AT")).toMatch(/^Tue Oct 27 · 7:10\sPM$/);
    expect(screen.getByText(/Wrong track or side\? Fix it below\./)).toBeTruthy();
    expect(screen.getByText("4× PLAYED · LAST OCT 27")).toBeTruthy();
    expect(mocks.statsArgs).toHaveBeenCalledWith({ friend_id: 7, track_id: "r1-A3" });
    expect(mocks.albumQuery).toHaveBeenCalledWith("r1", 7);
    expect(screen.getByRole("link", { name: "TRACK PAGE →" }).getAttribute("href")).toBe(
      "/tracks/r1-A3?friend_id=7",
    );
    expect(screen.getByRole("link", { name: "ALBUM PAGE →" }).getAttribute("href")).toBe(
      "/albums/r1?friend_id=7",
    );
    expect(screen.getByRole("button", { name: "FIX SPIN" })).toBeTruthy();
  });

  it("shows a manual vinyl spin, holding the count until it loads", () => {
    renderPanel(select(spin(), "9:2"));
    expect(screen.getByText("SIDE A3")).toBeTruthy();
    expect(fact("LOGGED BY")).toBe("Manual entry");
    expect(screen.getByText("Logged by hand.")).toBeTruthy();
    expect(screen.getByText("–")).toBeTruthy();
  });

  it("shows a playlist-logged spin", () => {
    renderPanel(select(spin({ provenance: "playlist" }), "9:2"));
    expect(fact("LOGGED BY")).toBe("Playlist");
    expect(screen.getByText("Logged when a playlist was played.")).toBeTruthy();
  });

  it("shows a digital output with a backend-neutral player credit", () => {
    renderPanel(
      select(spin({ medium: "digital", context_type: "player", output_name: "Lounge" }), "9:2"),
    );
    expect(fact("OUTPUT")).toBe("Lounge");
    expect(fact("LOGGED BY")).toBe("Player");
    expect(screen.getByText("Logged when the player played it on Lounge.")).toBeTruthy();
  });

  it("shows a digital play without FIX SPIN", () => {
    renderPanel(select(spin({ medium: "digital" }), "9:2"));
    expect(screen.queryByText("OUTPUT")).toBeNull();
    expect(screen.getByText("A3")).toBeTruthy();
    expect(fact("SOURCE")).toBe("Digital");
    expect(fact("LOGGED BY")).toBe("Player");
    expect(screen.queryByRole("button", { name: "FIX SPIN" })).toBeNull();
    expect(screen.getByRole("button", { name: "DELETE SPIN" })).toBeTruthy();
  });

  it("hides This track for a play without a track", () => {
    renderPanel(select({ ...spin(), track_events: [] }, "9"));
    expect(screen.queryByText("THIS TRACK")).toBeNull();
    expect(mocks.statsArgs).not.toHaveBeenCalled();
  });

  it("closes", async () => {
    const { user, props } = renderPanel(select(spin(), "9:2"));
    await user.click(screen.getByRole("button", { name: "Close spin detail" }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe("SpinDetailPanel session", () => {
  it("keeps both directions at the session's newest spin, the end disabled", async () => {
    const { user, props } = renderPanel(select(spin(), "9:2"));
    expect(screen.getByText(/^Spin 3 of 3 · 7:00\sPM–7:10\sPM$/)).toBeTruthy();
    const after = screen.getByRole("button", { name: /AFTER/ }) as HTMLButtonElement;
    expect(after.textContent).toContain("Last spin of the session");
    expect(after.disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: /BEFORE/ }));
    expect(props.onSelect).toHaveBeenCalledWith("9:1");
  });

  it("moves either way from the middle", async () => {
    const { user, props } = renderPanel(select(spin(), "9:1"));
    expect(screen.getByText(/^Spin 2 of 3/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /AFTER/ }));
    expect(props.onSelect).toHaveBeenLastCalledWith("9:2");
    await user.click(screen.getByRole("button", { name: /BEFORE/ }));
    expect(props.onSelect).toHaveBeenLastCalledWith("9:0");
  });

  it("disables BEFORE at the session's first spin", () => {
    renderPanel(select(spin(), "9:0"));
    const before = screen.getByRole("button", { name: /BEFORE/ }) as HTMLButtonElement;
    expect(before.textContent).toContain("First spin of the session");
    expect(before.disabled).toBe(true);
  });
});

describe("SpinDetailPanel actions", () => {
  it("opens the spin form for the play's session", async () => {
    const item = spin();
    const { user } = renderPanel(select(item, "9:2"));
    expect(mocks.form?.open).toBe(false);
    await user.click(screen.getByRole("button", { name: "FIX SPIN" }));
    expect(mocks.form?.open).toBe(true);
    expect(mocks.form?.spin).toBe(item);
  });

  it("deletes after confirming and clears the selection", async () => {
    mocks.deleteSpin.mockResolvedValue(undefined);
    const { user, props } = renderPanel(select(spin(), "9:2"));
    await user.click(screen.getByRole("button", { name: "DELETE SPIN" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/will be removed from your spin history/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalled());
    expect(mocks.deleteSpin).toHaveBeenCalledWith(9);
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Spin deleted", type: "success" });
  });

  it("keeps the selection when the delete fails", async () => {
    mocks.deleteSpin.mockRejectedValue(new Error("nope"));
    const { user, props } = renderPanel(select(spin(), "9:2"));
    await user.click(screen.getByRole("button", { name: "DELETE SPIN" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Failed to delete spin", description: "nope" }),
      ),
    );
    expect(props.onDeleted).not.toHaveBeenCalled();
  });
});

describe("SpinDetailModal", () => {
  it("is a dialog named by the title, leaving out directions with nowhere to go", async () => {
    mocks.stats = { play_count: 0, last_played_at: null };
    const { user, props } = renderModal(select(spin({ provenance: "automatic" }), "9:2"));
    const dialog = await screen.findByRole("dialog", { name: "Song A3" });
    expect(within(dialog).queryByText("Last spin of the session")).toBeNull();
    expect(within(dialog).getByText("0× PLAYED")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "TRACK →" })).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "ALBUM →" })).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: /BEFORE/ }));
    expect(props.onSelect).toHaveBeenCalledWith("9:1");

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("leaves out BEFORE at the session's first spin", async () => {
    renderModal(select(spin(), "9:0"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: /BEFORE/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /AFTER/ })).toBeTruthy();
  });
});

describe("SpinDetailEmpty", () => {
  it("asks for a pick", () => {
    renderWithProviders(<SpinDetailEmpty />);
    expect(screen.getByText("Pick a spin to see how it was logged.")).toBeTruthy();
  });
});
