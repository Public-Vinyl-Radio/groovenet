// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const pathname = vi.hoisted(() => ({ value: "/chore" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("@/providers/CommandPaletteProvider", () => ({
  useCommandPalette: () => ({ setPaletteOpen: vi.fn() }),
}));
vi.mock("@/components/CommandPalette", () => ({ default: () => null }));
const standaloneMode = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useStandaloneMode", () => ({
  useStandaloneMode: () => standaloneMode.value,
}));

const playback = vi.hoisted(() => ({ label: null as string | null }));
vi.mock("@/components/player/PlaybackOutput", () => ({
  usePlaybackTargetLabel: () => playback.label,
}));
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";

import AppShell from "./AppShell";

describe("AppShell", () => {
  afterEach(() => {
    standaloneMode.value = false;
    pathname.value = "/chore";
    localStorage.clear();
  });

  // jsdom ignores media queries, so read the rules Emotion emitted for an
  // element instead of its computed style.
  function rulesFor(el: Element) {
    const classes = [...el.classList];
    return Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .filter((css) => classes.some((c) => css.includes(`.${c}`)))
      .join("\n");
  }

  const toggle = () =>
    screen.getByRole("button", { name: /(Collapse|Expand) sidebar/, hidden: true });
  const sidebarOf = () => {
    let el = toggle().parentElement!;
    while (!/position:\s*fixed/.test(rulesFor(el))) el = el.parentElement!;
    return el;
  };
  const contentOf = () => screen.getByText("page").parentElement!;

  it.each(["/chore", "/", "/playlists", "/somewhere-else"])(
    "renders every navigation surface at %s",
    async (path) => {
      pathname.value = path;
      const { user } = renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);

      const more = screen
        .getAllByRole("button", { hidden: true })
        .find((b) => /menu|more/i.test(b.getAttribute("aria-label") ?? ""));
      if (more) await user.click(more);
      expect(screen.getAllByRole("link", { name: /Chores/, hidden: true }).length).toBeGreaterThan(
        0,
      );
    },
  );

  it("shows System after Settings in production and under More, marking More current", async () => {
    pathname.value = "/system";
    const { user } = renderWithProviders(<AppShell developerToolsEnabled={false}>page</AppShell>);
    const links = screen.getAllByRole("link", { hidden: true });
    const settings = links.findIndex((link) => link.getAttribute("href") === "/settings");
    expect(links[settings + 1].getAttribute("href")).toBe("/system");
    const more = within(screen.getByTestId("mobile-tab-bar")).getByRole("button", {
      name: "More",
      hidden: true,
    });
    expect(more.getAttribute("aria-current")).toBe("page");
    await user.click(more);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog)
        .getByRole("link", { name: /System/ })
        .getAttribute("href"),
    ).toBe("/system");
  });

  it("marks More as the current tab for a page under it, such as Chores", () => {
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    const tabBar = screen.getByTestId("mobile-tab-bar");
    const more = within(tabBar).getByRole("button", { name: "More", hidden: true });
    expect(more.getAttribute("aria-current")).toBe("page");
  });

  it("marks the tab itself, not More, for a primary page", () => {
    pathname.value = "/spins";
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    const tabBar = screen.getByTestId("mobile-tab-bar");
    expect(
      within(tabBar)
        .getByRole("button", { name: "More", hidden: true })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(
      within(tabBar)
        .getByRole("link", { name: "Spins", hidden: true })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  describe("tab bar labels", () => {
    const tabBar = () => screen.getByTestId("mobile-tab-bar");
    const visibleLabel = (name: string) => {
      const el = within(tabBar()).getByText(name, { selector: "p" });
      return rulesFor(el).includes("visibility: hidden") ? "hidden" : "shown";
    };

    it("makes the active tab's box fill its slot, whichever tab is active", () => {
      for (const path of ["/", "/tracks", "/spins"]) {
        pathname.value = path;
        const { unmount } = renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
        const link = within(tabBar()).getByRole("link", { hidden: true, current: "page" });
        expect(rulesFor(link.firstElementChild!)).toMatch(/width:\s*var\(--chakra-sizes-full\)/);
        unmount();
      }
    });

    it("shows every label and sets the root flag by default", () => {
      renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
      expect(document.documentElement.getAttribute("data-tabbar-labels")).toBe("always");
      for (const name of ["Home", "Tracks", "More"]) expect(visibleLabel(name)).toBe("shown");
      expect(within(tabBar()).getByRole("link", { name: "Home", hidden: true })).toBeTruthy();
    });

    it("selected only: keeps labels in layout but hides the inactive ones, still named", () => {
      localStorage.setItem("tabbar-labels", "selected");
      pathname.value = "/tracks";
      renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
      expect(document.documentElement.getAttribute("data-tabbar-labels")).toBe("selected");
      expect(visibleLabel("Tracks")).toBe("shown");
      expect(visibleLabel("Home")).toBe("hidden");
      expect(visibleLabel("More")).toBe("hidden");
      expect(within(tabBar()).getByRole("link", { name: "Home", hidden: true })).toBeTruthy();
      expect(
        within(tabBar())
          .getByRole("link", { name: "Tracks", hidden: true })
          .getAttribute("aria-current"),
      ).toBe("page");
    });

    it("selected only: shows More's label when a page under it is current", () => {
      localStorage.setItem("tabbar-labels", "selected");
      renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
      expect(visibleLabel("More")).toBe("shown");
    });

    it("never: renders icons only, every tab still named, at least 44px tall", () => {
      localStorage.setItem("tabbar-labels", "never");
      pathname.value = "/tracks";
      renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
      expect(document.documentElement.getAttribute("data-tabbar-labels")).toBe("never");
      expect(within(tabBar()).queryByText("Home", { selector: "p" })).toBeNull();
      for (const name of ["Home", "Tracks", "Albums", "Genres", "Spins"]) {
        const link = within(tabBar()).getByRole("link", { name, hidden: true });
        expect(rulesFor(link.firstElementChild!)).toMatch(/min-height:\s*44px/);
      }
      const more = within(tabBar()).getByRole("button", { name: "More", hidden: true });
      expect(rulesFor(more)).toMatch(/min-height:\s*44px/);
    });
  });

  it("links to the record-care chores", () => {
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);

    const links = screen.getAllByRole("link", { name: /Chores/, hidden: true });
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.getAttribute("href") === "/chore")).toBe(true);
  });

  it("invalidates active data when a standalone app returns to the foreground", () => {
    standaloneMode.value = true;
    const { queryClient } = renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const originalVisibilityState = document.visibilityState;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(invalidate).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(invalidate).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: originalVisibilityState,
    });
  });

  it("pins the desktop sidebar to the viewport instead of the document", () => {
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);

    const css = rulesFor(sidebarOf());
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/top:\s*0/);
    // It ends on the docked player bar, which runs full width under it.
    expect(css).toMatch(/bottom:\s*var\(--player-h\)/);
    expect(css).toMatch(/left:\s*0/);
    expect(css).not.toMatch(/sticky|100vh/);
  });

  it("pads the content right by --queue-w so the desktop queue panel never covers it", () => {
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    expect(rulesFor(contentOf())).toMatch(
      /padding-right:\s*calc\(var\(--chakra-spacing-6\) \+ var\(--queue-w\)\)/,
    );
  });

  it("offsets the content by the sidebar width and follows its state", async () => {
    const { user } = renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    expect(rulesFor(sidebarOf())).toMatch(/width:\s*64px/);
    expect(rulesFor(contentOf())).toMatch(/margin-left:\s*64px/);

    await user.click(toggle());

    expect(rulesFor(sidebarOf())).toMatch(/width:\s*220px/);
    expect(rulesFor(contentOf())).toMatch(/margin-left:\s*220px/);
    expect(JSON.parse(localStorage.getItem("sidebar-expanded")!)).toBe(true);
  });

  it("restores an expanded sidebar from storage", async () => {
    localStorage.setItem("sidebar-expanded", "true");
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);

    await waitFor(() => expect(toggle().getAttribute("aria-label")).toBe("Collapse sidebar"));
    expect(rulesFor(contentOf())).toMatch(/margin-left:\s*220px/);
  });

  it("ignores an unreadable stored sidebar state", () => {
    localStorage.setItem("sidebar-expanded", "{not json");
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);

    expect(toggle()).toBeTruthy();
  });

  it("pads content by the published bottom chrome, so it clears the tab bar and player", () => {
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    const css = rulesFor(contentOf());
    expect(css).toMatch(/padding-bottom:\s*calc\(var\(--chrome-bottom\) \+ 16px\)/);
    expect(css).toMatch(/padding-bottom:\s*calc\(var\(--chrome-bottom\) \+ 24px\)/);
    expect(css).toMatch(/padding-top:\s*var\(--content-pt\)/);
  });

  it("caps the status bar with an opaque strip that has no backdrop blur", () => {
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    const css = rulesFor(screen.getByTestId("status-bar-strip"));
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/height:\s*var\(--safe-top\)/);
    expect(css).not.toMatch(/backdrop-filter/);
  });

  it("gives the tab bar the bottom safe area and rounded-corner side insets", () => {
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    const css = rulesFor(screen.getByTestId("mobile-tab-bar"));
    expect(css).toMatch(/height:\s*var\(--tabbar-h\)/);
    expect(css).toMatch(/padding-bottom:\s*var\(--safe-bottom\)/);
    expect(css).toMatch(/padding-left:\s*max\(16px, env\(safe-area-inset-left/);
    expect(css).toMatch(/padding-right:\s*max\(16px, env\(safe-area-inset-right/);
  });

  it("leaves the tab bar var alone on a normal route", () => {
    renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    expect(document.documentElement.hasAttribute("data-tabbar-hidden")).toBe(false);
  });

  it("zeroes the tab bar var on a fullscreen edit route and restores it on leaving", () => {
    pathname.value = "/tracks/1/edit";
    const { unmount } = renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
    expect(document.documentElement.hasAttribute("data-tabbar-hidden")).toBe(true);
    unmount();
    expect(document.documentElement.hasAttribute("data-tabbar-hidden")).toBe(false);
  });

  describe("playback target", () => {
    afterEach(() => {
      playback.label = null;
      usePlaybackTargetDialog.setState({ open: false });
    });

    it("has no trigger when playback targets are unavailable", () => {
      renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
      expect(screen.queryByRole("button", { name: /^Playback:/, hidden: true })).toBeNull();
    });

    it("opens the Play on picker from the sidebar foot", async () => {
      playback.label = "Lounge";
      const { user } = renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
      await user.click(screen.getByRole("button", { name: "Playback: Lounge", hidden: true }));
      expect(usePlaybackTargetDialog.getState().open).toBe(true);
    });

    it("opens the Play on picker from the More sheet", async () => {
      playback.label = "This Mac";
      const { user } = renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
      await user.click(screen.getByRole("button", { name: /^More$/, hidden: true }));
      await user.click(await screen.findByText("Playback: This Mac"));
      expect(usePlaybackTargetDialog.getState().open).toBe(true);
    });
  });
  describe("navigation current state", () => {
    const sidebarLink = (name: string) => {
      const sidebar = sidebarOf();
      return [...sidebar.querySelectorAll("a")].find((a) => a.getAttribute("title") === name)!;
    };
    const isActive = (name: string) => /ink/.test(rulesFor(sidebarLink(name)));

    it("lists Home first, ahead of Tracks at /tracks", () => {
      renderWithProviders(<AppShell developerToolsEnabled={false}>page</AppShell>);
      const links = [...sidebarOf().querySelectorAll("a")];
      expect(links.slice(0, 2).map((a) => a.getAttribute("href"))).toEqual(["/", "/tracks"]);
    });

    it("marks Home active only on /", () => {
      pathname.value = "/";
      renderWithProviders(<AppShell developerToolsEnabled={false}>page</AppShell>);
      expect(isActive("Home")).toBe(true);
      expect(isActive("Tracks")).toBe(false);
    });

    it.each(["/tracks", "/tracks/123"])("marks Tracks active, not Home, at %s", (path) => {
      pathname.value = path;
      renderWithProviders(<AppShell developerToolsEnabled={false}>page</AppShell>);
      expect(isActive("Tracks")).toBe(true);
      expect(isActive("Home")).toBe(false);
    });
  });

  describe("phone tab bar", () => {
    it("shows Home, Tracks, Albums, Genres, Spins and More, with Playlists under More", async () => {
      const { user } = renderWithProviders(<AppShell developerToolsEnabled>page</AppShell>);
      const bar = screen.getByTestId("mobile-tab-bar");
      const labels = [...bar.querySelectorAll("a, button")].map((el) => el.textContent);
      expect(labels).toEqual(["Home", "Tracks", "Albums", "Genres", "Spins", "More"]);
      expect(within(bar).queryByText("Playlists")).toBeNull();

      await user.click(within(bar).getByRole("button", { name: /^More$/, hidden: true }));
      // The sidebar has a Playlists link too; the sheet adds a second one.
      await waitFor(() =>
        expect(screen.getAllByRole("link", { name: /Playlists/, hidden: true })).toHaveLength(2),
      );
    });
  });
});
