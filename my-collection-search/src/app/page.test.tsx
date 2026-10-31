// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the Home placeholder", () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeTruthy();
  });
});
