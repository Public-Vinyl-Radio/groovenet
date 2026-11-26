// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import OtherRatings from "./OtherRatings";

const sam = { user_id: "sam", name: "Sam", rating: 3 };

describe("OtherRatings (#1283)", () => {
  it("shows nothing when no other profile has rated the track", () => {
    renderWithProviders(<OtherRatings track={{ star_rating: 5, other_ratings: [] }} />);
    expect(screen.queryByTestId("other-ratings")).toBeNull();
    renderWithProviders(<OtherRatings track={{ star_rating: 5 }} />);
    expect(screen.queryByTestId("other-ratings")).toBeNull();
  });

  it("reads 'You ★5 · Sam ★3', by display name", () => {
    renderWithProviders(<OtherRatings track={{ star_rating: 5, other_ratings: [sam] }} />);
    const line = screen.getByTestId("other-ratings");
    expect(line.textContent).toBe("You ★5 · Sam ★3");
    expect(line.getAttribute("aria-label")).toBe("You rated 5 of 5, Sam rated 3 of 5");
  });

  it("says the viewer has not rated it yet", () => {
    renderWithProviders(
      <OtherRatings track={{ other_ratings: [sam, { user_id: "jo", name: "Jo", rating: 5 }] }} />,
    );
    const line = screen.getByTestId("other-ratings");
    expect(line.textContent).toBe("You not rated · Sam ★3 · Jo ★5");
    expect(line.getAttribute("aria-label")).toMatch(/^You have not rated it/);
  });
});
