// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders as renderWithChakra } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const mocks = vi.hoisted(() => ({ replacePlaylist: vi.fn(), menu: vi.fn() }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ replacePlaylist: mocks.replacePlaylist }),
}));
// The kebab is TrackActionsMenu's own business; here we only check it's wired.
vi.mock("@/components/TrackActionsMenu", () => ({
  default: (props: { track: Track; onAddedToPlaylist?: (id: number) => void }) => {
    mocks.menu(props);
    return (
      <button type="button" onClick={() => props.onAddedToPlaylist?.(5)}>
        Track actions
      </button>
    );
  },
}));

import SuggestionRow, { SuggestionFoldRow, SuggestionList } from "./SuggestionRow";

const base = {
  track_id: "a",
  friend_id: 1,
  title: "Seed",
  artist: "Ana",
  album: "Night",
  release_id: "1",
  key: "8A",
  bpm: "100",
} as unknown as Track;
const cand = {
  ...base,
  track_id: "b",
  title: "Next",
  artist: "Bo",
  album: "Day",
  release_id: "2",
  key: "9A",
  bpm: "104",
  _simAudio: 0.5,
  _simIdentity: null,
};

const inList = (node: React.ReactNode) => renderWithChakra(<ul>{node}</ul>);

describe("SuggestionRow", () => {
  it("shows facts as track-row parts, the reason, and a labelled +", () => {
    const onAdd = vi.fn();
    inList(<SuggestionRow seed={base} track={cand} onAdd={onAdd} />);
    expect(screen.getByText("Key fits")).toBeTruthy();
    expect(screen.getByText("Similar sound")).toBeTruthy();
    expect(screen.getByText("Day")).toBeTruthy();
    // KeyChip: the Camelot code, with the key name in the tooltip.
    expect(screen.getByText("9A").closest("[title]")?.getAttribute("title")).toBe("9A");
    fireEvent.click(screen.getByRole("button", { name: "Add Next after Seed" }));
    expect(onAdd).toHaveBeenCalledWith(cand);
    expect(screen.queryByRole("button", { name: "Track actions" })).toBeNull();
  });

  it("plays from the cover when the track has audio", () => {
    inList(<SuggestionRow seed={base} track={{ ...cand, local_audio_url: "/b.mp3" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(mocks.replacePlaylist).toHaveBeenCalledWith(
      [expect.objectContaining({ track_id: "b" })],
      { autoplay: true, startIndex: 0 },
    );
  });

  it("shows a plain cover without audio", () => {
    inList(<SuggestionRow seed={base} track={cand} onAdd={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("flags a key clash", () => {
    inList(<SuggestionRow seed={base} track={{ ...cand, key: "3B" }} onAdd={vi.fn()} />);
    expect(screen.getByText("Key clash")).toBeTruthy();
  });

  it("shows the key alone when the seed has none to compare", () => {
    inList(<SuggestionRow seed={{ ...base, key: null }} track={cand} />);
    expect(screen.getByText("9A")).toBeTruthy();
    expect(screen.queryByText("Key fits")).toBeNull();
  });

  it("makes no key claim without a key, and no reason without one", () => {
    inList(
      <SuggestionRow seed={base} track={{ ...cand, key: null, _simAudio: null }} onAdd={vi.fn()} />,
    );
    expect(screen.queryByText("Key fits")).toBeNull();
    expect(screen.queryByText("Key clash")).toBeNull();
    expect(screen.queryByText("Similar sound")).toBeNull();
  });

  it("shows ADDED instead of +", () => {
    inList(<SuggestionRow seed={base} track={cand} onAdd={vi.fn()} added />);
    expect(screen.getByRole("status").textContent).toContain("ADDED");
    expect(screen.queryByRole("button", { name: /Add Next/ })).toBeNull();
    expect(screen.getByRole("listitem").getAttribute("data-added")).toBe("true");
  });

  it("puts the track kebab on the row and reports its completed add", () => {
    const onAddedToPlaylist = vi.fn();
    inList(<SuggestionRow seed={base} track={cand} menu onAddedToPlaylist={onAddedToPlaylist} />);
    expect(screen.queryByRole("button", { name: /Add Next/ })).toBeNull();
    expect(mocks.menu).toHaveBeenCalledWith(expect.objectContaining({ track: cand }));
    fireEvent.click(screen.getByRole("button", { name: "Track actions" }));
    expect(onAddedToPlaylist).toHaveBeenCalledWith(5);
  });

  it("keeps the kebab once added, beside ADDED", () => {
    inList(<SuggestionRow seed={base} track={cand} menu added />);
    expect(screen.getByRole("status").textContent).toContain("ADDED");
    expect(screen.getByRole("button", { name: "Track actions" })).toBeTruthy();
  });

  it("links title, artist and album to their pages", () => {
    inList(<SuggestionRow seed={base} track={cand} onAdd={vi.fn()} />);
    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href("Next")).toBe("/tracks/b?friend_id=1");
    expect(href("Bo")).toBe("/albums?q=Bo&friend_id=1");
    expect(href("Day")).toBe("/albums/2?friend_id=1");
  });
});

describe("SuggestionRow compact", () => {
  it("drops the album and links only the title", () => {
    inList(<SuggestionRow seed={base} track={cand} onAdd={vi.fn()} compact />);
    expect(screen.queryByText("Day")).toBeNull();
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe(
      "/tracks/b?friend_id=1",
    );
    expect(screen.queryByRole("link", { name: "Bo" })).toBeNull();
    expect(screen.getByText("Bo")).toBeTruthy();
  });
});

describe("SuggestionFoldRow", () => {
  it.each([false, true])("names its album and expands (compact: %s)", (compact) => {
    const onExpand = vi.fn();
    inList(<SuggestionFoldRow count={3} source="Night" onExpand={onExpand} compact={compact} />);
    const button = screen.getByRole("button", { name: "+3 more from Night" });
    expect(button.textContent).toBe("+3 more from Night");
    expect(button.getAttribute("title")).toBe("Night");
    fireEvent.click(button);
    expect(onExpand).toHaveBeenCalled();
  });
});

describe("SuggestionList", () => {
  it("is one list holding the rows", () => {
    renderWithChakra(
      <SuggestionList>
        <SuggestionRow seed={base} track={cand} />
        <SuggestionFoldRow count={1} source="Day" onExpand={vi.fn()} />
      </SuggestionList>,
    );
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
  });
});
