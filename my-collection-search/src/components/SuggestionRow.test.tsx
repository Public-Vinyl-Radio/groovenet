// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders as renderWithChakra } from "@/test/renderWithProviders";
import SuggestionRow, { SuggestionFoldRow } from "./SuggestionRow";
import type { Track } from "@/types/track";

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

describe("SuggestionRow", () => {
  it("shows facts, reason and labelled actions", () => {
    const onAdd = vi.fn();
    const onPreview = vi.fn();
    renderWithChakra(
      <ul>
        <SuggestionRow seed={base} track={cand} onAdd={onAdd} onPreview={onPreview} />
      </ul>,
    );
    expect(screen.getByText("Key fits")).toBeTruthy();
    expect(screen.getByText("Similar sound")).toBeTruthy();
    expect(screen.getByText("Day")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Next after Seed" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview Next" }));
    expect(onAdd).toHaveBeenCalledWith(cand);
    expect(onPreview).toHaveBeenCalledWith(cand);
  });

  it("flags a key clash", () => {
    renderWithChakra(
      <ul>
        <SuggestionRow seed={base} track={{ ...cand, key: "3B" }} onAdd={vi.fn()} />
      </ul>,
    );
    expect(screen.getByText("Key clash")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Preview Next" })).toBeNull();
  });

  it("makes no key claim without a key, and no reason without one", () => {
    renderWithChakra(
      <ul>
        <SuggestionRow
          seed={base}
          track={{ ...cand, key: null, _simAudio: null }}
          onAdd={vi.fn()}
        />
      </ul>,
    );
    expect(screen.queryByText("Key fits")).toBeNull();
    expect(screen.queryByText("Key clash")).toBeNull();
    expect(screen.queryByText("Similar sound")).toBeNull();
  });

  it("shows ADDED instead of the add button", () => {
    renderWithChakra(
      <ul>
        <SuggestionRow seed={base} track={cand} onAdd={vi.fn()} added />
      </ul>,
    );
    expect(screen.getByText(/ADDED/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add Next/ })).toBeNull();
  });
});

describe("SuggestionRow compact", () => {
  it("drops the album from the byline", () => {
    renderWithChakra(
      <ul>
        <SuggestionRow seed={base} track={cand} onAdd={vi.fn()} compact />
      </ul>,
    );
    expect(screen.queryByText("Bo · Day")).toBeNull();
    expect(screen.getByText("Bo")).toBeTruthy();
  });
});

describe("SuggestionFoldRow", () => {
  it("expands", () => {
    const onExpand = vi.fn();
    renderWithChakra(
      <ul>
        <SuggestionFoldRow count={3} source="Night" onExpand={onExpand} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: "+3 more from Night" }));
    expect(onExpand).toHaveBeenCalled();
  });

  it("links title, artist, album and cover to their pages", () => {
    renderWithChakra(
      <ul>
        <SuggestionRow seed={base} track={cand} onAdd={vi.fn()} />
      </ul>,
    );
    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href("Next")).toBe("/tracks/b?friend_id=1");
    expect(href("Bo")).toBe("/albums?q=Bo&friend_id=1");
    expect(href("Day")).toBe("/albums/2?friend_id=1");
    // The cover is a second, hidden way to the album: never a second tab stop.
    const cover = document.querySelector('a[aria-hidden="true"]');
    expect(cover?.getAttribute("href")).toBe("/albums/2?friend_id=1");
    expect(cover?.getAttribute("tabindex")).toBe("-1");
  });

  it("links only the title in the phone sheet's compact form", () => {
    renderWithChakra(
      <ul>
        <SuggestionRow seed={base} track={cand} compact onAdd={vi.fn()} />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe(
      "/tracks/b?friend_id=1",
    );
    expect(screen.queryByRole("link", { name: "Bo" })).toBeNull();
    expect(screen.getByText("Bo")).toBeTruthy();
  });
});
