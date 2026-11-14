// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import type { RankingProfileEntry, RankingProfilesResponse } from "@groovenet/contracts";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import { PRESET_LIST, profileToDraft, RANKING_PRESETS } from "@/lib/ranking/profiles";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  copy: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  setActive: vi.fn(),
  preview: vi.fn(),
  seeds: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: { id: 6 } }) }));
vi.mock("@/services/internalApi/ranking", () => ({
  fetchRankingProfiles: mocks.list,
  copyRankingProfile: mocks.copy,
  updateRankingProfile: mocks.update,
  deleteRankingProfile: mocks.remove,
  setActiveRankingProfile: mocks.setActive,
  fetchRankingPreview: mocks.preview,
  createRankingProfile: mocks.create,
}));
vi.mock("@/services/internalApi/spins", () => ({ listTopSpinTracks: mocks.seeds }));

import RankingSettingsSection from "./RankingSettingsSection";

const mine: RankingProfileEntry = {
  ...RANKING_PRESETS.beatmatcher,
  id: "7",
  kind: "custom",
  name: "Peak time",
  description: "",
  surfaces: ["suggestions", "related"],
};
const broken: RankingProfileEntry = {
  ...RANKING_PRESETS.default,
  id: "8",
  kind: "custom",
  name: "Old",
  invalid: true,
};
let response: RankingProfilesResponse;

const seed = (id: string, title: string, extra = {}) => ({
  friend_id: 6,
  release_id: "r",
  track_id: id,
  play_count: 3,
  last_played_at: "2026-11-01T00:00:00Z",
  title_snapshot: title,
  artist_snapshot: "Artist",
  album_snapshot: "Album",
  bpm: 124,
  key: "8A",
  hasVectors: true,
  ...extra,
});
const ranking = (score: number, passed: boolean) => ({
  score,
  passed,
  failed: passed ? [] : ["key_rule"],
  prior: null,
  signals: { vibe_similarity: { value: 0.8, weight: 1, contribution: 0.8 } },
});

beforeEach(() => {
  vi.clearAllMocks();
  setViewportWidth(1280);
  response = {
    friend_id: 6,
    profiles: [...PRESET_LIST, mine, broken],
    active: { suggestions: "7", related: "beatmatcher", recommendations: "default" },
  };
  mocks.list.mockImplementation(async () => response);
  mocks.copy.mockImplementation(async () => {
    const copy: RankingProfileEntry = {
      ...RANKING_PRESETS.selector,
      id: "9",
      kind: "custom",
      name: "Selector copy",
    };
    response = { ...response, profiles: [...response.profiles, copy] };
    return copy;
  });
  mocks.update.mockImplementation(async (_id: string, profile: object) => ({
    ...mine,
    ...profile,
  }));
  mocks.remove.mockResolvedValue({ deleted: true, id: "7" });
  mocks.setActive.mockImplementation(async ({ profile_id }: { profile_id: string }) => ({
    friend_id: 6,
    active: { suggestions: profile_id, related: profile_id, recommendations: profile_id },
  }));
  mocks.seeds.mockResolvedValue({
    items: [
      seed("s1", "Seed one"),
      seed("s2", "No vectors", { hasVectors: false }),
      seed("s3", "Seed three", { bpm: null, key: null }),
    ],
    limit: 12,
    offset: 0,
  });
  mocks.preview.mockResolvedValue({
    seedTrackId: "s1",
    seedFriendId: 6,
    candidates: [
      {
        trackId: "a",
        friendId: 6,
        simIdentity: null,
        simAudio: 0.8,
        metadata: { title: "Alpha", artist: "X" },
        ranking: ranking(0.8, true),
      },
      {
        trackId: "b",
        friendId: 6,
        simIdentity: null,
        simAudio: 0.9,
        metadata: { title: "Beta", artist: "Y" },
        ranking: ranking(0.9, false),
      },
    ],
  });
});

/** Focus a slider's thumb and press a key, as a keyboard user would. */
async function press(user: ReturnType<typeof userEvent.setup>, slider: HTMLElement, key: string) {
  slider.focus();
  await user.keyboard(`{${key}}`);
}

const list = () => screen.getByRole("list", { name: "Ranking profiles" });
const row = (name: string) => within(list()).getByRole("button", { name }).closest("li")!;

describe("RankingSettingsSection", () => {
  it("lists presets and profiles, where each is used, and one that can't be read", async () => {
    renderWithProviders(<RankingSettingsSection />);
    await screen.findByRole("button", { name: "Peak time" });
    expect(within(row("Peak time")).getByText("Used for suggestions")).toBeTruthy();
    expect(within(row("Beatmatcher")).getByText("Used for related tracks")).toBeTruthy();
    expect(within(row("Old")).getByText("Can’t be read")).toBeTruthy();
    expect(within(row("Old")).getByText(/Ranks as Default/)).toBeTruthy();
    expect(within(row("Selector")).getByText(/Vibe and genre first/)).toBeTruthy();
    // Opens on the profile Suggestions use.
    expect(screen.getByRole("button", { name: "Peak time", pressed: true })).toBeTruthy();
    expect(within(row("Old")).getByRole("button", { name: "Use" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("uses a profile everywhere it applies, and copies one into an editable profile", async () => {
    const { user } = renderWithProviders(<RankingSettingsSection />);
    await screen.findByRole("button", { name: "Peak time" });
    await user.click(within(row("Selector")).getByRole("button", { name: "Use" }));
    expect(mocks.setActive.mock.calls[0][0]).toEqual({ friend_id: 6, profile_id: "selector" });
    await user.click(within(row("Selector")).getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith("selector", 6));
    expect(
      await screen.findByRole("button", { name: "Selector copy", pressed: true }),
    ).toBeTruthy();
  });

  it("shows a preset read-only with Copy to edit", async () => {
    const { user } = renderWithProviders(<RankingSettingsSection />);
    await user.click(await screen.findByRole("button", { name: "Beatmatcher" }));
    const editor = screen.getByTestId("ranking-editor");
    expect(within(editor).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(editor).getByText(/Tempo and key first/)).toBeTruthy();
    expect(
      within(editor).getByRole("slider", { name: "BPM weight" }).getAttribute("aria-disabled"),
    ).toBe("true");
    await user.click(within(editor).getByRole("button", { name: "Copy to edit" }));
    expect(mocks.copy).toHaveBeenCalledWith("beatmatcher", 6);
  });

  it("edits weights, constraints and metadata, and saves the draft", async () => {
    const { user } = renderWithProviders(<RankingSettingsSection />);
    await screen.findByRole("button", { name: "Peak time" });
    const editor = screen.getByTestId("ranking-editor");
    const save = within(editor).getByRole("button", { name: "Save" });
    expect(save).toHaveProperty("disabled", true);

    const name = within(editor).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Closing");
    await user.type(within(editor).getByLabelText("Description"), "Late");
    await press(user, within(editor).getByRole("slider", { name: "Rating weight" }), "ArrowRight");
    await user.click(within(editor).getByRole("checkbox", { name: "Recommendations" }));
    await user.click(within(editor).getByRole("checkbox", { name: "Related tracks" }));
    await user.click(within(editor).getByRole("radio", { name: "Same" }));
    await user.click(within(editor).getByRole("checkbox", { name: "Half and double time" }));
    await press(user, within(editor).getByRole("slider", { name: "BPM window" }), "ArrowRight");
    await user.click(within(editor).getByRole("checkbox", { name: /^Genre floor/ }));
    await press(
      user,
      within(editor).getByRole("slider", { name: "Minimum overlap" }),
      "ArrowRight",
    );
    await user.click(within(editor).getByRole("checkbox", { name: /^Energy range/ }));
    await press(user, within(editor).getByRole("slider", { name: "Max drop" }), "ArrowRight");
    await press(user, within(editor).getByRole("slider", { name: "Max rise" }), "ArrowLeft");

    await user.click(save);
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const [id, profile] = mocks.update.mock.calls[0];
    expect(id).toBe("7");
    expect(profile).toMatchObject({
      name: "Closing",
      description: "Late",
      surfaces: ["suggestions", "recommendations"],
      weights: { rating: 0.01 },
      constraints: {
        bpm_window: { unit: "ratio", max: 0.065, half_double: false },
        key_rule: { metric: "wheel", max: 0 },
        genre_floor: { min: 0.06 },
        energy_range: { max_drop: 0.21, max_rise: 0.19 },
      },
    });
  });

  it("turns constraints off, reverts, and blocks saving an invalid draft", async () => {
    const { user } = renderWithProviders(<RankingSettingsSection />);
    await screen.findByRole("button", { name: "Peak time" });
    const editor = screen.getByTestId("ranking-editor");
    await user.click(within(editor).getByRole("checkbox", { name: /^BPM window/ }));
    expect(within(editor).queryByRole("slider", { name: "BPM window" })).toBeNull();
    await user.click(within(editor).getByRole("checkbox", { name: /^BPM window/ }));
    expect(within(editor).getByText("±6%")).toBeTruthy();
    for (const name of [/^Genre floor/, /^Energy range/]) {
      await user.click(within(editor).getByRole("checkbox", { name }));
      await user.click(within(editor).getByRole("checkbox", { name }));
    }
    expect(within(editor).queryByRole("slider", { name: "Max drop" })).toBeNull();
    await user.click(within(editor).getByRole("radio", { name: "Any" }));
    await user.click(within(editor).getByRole("checkbox", { name: "Suggestions" }));
    await user.click(within(editor).getByRole("checkbox", { name: "Related tracks" }));
    expect(within(editor).getByRole("alert").textContent).toBe(
      "Choose at least one place to use it.",
    );
    expect(within(editor).getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    await user.click(within(editor).getByRole("checkbox", { name: "Suggestions" }));
    await user.clear(within(editor).getByLabelText("Name"));
    expect(within(editor).getByRole("alert").textContent).toBe("Give it a name.");
    await user.click(within(editor).getByRole("button", { name: "Revert" }));
    expect(within(editor).queryByRole("alert")).toBeNull();
    expect((within(editor).getByLabelText("Name") as HTMLInputElement).value).toBe("Peak time");
  });

  it("says when values are out of range, and lets an unreadable profile be saved again", async () => {
    response.profiles = [
      ...PRESET_LIST,
      {
        ...mine,
        base: undefined,
        weights: { bpm_distance: 20 } as never,
        constraints: {
          key_rule: { metric: "camelot", max: 2 },
          bpm_window: { unit: "bpm", max: 4 },
        },
      },
      broken,
    ];
    const { user } = renderWithProviders(<RankingSettingsSection />);
    await screen.findByRole("button", { name: "Peak time" });
    const editor = screen.getByTestId("ranking-editor");
    expect(within(editor).getByRole("alert").textContent).toBe("Some values are out of range.");
    expect(within(editor).getByText("camelot ≤ 2")).toBeTruthy();
    expect(within(editor).getByText("±4")).toBeTruthy();
    await user.click(within(editor).getByRole("slider", { name: "BPM window" }));
    await user.keyboard("{ArrowRight}");
    expect(within(editor).getByText("±5")).toBeTruthy();
    await waitFor(() => expect(mocks.preview).toHaveBeenCalled(), { timeout: 2000 });
    expect(mocks.preview.mock.calls.at(-1)?.[1]).not.toHaveProperty("base");
    await user.click(within(list()).getByRole("button", { name: "Old" }));
    const save = within(screen.getByTestId("ranking-editor")).getByRole("button", { name: "Save" });
    expect(save).toHaveProperty("disabled", false);
  });

  it("opens on Default when Suggestions' profile isn't listed", async () => {
    response.active = { ...response.active, suggestions: "99" };
    renderWithProviders(<RankingSettingsSection />);
    expect(await screen.findByRole("button", { name: "Default", pressed: true })).toBeTruthy();
  });

  it("deletes a profile", async () => {
    const { user } = renderWithProviders(<RankingSettingsSection />);
    await screen.findByRole("button", { name: "Peak time" });
    await user.click(screen.getByRole("button", { name: "Delete profile" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("7", expect.anything()));
  });

  it("previews the draft on a played seed, failures last", async () => {
    const { user } = renderWithProviders(<RankingSettingsSection />);
    await waitFor(() => expect(mocks.preview).toHaveBeenCalled(), { timeout: 2000 });
    const [seedRef, config] = mocks.preview.mock.calls[0];
    expect(seedRef).toEqual({ track_id: "s1", friend_id: 6 });
    expect(config).toMatchObject({ id: "7", weights: mine.weights });
    const items = await screen.findAllByText(/Alpha|Beta/);
    expect(items.map((n) => n.textContent)).toEqual(["Alpha — X", "Beta — Y"]);
    expect(screen.getByText("Key clash")).toBeTruthy();
    expect(screen.getAllByText("Vibe 0.80")).toHaveLength(2);
    const select = screen.getByLabelText("Preview seed");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Seed one — Artist · 124 BPM · 8A", "Seed three — Artist"]);
    await user.selectOptions(select, "s3:6");
    await waitFor(() =>
      expect(mocks.preview.mock.calls.at(-1)?.[0]).toEqual({ track_id: "s3", friend_id: 6 }),
    );
  });

  it("says when there is nothing to preview or the preview fails", async () => {
    mocks.preview.mockResolvedValueOnce({ seedTrackId: "s1", seedFriendId: 6, candidates: [] });
    renderWithProviders(<RankingSettingsSection />);
    expect(
      await screen.findByText("No suggestions for this seed.", {}, { timeout: 2000 }),
    ).toBeTruthy();
  });

  it("reports a failed preview", async () => {
    mocks.preview.mockRejectedValue(new Error("boom"));
    renderWithProviders(<RankingSettingsSection />);
    expect(
      await screen.findByText("Could not load the preview.", {}, { timeout: 2000 }),
    ).toBeTruthy();
  });

  it("asks for spins when there is no seed", async () => {
    mocks.seeds.mockResolvedValue({
      items: [seed("x", "X", { hasVectors: false })],
      limit: 12,
      offset: 0,
    });
    renderWithProviders(<RankingSettingsSection />);
    expect(await screen.findByText(/Log a few spins/)).toBeTruthy();
  });

  it("ranks with Default when the profiles can't load", async () => {
    mocks.list.mockRejectedValue(new Error("down"));
    renderWithProviders(<RankingSettingsSection />);
    expect(await screen.findByText(/Could not load your profiles/)).toBeTruthy();
    expect(within(list()).getAllByRole("listitem")).toHaveLength(3);
  });

  it("opens the editor in a dialog on a phone", async () => {
    setViewportWidth(390);
    const { user } = renderWithProviders(<RankingSettingsSection />);
    await user.click(await screen.findByRole("button", { name: "Selector" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("ranking-editor")).toBeTruthy();
    expect(profileToDraft(RANKING_PRESETS.selector).name).toBe("Selector");
  });
});
