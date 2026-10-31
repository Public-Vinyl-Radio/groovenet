// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { OCTOBER_RECAP } from "@/stories/fixtures/spinRecap";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";

vi.mock("@/services/internalApi/spins", () => ({ getSpinRecap: vi.fn() }));

import HomeMonthCard, { MonthCard } from "./MonthCard";
import { getSpinRecap } from "@/services/internalApi/spins";

const values = () => screen.getAllByRole("definition").map((node) => node.textContent);

describe("MonthCard", () => {
  it("shows the four stats, the split and the link to the month's recap", () => {
    renderWithProviders(<MonthCard month="2026-10" recap={OCTOBER_RECAP} />);
    const section = screen.getByRole("region", { name: "OCTOBER SO FAR" });
    expect(
      within(section)
        .getAllByRole("term")
        .map((node) => node.textContent),
    ).toEqual(["SPINS", "HOURS", "RECORDS PULLED", "NEW TO ROTATION"]);
    // Hours known for 92% of spins: approximate.
    expect(values()).toEqual(["120", "≈8.4", "31", "6"]);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/spins/recap/2026-10");
    expect(screen.getByRole("link").textContent).toContain("FULL RECAP →");
    expect(screen.getByTestId("home-month-split").textContent).toBe("48 · 72");
    expect(
      screen.getByRole("img", { name: "Vinyl 48 spins, digital 72 spins", hidden: true }),
    ).toBeTruthy();
  });

  it("drops the ≈ when every spin's length is known", () => {
    const recap = {
      ...OCTOBER_RECAP,
      stats: { ...OCTOBER_RECAP.stats, hours_known_share: 1 },
    };
    renderWithProviders(<MonthCard month="2026-10" recap={recap} />);
    expect(values()[1]).toBe("8.4");
  });

  it("shows dashes while the recap loads", () => {
    renderWithProviders(<MonthCard month="2026-10" recap={null} />);
    expect(values()).toEqual(["–", "–", "–", "–"]);
    expect(screen.getByTestId("home-month-split").textContent).toBe("0 · 0");
  });

  it("keeps its header and link when the recap fails", () => {
    renderWithProviders(<MonthCard month="2026-10" recap={null} error="HTTP 500" />);
    expect(screen.getByRole("alert").textContent).toBe("COULDN'T LOAD THE RECAP · HTTP 500");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/spins/recap/2026-10");
    expect(screen.queryAllByRole("definition")).toHaveLength(0);
  });
});

describe("HomeMonthCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(getSpinRecap).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  const renderIn = (timeZone: string) =>
    renderWithProviders(
      <DisplayTimeZoneProvider timeZone={timeZone}>
        <HomeMonthCard friendId={7} enabled />
      </DisplayTimeZoneProvider>,
    );

  it("is still October in Los Angeles once UTC has reached November", async () => {
    // 22:30 on 31 October in Los Angeles.
    vi.setSystemTime(new Date("2026-11-01T05:30:00.000Z"));
    vi.mocked(getSpinRecap).mockResolvedValue(OCTOBER_RECAP);
    renderIn("America/Los_Angeles");
    expect(screen.getByRole("heading", { name: "OCTOBER SO FAR" })).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/spins/recap/2026-10");
    expect(getSpinRecap).toHaveBeenCalledWith({ friend_id: 7, month: "2026-10" });
    await waitFor(() => expect(values()[0]).toBe("120"));
  });

  it("turns to November at midnight in Los Angeles", () => {
    vi.setSystemTime(new Date("2026-11-01T07:00:00.000Z"));
    vi.mocked(getSpinRecap).mockResolvedValue(OCTOBER_RECAP);
    renderIn("America/Los_Angeles");
    expect(screen.getByRole("heading", { name: "NOVEMBER SO FAR" })).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/spins/recap/2026-11");
  });

  it("shows the recap's error in the card", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    vi.mocked(getSpinRecap).mockRejectedValue(new Error("Recap unavailable"));
    renderIn("UTC");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("RECAP UNAVAILABLE");
  });
});
