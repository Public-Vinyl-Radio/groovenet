// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { FittedGenreList, fitGenreTags } from "./GenreBadge";

describe("fitGenreTags (#1231)", () => {
  it("shows every tag that fits whole, and no count", () => {
    expect(fitGenreTags([50, 40], 6, 96, 24)).toBe(2);
    expect(fitGenreTags([], 6, 100, 24)).toBe(0);
  });

  it("reserves the count's room first, then fits whole tags", () => {
    // 50 + 6 + 40 = 96 fits, but then 6 + 24 for "+1" doesn't: one tag and the count.
    expect(fitGenreTags([50, 40, 30], 6, 110, 24)).toBe(1);
    expect(fitGenreTags([50, 40, 30], 6, 126, 24)).toBe(2);
    expect(fitGenreTags([30, 30, 30, 30, 30], 6, 140, 24)).toBe(3);
  });

  it("always shows one tag, to ellipsize, when even it doesn't fit", () => {
    expect(fitGenreTags([200], 6, 120, 24)).toBe(1);
    expect(fitGenreTags([200, 40], 6, 120, 24)).toBe(1);
  });
});

describe("FittedGenreList", () => {
  const widths: Record<string, number> = {
    "Psychedelic Rock": 120,
    "Dream Pop": 70,
    Jazz: 40,
    Funk: 40,
  };
  let cellWidth = 400;
  let clipRight = 1000;
  let resize: (() => void) | null = null;

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.clip !== undefined) {
        return {
          width: clipRight,
          height: 20,
          top: 0,
          left: 0,
          right: clipRight,
          bottom: 20,
        } as DOMRect;
      }
      const width =
        this.dataset.measureTag !== undefined
          ? (widths[this.textContent ?? ""] ?? 0)
          : this.dataset.measureCount !== undefined
            ? 24
            : cellWidth;
      return {
        width,
        height: 20,
        top: 0,
        left: 0,
        right: width,
        bottom: 20,
        x: 0,
        y: 0,
      } as DOMRect;
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          resize = () =>
            this.cb(
              [{ contentRect: { width: cellWidth } } as ResizeObserverEntry],
              this as unknown as ResizeObserver,
            );
        }
        disconnect() {
          resize = null;
        }
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cellWidth = 400;
    clipRight = 1000;
  });

  const items = Object.keys(widths).map((label) => ({
    item: { label, slug: label.toLowerCase().replace(/ /g, "-") },
    kind: "track" as const,
  }));
  const shown = () =>
    [...screen.getByTestId("genres").querySelectorAll("a")].map((a) => a.textContent);
  const count = () => screen.getByTestId("genres").querySelector("[data-overflow]");

  it("shows them all when they fit", () => {
    renderWithProviders(<FittedGenreList data-testid="genres" items={items} />);
    expect(shown()).toEqual(["Psychedelic Rock", "Dream Pop", "Jazz", "Funk"]);
    expect(count()).toBeNull();
  });

  it("counts exactly the tags it leaves out, named in the count's title", () => {
    cellWidth = 230;
    renderWithProviders(<FittedGenreList data-testid="genres" items={items} />);
    // 120 + 6 + 70 = 196, then 6 + 24 for the count: 226 fits.
    expect(shown()).toEqual(["Psychedelic Rock", "Dream Pop"]);
    expect(count()?.textContent).toBe("+2");
    expect(count()?.getAttribute("title")).toBe("Jazz, Funk");
    expect(count()?.getAttribute("aria-label")).toBe("2 more genres");
  });

  it("re-fits when the cell's width changes, and only then", () => {
    cellWidth = 230;
    renderWithProviders(<FittedGenreList data-testid="genres" items={items} />);
    expect(shown()).toHaveLength(2);
    act(() => resize?.());
    expect(shown()).toHaveLength(2);
    cellWidth = 140;
    act(() => resize?.());
    expect(shown()).toEqual(["Psychedelic Rock"]);
    expect(count()?.textContent).toBe("+3");
    expect(count()?.getAttribute("aria-label")).toBe("3 more genres");
  });

  it("lets one tag ellipsize, with its name in the title, when it alone doesn't fit", () => {
    cellWidth = 80;
    renderWithProviders(
      <FittedGenreList data-testid="genres" items={items.slice(0, 2)} size="xs" />,
    );
    const [tag] = screen.getByTestId("genres").querySelectorAll("a");
    expect(tag.textContent).toBe("Psychedelic Rock");
    expect(tag.getAttribute("title")).toBe("Open Psychedelic Rock");
    expect(count()?.getAttribute("aria-label")).toBe("1 more genre");
  });

  it("fits to what shows when the row clips the cell (#1231)", () => {
    clipRight = 140;
    renderWithProviders(
      <div data-clip="" style={{ overflowX: "hidden" }}>
        <FittedGenreList data-testid="genres" items={items} />
      </div>,
    );
    // The cell is 400px wide, but only 140px of it shows: the tags stop there.
    expect(shown()).toEqual(["Psychedelic Rock"]);
    expect((screen.getByTestId("genres").firstElementChild as HTMLElement).style.maxWidth).toBe(
      "140px",
    );
    expect(count()?.textContent).toBe("+3");

    clipRight = 1000;
    act(() => resize?.());
    expect(shown()).toHaveLength(4);
  });

  it("re-fits once the web fonts arrive", async () => {
    let loaded: () => void = () => {};
    const ready = new Promise<void>((resolve) => (loaded = resolve));
    Object.defineProperty(document, "fonts", { value: { ready }, configurable: true });
    try {
      renderWithProviders(<FittedGenreList data-testid="genres" items={items} />);
      expect(shown()).toHaveLength(4);
      cellWidth = 140;
      await act(async () => {
        loaded();
        await ready;
      });
      expect(shown()).toEqual(["Psychedelic Rock"]);
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });

  it("fits once without a ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    cellWidth = 230;
    renderWithProviders(<FittedGenreList data-testid="genres" items={items} />);
    expect(shown()).toEqual(["Psychedelic Rock", "Dream Pop"]);
  });

  it("renders nothing without genres", () => {
    const { container } = renderWithProviders(<FittedGenreList items={[]} />);
    expect(container.querySelector("a, [data-overflow]")).toBeNull();
  });
});
