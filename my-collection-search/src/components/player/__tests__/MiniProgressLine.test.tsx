// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/test/renderWithProviders";

const time = vi.hoisted(() => ({ currentTime: 0, duration: 0 }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayerTime: () => time,
}));

import MiniProgressLine from "../MiniProgressLine";

const widthOf = () => screen.getByTestId("mini-progress").style.width;

describe("MiniProgressLine", () => {
  it("fills in proportion to the elapsed time", () => {
    Object.assign(time, { currentTime: 30, duration: 120 });
    render(<MiniProgressLine />);
    expect(widthOf()).toBe("25%");
  });

  it("is empty before the duration is known", () => {
    Object.assign(time, { currentTime: 30, duration: 0 });
    render(<MiniProgressLine />);
    expect(widthOf()).toBe("0%");
  });

  it("never overshoots when the time runs past the duration", () => {
    Object.assign(time, { currentTime: 200, duration: 120 });
    render(<MiniProgressLine />);
    expect(widthOf()).toBe("100%");
  });

  it("never goes below empty", () => {
    Object.assign(time, { currentTime: -5, duration: 120 });
    render(<MiniProgressLine />);
    expect(widthOf()).toBe("0%");
  });
});
