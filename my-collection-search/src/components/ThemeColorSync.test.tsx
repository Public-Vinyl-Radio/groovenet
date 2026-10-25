// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const mode = vi.hoisted(() => ({ colorMode: "light" }));
vi.mock("@/components/ui/color-mode", () => ({ useColorMode: () => mode }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import ThemeColorSync from "./ThemeColorSync";

const metas = () => [...document.querySelectorAll('meta[name="theme-color"]')];

describe("ThemeColorSync", () => {
  beforeEach(() => {
    for (const media of ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"]) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.media = media;
      meta.content = "#ffffff";
      document.head.appendChild(meta);
    }
  });

  afterEach(() => {
    metas().forEach((m) => m.remove());
    document.documentElement.style.removeProperty("--gn-ground");
  });

  it("points every theme-color tag at the ground showing, whatever the OS scheme says", () => {
    document.documentElement.style.setProperty("--gn-ground", " #17130f ");
    render(<ThemeColorSync />);
    expect(metas().map((m) => m.getAttribute("content"))).toEqual(["#17130f", "#17130f"]);
  });

  it("leaves the tags alone when the ground can't be read", () => {
    render(<ThemeColorSync />);
    expect(metas().map((m) => m.getAttribute("content"))).toEqual(["#ffffff", "#ffffff"]);
  });
});
