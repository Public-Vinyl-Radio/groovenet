// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { afterClosingDialogs, guardNavigation, registerNavigationGuard } from "./navigationGuard";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("navigation guard registry (#1231)", () => {
  it("runs the navigation with no guard, and lets the latest guard take it over", () => {
    const proceed = vi.fn();
    guardNavigation(proceed);
    expect(proceed).toHaveBeenCalledOnce();

    const older = vi.fn(() => true);
    const newer = vi.fn(() => false);
    const removeOlder = registerNavigationGuard(older);
    const removeNewer = registerNavigationGuard(newer);
    guardNavigation(proceed, "/tracks");
    expect(newer).toHaveBeenCalledWith({ proceed, href: "/tracks" });
    expect(older).not.toHaveBeenCalled();
    expect(proceed).toHaveBeenCalledTimes(2);

    removeNewer();
    guardNavigation(proceed);
    expect(older).toHaveBeenCalledOnce();
    expect(proceed).toHaveBeenCalledTimes(2);
    removeOlder();
    removeOlder();
    guardNavigation(proceed);
    expect(proceed).toHaveBeenCalledTimes(3);
  });
});

describe("afterClosingDialogs", () => {
  const closing = () => {
    const el = document.createElement("div");
    el.dataset.scope = "dialog";
    el.dataset.part = "content";
    el.dataset.state = "closed";
    document.body.append(el);
    return el;
  };

  it("runs on the next tick when nothing is closing", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    afterClosingDialogs(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("waits for a closing dialog to unmount", () => {
    vi.useFakeTimers();
    const el = closing();
    const fn = vi.fn();
    afterClosingDialogs(fn);
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    el.remove();
    vi.advanceTimersByTime(20);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("stops waiting after the timeout", () => {
    vi.useFakeTimers();
    closing();
    const fn = vi.fn();
    afterClosingDialogs(fn, 200);
    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });
});
