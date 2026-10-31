// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { SpinRecapResponse } from "@/services/internalApi/spins";
import { SpinArt } from "./listeningLogParts";
import SpinRecapStrip, { formatRecapHours, summarizeGenres } from "./SpinRecapStrip";
import SpinRecordGroup, { recordGroupMeta } from "./SpinRecordGroup";
import type { SpinPlay, SpinRecordGroup as Group } from "./spinSummary";

vi.mock("./SpinSessionActions", () => ({ default: () => null }));

function play(position: string | null, playedAt: string): SpinPlay {
  return {
    key: `${position}`,
    item: {} as SpinPlay["item"],
    playedAt,
    medium: "vinyl",
    releaseId: "r1",
    position,
    title: `Song ${position}`,
    artist: null,
    record: null,
    thumbnail: null,
  };
}

describe("SpinArt", () => {
  it("falls back to a disc when the art fails to load", () => {
    const { container } = renderWithProviders(<SpinArt src="https://x/art.jpg" />);
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("SpinRecordGroup", () => {
  const group: Group = {
    key: "g",
    releaseId: "r1",
    medium: "vinyl",
    record: null,
    artist: null,
    thumbnail: null,
    plays: [play("A2", "2026-10-27T19:05:00Z"), play("A1", "2026-10-27T19:00:00Z")],
  };

  it("names an unknown record and starts collapsed", () => {
    renderWithProviders(<SpinRecordGroup group={group} />);
    const toggle = screen.getByRole("button", { name: /Unknown record/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("can start expanded", () => {
    renderWithProviders(<SpinRecordGroup group={group} defaultExpanded />);
    expect(screen.getByText("A2 · Song A2")).toBeTruthy();
  });

  it("describes the run, leaving out positions nobody recorded", () => {
    expect(recordGroupMeta(group, "UTC")).toMatch(/^A1–A2 · 2 TRACKS · 7:00\sPM–7:05\sPM$/);
    const unknown = { ...group, plays: group.plays.map((p) => ({ ...p, position: null })) };
    expect(recordGroupMeta(unknown, "UTC")).toMatch(/^2 TRACKS · /);
  });
});

describe("SpinRecapStrip helpers", () => {
  it("rounds hours by size", () => {
    expect(formatRecapHours(4.46, 1)).toBe("4.5");
    expect(formatRecapHours(12.6, 0.5)).toBe("≈13");
  });

  it("only counts genres past the limit", () => {
    const genre = (name: string) => ({ genre_id: name, name, spins: 1, share: 0.5 });
    expect(summarizeGenres([genre("Latin"), genre("Rock")])).toBe("LATIN · ROCK");
  });
});

describe("SpinRecapStrip", () => {
  const base = {
    stats: {
      spins: { value: 3, previous: 0 },
      hours: { value: 1, previous: 0 },
      records_pulled: { value: 1, previous: 0 },
      new_to_rotation: { value: 0, previous: 0 },
      hours_known_share: 1,
      hours_known_spins: 3,
    },
    split: { vinyl: 3, digital: 0 },
    genre_mix: {
      current: ["A", "B", "C", "D", "E", "F", "G"].map((name) => ({
        genre_id: null,
        name,
        spins: 1,
        share: 1 / 7,
      })),
      previous: [],
    },
  } as unknown as SpinRecapResponse;

  it("handles vinyl only and more genres than shades", () => {
    renderWithProviders(<SpinRecapStrip month="2026-09" current={false} recap={base} />);
    expect(screen.getByText("SEPTEMBER RECAP")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Vinyl 3 spins, digital 0 spins" })).toBeTruthy();
    expect(screen.getByTestId("genre-summary").textContent).toBe("A · B · C · +4");
    expect(screen.getByTestId("genre-legend").querySelectorAll("li")).toHaveLength(7);
  });

  it("handles digital only", () => {
    const digital = { ...base, split: { vinyl: 0, digital: 2 } };
    renderWithProviders(<SpinRecapStrip month="2026-09" current={false} recap={digital} />);
    expect(screen.getByRole("img", { name: "Vinyl 0 spins, digital 2 spins" })).toBeTruthy();
  });
});
