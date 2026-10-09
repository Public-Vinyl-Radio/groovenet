// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePullToRefresh } from "./usePullToRefresh";

function Harness({ enabled }: { enabled: boolean }) {
  const { distance, refreshing } = usePullToRefresh(enabled);
  return <output data-testid="state">{`${distance}:${refreshing}`}</output>;
}

function setup(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const result = render(
    <QueryClientProvider client={client}>
      <Harness enabled={enabled} />
    </QueryClientProvider>
  );
  return { ...result, invalidate };
}

function touch(type: string, x: number, y: number, target: EventTarget = window, touchCount = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" || type === "touchcancel"
      ? []
      : Array.from({ length: touchCount }, () => ({ clientX: x, clientY: y })),
  });
  act(() => target.dispatchEvent(event));
  return event;
}

afterEach(() => {
  Object.defineProperty(document, "scrollingElement", {
    configurable: true,
    value: document.documentElement,
  });
  document.documentElement.scrollTop = 0;
});

describe("usePullToRefresh", () => {
  it("refreshes after a downward pull past the threshold", async () => {
    const { invalidate } = setup();
    touch("touchstart", 40, 10);
    const move = touch("touchmove", 41, 140);
    expect(move.defaultPrevented).toBe(true);
    expect(screen.getByTestId("state").textContent).toBe("72:false");
    touch("touchend", 41, 140);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when the page is scrolled", () => {
    document.documentElement.scrollTop = 20;
    const { invalidate } = setup();
    touch("touchstart", 40, 10);
    touch("touchmove", 40, 180);
    touch("touchend", 40, 180);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not refresh when disabled for browser tabs", () => {
    const { invalidate } = setup(false);
    touch("touchstart", 40, 10);
    touch("touchmove", 40, 180);
    touch("touchend", 40, 180);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("ignores multi-touch and gestures that move sideways, upward, or too little", () => {
    const { invalidate } = setup();
    touch("touchstart", 40, 10, window, 2);
    touch("touchmove", 40, 140);
    touch("touchstart", 40, 10);
    touch("touchmove", 80, 20);
    touch("touchend", 80, 20);
    touch("touchstart", 40, 20);
    touch("touchmove", 40, 10);
    touch("touchend", 40, 10);
    touch("touchstart", 40, 10);
    touch("touchmove", 40, 15);
    touch("touchend", 40, 15);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("ignores gestures started inside a dialog and cancels an interrupted pull", () => {
    const { invalidate } = setup();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    touch("touchstart", 40, 10, dialog);
    touch("touchmove", 40, 140, dialog);
    touch("touchend", 40, 140, dialog);

    const ordinaryElement = document.createElement("span");
    document.body.append(ordinaryElement);
    touch("touchstart", 40, 10, ordinaryElement);
    touch("touchend", 40, 10, ordinaryElement);
    ordinaryElement.remove();

    touch("touchstart", 40, 10);
    touch("touchmove", 40, 140);
    touch("touchcancel", 40, 140);
    touch("touchend", 40, 140);
    expect(invalidate).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("stops tracking if the page starts scrolling during the gesture", () => {
    const { invalidate } = setup();
    touch("touchstart", 40, 10);
    document.documentElement.scrollTop = 10;
    touch("touchmove", 40, 140);
    touch("touchend", 40, 140);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
