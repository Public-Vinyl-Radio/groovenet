// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import NeedsAttention from "./NeedsAttention";
const counts = { missing_audio: 12, missing_bpm_or_key: 0, due_for_cleaning: 3, failed_jobs: 1 };
afterEach(() => setViewportWidth(1280));
describe("NeedsAttention", () => {
  it.each([390, 1280])("shows the layout and zero counts at %s px", async (width) => {
    setViewportWidth(width);
    renderWithProviders(<NeedsAttention attention={counts} />);
    await waitFor(() =>
      expect(
        screen.getByText(width === 390 ? "Missing audio" : "Tracks missing audio"),
      ).toBeTruthy(),
    );
    expect(
      screen
        .getByRole("link", { name: "12 tracks missing audio, open Tracks" })
        .getAttribute("href"),
    ).toBe("/tracks?missingAudio=1");
    expect(
      screen.getByRole("link", { name: "0 tracks missing bpm or key, open Tracks" }).textContent,
    ).toContain("0");
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.queryAllByText("TRACKS →").length > 0).toBe(width === 1280);
    expect(getComputedStyle(screen.getByRole("list")).gridTemplateColumns).toBe(
      width === 390 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
    );
  });
  it.each([390, 1280])("shows all clear at %s px", async (width) => {
    setViewportWidth(width);
    renderWithProviders(
      <NeedsAttention
        attention={{ missing_audio: 0, missing_bpm_or_key: 0, due_for_cleaning: 0, failed_jobs: 0 }}
      />,
    );
    expect(screen.getByText("ALL CLEAR")).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    await waitFor(() =>
      expect(screen.queryByText("Every record is cleaned, analysed and has audio.") !== null).toBe(
        width === 1280,
      ),
    );
  });
  it("keeps unavailable jobs accessible and never all clear", () => {
    renderWithProviders(
      <NeedsAttention
        attention={{
          missing_audio: 0,
          missing_bpm_or_key: 0,
          due_for_cleaning: 0,
          failed_jobs: null,
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Unavailable count for failed jobs, open Jobs" })
        .textContent,
    ).toContain("—");
    expect(screen.queryByText("ALL CLEAR")).toBeNull();
  });
  it("shows loading", () => {
    renderWithProviders(<NeedsAttention attention={null} />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
  });
  it("shows a section error", () => {
    renderWithProviders(<NeedsAttention attention={null} error="Unavailable" />);
    expect(screen.getByRole("alert").textContent).toContain("Unavailable");
  });
});
