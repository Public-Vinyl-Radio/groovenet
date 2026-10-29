// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import GenreBpmSpread from "./GenreBpmSpread";
const stats = {
  bpm_min: null,
  bpm_max: null,
  year: 2026,
  added_this_year: 0,
  playable_tracks: 0,
  bpm_histogram: [],
};
describe("BPM spread", () => {
  it("explains missing BPM without drawing illustrative bars", () => {
    renderWithProviders(<GenreBpmSpread stats={stats} />);
    expect(screen.getByText("No BPM data for this genre yet.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("exposes real intervals and counts, including a single bin", () => {
    renderWithProviders(
      <GenreBpmSpread stats={{ ...stats, bpm_histogram: [{ min: 120, max: 130, count: 1 }] }} />,
    );
    expect(screen.getByRole("img", { name: "120–130 BPM: 1 tracks" })).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("130 BPM")).toBeTruthy();
  });
});
