// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import {
  InAppNavigationProvider,
  useCanGoBack,
  useGoBack,
} from "@/providers/InAppNavigationProvider";

const nav = vi.hoisted(() => ({
  pathname: "/albums",
  search: "",
  nullSearch: false,
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => (nav.nullSearch ? null : new URLSearchParams(nav.search)),
  useRouter: () => ({ back: nav.back }),
}));

function setup() {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <InAppNavigationProvider>{children}</InAppNavigationProvider>
  );
  const hook = renderHook(() => ({ canGoBack: useCanGoBack(), goBack: useGoBack() }), { wrapper });
  const navigate = (pathname: string, search = "") => {
    nav.pathname = pathname;
    nav.search = search;
    hook.rerender();
  };
  return { ...hook, navigate };
}

beforeEach(() => {
  nav.pathname = "/albums";
  nav.search = "";
  nav.nullSearch = false;
  nav.back.mockReset();
});

describe("InAppNavigationProvider", () => {
  it("cannot go back on the first page (deep link, new tab, refresh)", () => {
    const { result } = setup();
    expect(result.current.canGoBack).toBe(false);
  });

  it("can go back after a route change", () => {
    const { result, navigate } = setup();
    act(() => navigate("/albums/r1"));
    expect(result.current.canGoBack).toBe(true);
  });

  it("counts a query-only change as an entry", () => {
    const { result, navigate } = setup();
    act(() => navigate("/albums", "sort=title"));
    expect(result.current.canGoBack).toBe(true);
  });

  it("does not count a rerender at the same location", () => {
    const { result, rerender } = setup();
    rerender();
    expect(result.current.canGoBack).toBe(false);
  });

  it("takes an entry off when the user steps back, and never goes below zero", () => {
    const { result, navigate } = setup();
    act(() => navigate("/albums/r1"));
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
      navigate("/albums");
    });
    expect(result.current.canGoBack).toBe(false);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
      navigate("/albums/r1");
    });
    expect(result.current.canGoBack).toBe(false);
    act(() => navigate("/albums/r1/edit"));
    expect(result.current.canGoBack).toBe(true);
  });

  it("copes with no search params at all", () => {
    nav.nullSearch = true;
    const { result, navigate } = setup();
    act(() => navigate("/albums/r1"));
    expect(result.current.canGoBack).toBe(true);
  });

  it("goBack calls router.back()", () => {
    const { result } = setup();
    result.current.goBack();
    expect(nav.back).toHaveBeenCalledTimes(1);
  });

  it("removes its popstate listener on unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<InAppNavigationProvider>x</InAppNavigationProvider>);
    unmount();
    expect(remove).toHaveBeenCalledWith("popstate", expect.any(Function));
  });
});

describe("outside a provider", () => {
  it("cannot go back and goBack does nothing", () => {
    const { result } = renderHook(() => ({ can: useCanGoBack(), go: useGoBack() }));
    expect(result.current.can).toBe(false);
    expect(() => result.current.go()).not.toThrow();
    expect(nav.back).not.toHaveBeenCalled();
  });
});
