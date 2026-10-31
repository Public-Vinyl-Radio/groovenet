// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import HomeLayout from "./HomeLayout";

const order = () => screen.getAllByTestId(/^slot-/).map((node) => node.dataset.testid);

describe("HomeLayout", () => {
  it("renders the sections in the mock's order", () => {
    renderWithProviders(
      <HomeLayout
        header={<div data-testid="slot-header" />}
        nowPlaying={<div data-testid="slot-now-playing" />}
        newArrivals={<div data-testid="slot-new-arrivals" />}
        month={<div data-testid="slot-month" />}
        attention={<div data-testid="slot-attention" />}
        playlists={<div data-testid="slot-playlists" />}
      />,
    );
    expect(order()).toEqual([
      "slot-header",
      "slot-now-playing",
      "slot-new-arrivals",
      "slot-month",
      "slot-attention",
      "slot-playlists",
    ]);
  });

  it("leaves no empty wrappers for slots that aren't filled yet", () => {
    const { container } = renderWithProviders(
      <HomeLayout
        header={<div data-testid="slot-header" />}
        month={<div data-testid="slot-month" />}
      />,
    );
    expect(order()).toEqual(["slot-header", "slot-month"]);
    expect(container.querySelector("[data-slot]")).toBeNull();
  });
});
