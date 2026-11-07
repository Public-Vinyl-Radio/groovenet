// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const listArtists = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/artists", () => ({ listArtists }));

import ArtistFilter, {
  SelectedArtistTags,
  artistCountsLabel,
  artistFilterChips,
  artistSlugFromChipKey,
  useArtistNames,
} from "./ArtistFilter";

const meridian = {
  id: 9,
  name: "Meridian Brothers",
  sort_name: "Meridian Brothers",
  slug: "meridian-brothers",
  discogs_artist_id: null,
  is_placeholder: false,
  album_count: 2,
  track_count: 1,
};
const mis = {
  ...meridian,
  id: 4,
  name: "Mexican Institute of Sound",
  sort_name: "Mexican Institute of Sound",
  slug: "mexican-institute-of-sound",
  album_count: 1,
  track_count: 0,
};

describe("artist chips (#709)", () => {
  it("names a chip by slug or id, and falls back to the value", () => {
    expect(artistFilterChips(["meridian-brothers", "4", "nobody"], [meridian, { ...mis }])).toEqual(
      [
        { key: "artist:meridian-brothers", label: "Meridian Brothers", active: true },
        { key: "artist:4", label: "Mexican Institute of Sound", active: true },
        { key: "artist:nobody", label: "nobody", active: true },
      ],
    );
  });

  it("reads an artist chip's value back, and nothing from other chips", () => {
    expect(artistSlugFromChipKey("artist:meridian-brothers")).toBe("meridian-brothers");
    expect(artistSlugFromChipKey("genre:cumbia")).toBeNull();
  });

  it("labels the counts an artist carries", () => {
    expect(artistCountsLabel(meridian)).toBe("2 albums · 1 track");
    expect(artistCountsLabel({ album_count: 1, track_count: 3 })).toBe("1 album · 3 tracks");
    expect(artistCountsLabel({ album_count: 0, track_count: 0 })).toBe("");
  });
});

describe("useArtistNames (#709)", () => {
  it("knows what the search named and what was picked, latest pick once", () => {
    const { result } = renderHook(() => useArtistNames([meridian]));
    expect(result.current.known).toEqual([meridian]);
    act(() => result.current.remember({ slug: "x", name: "X" }));
    act(() => result.current.remember({ slug: "x", name: "X again" }));
    expect(result.current.known).toEqual([meridian, { slug: "x", name: "X again" }]);
  });

  it("starts empty before the search has named anyone", () => {
    const { result } = renderHook(() => useArtistNames(undefined));
    expect(result.current.known).toEqual([]);
  });
});

describe("SelectedArtistTags (#709)", () => {
  it("renders nothing without a choice", () => {
    renderWithProviders(<SelectedArtistTags selected={[]} known={[]} onRemove={vi.fn()} />);
    expect(screen.queryByTestId("selected-artist-tags")).toBeNull();
  });

  it("removes an artist from its tag", async () => {
    const onRemove = vi.fn();
    const { user } = renderWithProviders(
      <SelectedArtistTags
        selected={["meridian-brothers", "other"]}
        known={[meridian]}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove artist Meridian Brothers" }));
    expect(onRemove).toHaveBeenCalledWith("meridian-brothers");
    expect(screen.getByRole("button", { name: "Remove artist other" })).toBeTruthy();
  });
});

describe("ArtistFilter (#709)", () => {
  beforeEach(() => {
    listArtists.mockReset();
  });

  it("prompts for a name before searching", async () => {
    const { user } = renderWithProviders(<ArtistFilter selected={[]} onAdd={vi.fn()} />);
    await user.click(screen.getByRole("combobox", { name: "Filter by artist" }));
    expect(await screen.findByText("Type an artist's name")).toBeTruthy();
    expect(listArtists).not.toHaveBeenCalled();
  });

  it("suggests this collection's artists not yet chosen, and hands back the pick", async () => {
    listArtists.mockResolvedValue({ items: [meridian, mis], total: 2, limit: 8, offset: 0 });
    const onAdd = vi.fn();
    const { user } = renderWithProviders(
      <ArtistFilter selected={["mexican-institute-of-sound"]} onAdd={onAdd} friendId={6} />,
    );
    const input = screen.getByRole("combobox", { name: "Filter by artist" });
    expect(input.getAttribute("placeholder")).toBe("Artist · 1");
    await user.type(input, "me");
    const option = await screen.findByRole("option", { name: /Meridian Brothers.*2 albums/ });
    expect(screen.queryByRole("option", { name: /Mexican Institute/ })).toBeNull();
    expect(listArtists).toHaveBeenLastCalledWith({ q: "me", friend_id: 6, limit: 8 });

    await user.click(option);
    expect(onAdd).toHaveBeenCalledWith({ slug: "meridian-brothers", name: "Meridian Brothers" });
  });

  it("says when nothing matches", async () => {
    listArtists.mockResolvedValue({ items: [], total: 0, limit: 8, offset: 0 });
    const { user } = renderWithProviders(<ArtistFilter selected={[]} onAdd={vi.fn()} />);
    await user.type(screen.getByRole("combobox", { name: "Filter by artist" }), "zz");
    expect(await screen.findByText("No matching artist")).toBeTruthy();
  });

  it("says when the list can't load", async () => {
    const down = new Error("down");
    listArtists.mockImplementation(() => Promise.reject(down));
    const { user } = renderWithProviders(<ArtistFilter selected={[]} onAdd={vi.fn()} />);
    await user.type(screen.getByRole("combobox", { name: "Filter by artist" }), "y");
    expect(await screen.findByText("Couldn't load artists")).toBeTruthy();
  });
});
