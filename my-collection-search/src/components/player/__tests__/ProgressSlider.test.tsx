// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const time = vi.hoisted(() => ({ currentTime: 36, duration: 242 }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({ usePlaylistPlayerTime: () => time }));

import ProgressSlider from "@/components/player/ProgressSlider";

describe("ProgressSlider", () => {
  it("inline: elapsed, slider and duration in mono, with the position read out", () => {
    renderWithProviders(<ProgressSlider seek={() => {}} />);
    expect(screen.getByText("0:36")).toBeTruthy();
    expect(screen.getByText("4:02")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Seek" }).getAttribute("aria-valuetext")).toBe("0:36 of 4:02");
  });

  it("stacked: elapsed and time remaining under the slider", () => {
    renderWithProviders(<ProgressSlider seek={() => {}} layout="stacked" />);
    expect(screen.getByText("0:36")).toBeTruthy();
    expect(screen.getByText("−3:26")).toBeTruthy();
  });

  it("seeks to the matching time from the keyboard", async () => {
    const seek = vi.fn();
    const { user } = renderWithProviders(<ProgressSlider seek={seek} />);
    screen.getByRole("slider", { name: "Seek" }).focus();
    await user.keyboard("{End}");
    expect(seek).toHaveBeenLastCalledWith(242);
  });

  it("stays at zero before the duration is known", () => {
    Object.assign(time, { currentTime: 10, duration: 0 });
    renderWithProviders(<ProgressSlider seek={() => {}} />);
    expect(screen.getByRole("slider", { name: "Seek" }).getAttribute("aria-valuenow")).toBe("0");
    Object.assign(time, { currentTime: 36, duration: 242 });
  });
});
