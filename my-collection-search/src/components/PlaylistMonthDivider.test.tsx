// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PlaylistMonthDivider, { TimelineRow } from "./PlaylistMonthDivider";

const day = { day: "10", weekday: "MON" };

describe("PlaylistMonthDivider", () => {
  it("shows the month tab and the playlist and set count", () => {
    renderWithProviders(
      <PlaylistMonthDivider
        group={{ key: "2026-08", label: "AUG 2026", playlists: [], playlistCount: 2, setCount: 2 }}
      />,
    );
    expect(screen.getByTestId("month-tab").textContent).toBe("AUG 2026");
    expect(screen.getByTestId("month-count").textContent).toBe("2 playlists · 2 sets");
  });
});

describe("TimelineRow", () => {
  it("renders the day column beside the card", () => {
    renderWithProviders(
      <TimelineRow day={day}>
        <button>card</button>
      </TimelineRow>,
    );
    expect(screen.getByTestId("timeline-day").textContent).toBe("10MON");
    expect(screen.getByRole("button", { name: "card" })).toBeTruthy();
  });

  it("keeps the rail and an empty day column for a missing or invalid date", () => {
    renderWithProviders(
      <TimelineRow day={null}>
        <span>card</span>
      </TimelineRow>,
    );
    expect(screen.getByTestId("timeline-day").textContent).toBe("");
    expect(screen.getByTestId("timeline-rail")).toBeTruthy();
    expect(screen.getByTestId("timeline-dot")).toBeTruthy();
  });

  it("runs the rail through the gap in a middle row", () => {
    renderWithProviders(<TimelineRow day={day}>x</TimelineRow>);
    const rail = screen.getByTestId("timeline-rail");
    expect(getComputedStyle(rail).top).toBe("-12px");
    expect(getComputedStyle(rail).bottom).toBe("-12px");
  });

  it("starts the rail at the dot on the first row", () => {
    renderWithProviders(
      <TimelineRow day={day} isFirst>
        x
      </TimelineRow>,
    );
    const rail = screen.getByTestId("timeline-rail");
    expect(getComputedStyle(rail).top).toBe("18px");
    expect(getComputedStyle(rail).bottom).toBe("-12px");
  });

  it("ends the rail at the dot on the last row", () => {
    renderWithProviders(
      <TimelineRow day={day} isLast>
        x
      </TimelineRow>,
    );
    const rail = screen.getByTestId("timeline-rail");
    expect(getComputedStyle(rail).top).toBe("-12px");
    expect(getComputedStyle(rail).bottom).toBe("calc(100% - 18px)");
  });
});
