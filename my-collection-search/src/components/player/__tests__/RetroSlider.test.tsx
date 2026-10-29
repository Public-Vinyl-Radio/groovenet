// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import RetroSlider from "@/components/player/RetroSlider";

describe("RetroSlider", () => {
  it("names the thumb, reads out the value text and moves with the arrow keys", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <RetroSlider label="Volume" value={40} valueText="40%" onChange={onChange} />,
    );

    const thumb = screen.getByRole("slider", { name: "Volume" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("40");
    expect(thumb.getAttribute("aria-valuetext")).toBe("40%");

    thumb.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(41);
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("reads out the raw value when no value text is given", () => {
    renderWithProviders(<RetroSlider label="Seek" value={10} onChange={() => {}} />);
    expect(screen.getByRole("slider", { name: "Seek" }).getAttribute("aria-valuetext")).toBeNull();
  });

  it("settles on the last value it reported, not the not-yet-rendered controlled one", async () => {
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    const { user } = renderWithProviders(
      <RetroSlider label="Volume" value={40} onChange={onChange} onChangeEnd={onChangeEnd} />,
    );
    screen.getByRole("slider", { name: "Volume" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChangeEnd).toHaveBeenLastCalledWith(41);
  });
});
