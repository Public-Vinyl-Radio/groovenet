"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const TRIGGER_DISTANCE = 72;
const START_DISTANCE = 8;

function isBlockedTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        '[role="dialog"], [aria-modal="true"], [data-no-pull-to-refresh], [data-rfd-draggable-id], [data-rfd-drag-handle-draggable-id], input, textarea, select, [contenteditable="true"]'
      )
    )
  );
}

export function usePullToRefresh(enabled: boolean) {
  const queryClient = useQueryClient();
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const pullingRef = useRef(false);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setDistance(0);
    }
  }, [queryClient]);

  useEffect(() => {
    if (!enabled) {
      distanceRef.current = 0;
      setDistance(0);
      return;
    }

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1 || isBlockedTarget(event.target)) return;
      const touch = event.touches[0];
      const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY;
      if (scrollTop > 0) return;
      startRef.current = { x: touch.clientX, y: touch.clientY };
      pullingRef.current = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!startRef.current || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        startRef.current = null;
        distanceRef.current = 0;
        setDistance(0);
        return;
      }
      if (dy <= 0) return;
      const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY;
      if (scrollTop > 0) {
        startRef.current = null;
        distanceRef.current = 0;
        setDistance(0);
        return;
      }
      if (dy > START_DISTANCE) {
        pullingRef.current = true;
        event.preventDefault();
        const nextDistance = Math.min((dy - START_DISTANCE) * 0.65, TRIGGER_DISTANCE);
        distanceRef.current = nextDistance;
        setDistance(nextDistance);
      }
    };

    const onTouchEnd = () => {
      if (!startRef.current) return;
      const shouldRefresh = pullingRef.current && distanceRef.current >= TRIGGER_DISTANCE;
      startRef.current = null;
      pullingRef.current = false;
      distanceRef.current = 0;
      if (shouldRefresh) void refresh();
      else setDistance(0);
    };

    const onTouchCancel = () => {
      startRef.current = null;
      pullingRef.current = false;
      distanceRef.current = 0;
      setDistance(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, refresh]);

  return { distance, refreshing };
}
