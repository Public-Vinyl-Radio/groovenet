// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
vi.mock("@/components/system/SystemStatus", () => ({
  default: () => <section aria-label="Status" />,
}));
vi.mock("@/components/system/SystemStorage", () => ({
  default: () => <section aria-label="Storage" />,
}));
vi.mock("@/components/system/SystemBackups", () => ({
  default: () => <section aria-label="Backups" />,
}));
vi.mock("@/components/settings/DatabaseRestore", () => ({
  default: () => <section aria-label="Danger zone" />,
}));
import SystemPage from "./page";
it("titles System and mounts status, backups and restore", () => {
  renderWithProviders(<SystemPage />);
  expect(screen.getByRole("heading", { name: "System", level: 1 })).toBeTruthy();
  for (const name of ["Status", "Storage", "Backups", "Danger zone"])
    expect(screen.getByRole("region", { name })).toBeTruthy();
  expect(
    screen.getByText("How the server is doing, its backups, and restoring from one."),
  ).toBeTruthy();
});
