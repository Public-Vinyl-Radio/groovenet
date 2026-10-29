// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import {
  CompactTransport,
  TransportStrip,
  type TransportProps,
} from "@/components/player/TransportControls";

const props = (over: Partial<TransportProps> = {}): TransportProps => ({
  isPlaying: false,
  canPrev: true,
  canNext: true,
  canPlay: true,
  onPrev: vi.fn(),
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onNext: vi.fn(),
  ...over,
});

function cssOf(el: Element) {
  const classes = [...el.classList];
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .filter((text) => classes.some((c) => text.includes(`.${c}`)))
    .join("\n");
}

describe("TransportStrip", () => {
  it("is one outlined group of 64px keys with a hard shadow on phones", () => {
    renderWithProviders(<TransportStrip {...props()} />);
    const strip = screen.getByRole("group", { name: "Transport" });
    expect(cssOf(strip)).toMatch(/box-shadow:\s*var\(--chakra-shadows-md\)/);
    for (const key of within(strip).getAllByRole("button"))
      expect(cssOf(key)).toMatch(/height:\s*64px/);
  });

  it("calls through and stops the click reaching a parent", async () => {
    const p = props();
    const parent = vi.fn();
    const { user } = renderWithProviders(
      <div onClick={parent}>
        <TransportStrip {...p} />
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(p.onPrev).toHaveBeenCalledTimes(1);
    expect(p.onPlay).toHaveBeenCalledTimes(1);
    expect(p.onNext).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });

  it("pauses while playing, and stays pausable with an empty queue", async () => {
    const p = props({ isPlaying: true, canPlay: false });
    const { user } = renderWithProviders(<TransportStrip size="md" {...p} />);
    const pause = screen.getByRole("button", { name: "Pause" });
    expect(pause.hasAttribute("disabled")).toBe(false);
    await user.click(pause);
    expect(p.onPause).toHaveBeenCalledTimes(1);
  });

  it("disables keys that have nowhere to go", () => {
    renderWithProviders(
      <TransportStrip {...props({ canPrev: false, canNext: false, canPlay: false })} />,
    );
    for (const name of ["Previous", "Play", "Next"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
  });
});

describe("CompactTransport", () => {
  it("is previous, the square play key and next, all at least 44px", async () => {
    const p = props();
    const { user } = renderWithProviders(<CompactTransport {...p} />);
    expect(cssOf(screen.getByRole("button", { name: "Previous" }))).toMatch(/width:\s*44px/);
    expect(cssOf(screen.getByRole("button", { name: "Play" }))).toMatch(/width:\s*48px/);
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(p.onPrev).toHaveBeenCalledTimes(1);
  });
});
