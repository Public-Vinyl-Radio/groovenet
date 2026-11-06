// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useInfiniteScrollSentinel } from "./useInfiniteScrollSentinel";

const instances: { cb: (e: { isIntersecting: boolean }[]) => void; disconnect: () => void }[] = [];
class FakeObserver {
  disconnect = vi.fn();
  constructor(public cb: (e: { isIntersecting: boolean }[]) => void) {
    instances.push(this);
  }
  observe() {}
}

function Probe(props: { hasMore: boolean; loading: boolean; onLoadMore: () => void }) {
  const ref = useInfiniteScrollSentinel(props);
  return <div ref={ref} />;
}

describe("useInfiniteScrollSentinel", () => {
  afterEach(() => {
    instances.length = 0;
  });
  it("loads only when visible, idle and more remains", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const onLoadMore = vi.fn();
    const { rerender, unmount } = render(<Probe hasMore loading={false} onLoadMore={onLoadMore} />);
    instances[0].cb([{ isIntersecting: false }]);
    instances[0].cb([]);
    expect(onLoadMore).not.toHaveBeenCalled();
    instances[0].cb([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalledOnce();
    rerender(<Probe hasMore loading onLoadMore={onLoadMore} />);
    instances.at(-1)!.cb([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalledOnce();
    const count = instances.length;
    rerender(<Probe hasMore={false} loading={false} onLoadMore={onLoadMore} />);
    expect(instances).toHaveLength(count);
    unmount();
    expect(instances[0].disconnect).toHaveBeenCalled();
  });
});
