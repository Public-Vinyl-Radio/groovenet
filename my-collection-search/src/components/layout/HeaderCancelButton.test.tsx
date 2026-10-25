// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import HeaderCancelButton from "./HeaderCancelButton";

describe("HeaderCancelButton", () => {
  it("fires onClick", () => {
    const onClick = vi.fn();
    renderWithProviders(<HeaderCancelButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled while a save is in flight", () => {
    renderWithProviders(<HeaderCancelButton onClick={vi.fn()} disabled />);
    expect((screen.getByRole("button", { name: "Cancel", hidden: true }) as HTMLButtonElement).disabled).toBe(true);
  });
});
