import React from "react";

/**
 * Infinite scroll: returns a ref for a sentinel element placed after the list.
 * `onLoadMore` fires whenever the sentinel is visible, more is available and no
 * load is in flight; the observer is rebuilt after each load so a sentinel that
 * is still on screen keeps pulling pages.
 */
export function useInfiniteScrollSentinel<T extends Element = HTMLDivElement>({
  hasMore,
  loading,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const ref = React.useRef<T>(null);
  React.useEffect(() => {
    const target = ref.current;
    if (!hasMore || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) onLoadMore();
      },
      { threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);
  return ref;
}
