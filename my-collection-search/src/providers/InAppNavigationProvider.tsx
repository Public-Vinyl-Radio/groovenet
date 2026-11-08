"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type InAppNavigation = {
  /** True when the previous history entry is a page of this app. */
  canGoBack: boolean;
  /** Go back one entry; only meaningful when `canGoBack`. */
  goBack: () => void;
};

const noHistory: InAppNavigation = { canGoBack: false, goBack: () => {} };

const InAppNavigationContext = createContext<InAppNavigation>(noHistory);

/**
 * Counts how many in-app entries sit behind the current one, so a back button
 * can tell `router.back()` (a page of ours) from leaving the site (deep link,
 * new tab, hard refresh). Every route or query change after the first render
 * adds an entry; a back/forward step (`popstate`) takes one off.
 */
export function InAppNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const location = `${pathname}?${search}`;

  const [depth, setDepth] = useState(0);
  const lastLocation = useRef(location);
  const popped = useRef(false);

  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (lastLocation.current === location) return;
    lastLocation.current = location;
    // popstate fires just before the location changes; a step back (or
    // forward, which this treats alike) is not a new entry.
    const step = popped.current ? -1 : 1;
    popped.current = false;
    setDepth((current) => Math.max(0, current + step));
  }, [location]);

  const goBack = useCallback(() => router.back(), [router]);
  const value = useMemo(() => ({ canGoBack: depth > 0, goBack }), [depth, goBack]);

  return (
    <InAppNavigationContext.Provider value={value}>{children}</InAppNavigationContext.Provider>
  );
}

/** Whether `router.back()` stays in the app; false outside a provider. */
export function useCanGoBack(): boolean {
  return useContext(InAppNavigationContext).canGoBack;
}

/** Go back one in-app entry; a no-op outside a provider. */
export function useGoBack(): () => void {
  return useContext(InAppNavigationContext).goBack;
}
