// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PageHeader from ".";
import { InAppNavigationProvider } from "@/providers/InAppNavigationProvider";

const nav = vi.hoisted(() => ({ pathname: "/albums", back: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: nav.back }),
}));

/** Render inside the provider; `navigate` is an in-app route change. */
function renderWithHistory(header: React.ReactElement) {
  const ui = () => <InAppNavigationProvider>{header}</InAppNavigationProvider>;
  const result = renderWithProviders(ui());
  const navigate = (pathname: string) => {
    nav.pathname = pathname;
    act(() => result.rerender(ui()));
  };
  return { ...result, navigate };
}

const action = (label: string, onClick = vi.fn()) => ({ label, icon: <span>i</span>, onClick });

describe("PageHeader", () => {
  it("renders a title only", () => {
    renderWithProviders(<PageHeader title="Albums" />);
    expect(screen.getByRole("heading", { level: 1, name: "Albums" })).toBeTruthy();
    expect(screen.queryByTestId("page-header-count")).toBeNull();
    expect(screen.queryByTestId("page-header-leading")).toBeNull();
    expect(screen.queryByRole("button", { hidden: true })).toBeNull();
  });

  it("shows a numeric count localised, and a string count verbatim", () => {
    const { rerender } = renderWithProviders(<PageHeader title="Tracks" count={1234} />);
    expect(screen.getByTestId("page-header-count").textContent).toBe((1234).toLocaleString());
    rerender(<PageHeader title="Tracks" count="12 of 40" />);
    expect(screen.getByTestId("page-header-count").textContent).toBe("12 of 40");
  });

  it("shows a summary as desktop-only meta, after the count when there is one", () => {
    const { rerender } = renderWithProviders(<PageHeader title="Home" summary="4 tracks" />);
    expect(getComputedStyle(screen.getByTestId("page-header-meta")).display).toBe("none");
    expect(screen.getByTestId("page-header-summary").textContent).toBe("4 tracks");
    rerender(<PageHeader title="Home" count={2} summary="4 tracks" />);
    expect(getComputedStyle(screen.getByTestId("page-header-meta")).display).toBe("block");
    expect(getComputedStyle(screen.getByTestId("page-header-summary")).display).toBe("none");
    expect(screen.getByTestId("page-header-meta").textContent).toBe("2 · 4 tracks");
  });

  it("puts desktop actions at the right of the title row, desktop only (#794)", () => {
    renderWithProviders(<PageHeader title="Tracks" desktopActions={<button>Select</button>} />);
    const slot = screen.getByTestId("page-header-desktop-actions");
    expect(slot.textContent).toBe("Select");
    expect(getComputedStyle(slot).display).toBe("none");
  });

  it("renders leading content", () => {
    renderWithProviders(<PageHeader title="Track" leading={<button>Back to Tracks</button>} />);
    expect(screen.getByRole("button", { name: "Back to Tracks" })).toBeTruthy();
  });

  it("renders one and two actions as labelled buttons that fire", () => {
    const onClick = vi.fn();
    renderWithProviders(
      <PageHeader title="Albums" actions={[action("Sort", onClick), action("Search")]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort", hidden: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Search", hidden: true })).toBeTruthy();
  });

  it("disables an action while it is busy", () => {
    const onClick = vi.fn();
    renderWithProviders(
      <PageHeader title="Edit" actions={[{ ...action("Save", onClick), disabled: true }]} />,
    );
    const save = screen.getByRole("button", { name: "Save", hidden: true }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders a trailing control after the actions", () => {
    renderWithProviders(<PageHeader title="Album" trailing={<button>Album actions</button>} />);
    expect(screen.getByRole("button", { name: "Album actions", hidden: true })).toBeTruthy();
  });

  it("drops a third action rather than crowding the bar", () => {
    renderWithProviders(
      <PageHeader title="Albums" actions={[action("A"), action("B"), action("C")]} />,
    );
    expect(screen.queryByRole("button", { name: "C", hidden: true })).toBeNull();
  });

  it("opens an overflow menu and runs the chosen item", async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <PageHeader title="Genres" overflow={[{ label: "Show empty genres", onClick }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "More actions", hidden: true }));
    fireEvent.click(await screen.findByText("Show empty genres"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("flags <html> while mounted so the shell drops its legacy padding", () => {
    const { unmount } = renderWithProviders(<PageHeader title="Chores" />);
    expect(document.documentElement.hasAttribute("data-page-header")).toBe(true);
    unmount();
    expect(document.documentElement.hasAttribute("data-page-header")).toBe(false);
  });

  describe("breadcrumbs", () => {
    const trail = [
      { label: "Tracks", href: "/tracks" },
      { label: "Blue Lines", href: "/albums/r1" },
      { label: "Unfinished Sympathy" },
    ];

    it("gives phones a back button to the last parent, and md+ the trail", () => {
      renderWithProviders(<PageHeader title="Unfinished Sympathy" breadcrumbs={trail} />);
      const back = screen.getByRole("link", { name: "Back to Blue Lines", hidden: true });
      expect(back.getAttribute("href")).toBe("/albums/r1");
      expect(screen.getByTestId("page-header-breadcrumbs")).toBeTruthy();
      expect(screen.getByRole("heading", { level: 1, name: "Unfinished Sympathy" })).toBeTruthy();
    });

    it("targets the only parent when there are two crumbs", () => {
      renderWithProviders(
        <PageHeader
          title="Song"
          breadcrumbs={[{ label: "Tracks", href: "/tracks" }, { label: "Song" }]}
        />,
      );
      expect(
        screen.getByRole("link", { name: "Back to Tracks", hidden: true }).getAttribute("href"),
      ).toBe("/tracks");
    });

    it("has no back button with a single crumb or an unlinked parent", () => {
      const { rerender } = renderWithProviders(
        <PageHeader title="Song" breadcrumbs={[{ label: "Song" }]} />,
      );
      expect(screen.queryByRole("link", { name: /Back to/, hidden: true })).toBeNull();
      rerender(<PageHeader title="Song" breadcrumbs={[{ label: "Tracks" }, { label: "Song" }]} />);
      expect(screen.queryByRole("link", { name: /Back to/, hidden: true })).toBeNull();
    });

    it("renders no trail for an empty list", () => {
      renderWithProviders(<PageHeader title="Song" breadcrumbs={[]} />);
      expect(screen.queryByTestId("page-header-breadcrumbs")).toBeNull();
    });

    it("goes back in history, labelled plain Back, when the previous entry is in-app", async () => {
      nav.pathname = "/albums";
      nav.back.mockReset();
      const { user, navigate } = renderWithHistory(
        <PageHeader title="Unfinished Sympathy" breadcrumbs={trail} />,
      );
      expect(screen.queryByRole("button", { name: "Back", hidden: true })).toBeNull();
      expect(screen.getByRole("link", { name: "Back to Blue Lines", hidden: true })).toBeTruthy();
      navigate("/albums/r1");
      const button = screen.getByRole("button", { name: "Back", hidden: true });
      expect(screen.queryByRole("link", { name: /Back to/, hidden: true })).toBeNull();
      await user.click(button);
      expect(nav.back).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("page-header-breadcrumbs")).toBeTruthy();
    });

    it("keeps the leading override when there is history", () => {
      nav.pathname = "/albums";
      const { navigate } = renderWithHistory(
        <PageHeader title="Song" breadcrumbs={trail} leading={<button>Custom back</button>} />,
      );
      navigate("/albums/r1");
      expect(screen.getByRole("button", { name: "Custom back" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Back", hidden: true })).toBeNull();
    });

    it("renders no back button without a parent, even with history", () => {
      nav.pathname = "/albums";
      const { navigate } = renderWithHistory(
        <PageHeader title="Albums" breadcrumbs={[{ label: "Albums" }]} />,
      );
      navigate("/tracks");
      expect(screen.queryByRole("button", { name: "Back", hidden: true })).toBeNull();
      expect(screen.queryByRole("link", { name: /Back to/, hidden: true })).toBeNull();
    });

    it("lets an explicit leading replace the generated back button", () => {
      renderWithProviders(
        <PageHeader title="Song" breadcrumbs={trail} leading={<button>Custom back</button>} />,
      );
      expect(screen.getByRole("button", { name: "Custom back" })).toBeTruthy();
      expect(screen.queryByRole("link", { name: /Back to/, hidden: true })).toBeNull();
    });
  });
});
