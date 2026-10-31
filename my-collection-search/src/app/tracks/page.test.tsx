// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

vi.mock("@/components/SearchResults", () => ({ default: () => <div>search results</div> }));

import TracksPage from "./page";

describe("TracksPage", () => {
  it("renders the track search", () => {
    renderWithProviders(<TracksPage />);
    expect(screen.getByText("search results")).toBeTruthy();
  });
});
