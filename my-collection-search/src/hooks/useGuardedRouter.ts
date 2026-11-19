"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { guardNavigation } from "@/lib/navigationGuard";

type Router = ReturnType<typeof useRouter>;

/**
 * `useRouter`, with `push`, `replace` and `back` checked against the page's
 * navigation guard first (#1231): a page with unsaved work asks before it is
 * left. Use it for any programmatic navigation that can leave a page.
 */
export function useGuardedRouter(): Router {
  const router = useRouter();
  return useMemo<Router>(
    () => ({
      ...router,
      // The caller's arguments pass through as given.
      push: (...args) => guardNavigation(() => router.push(...args), args[0]),
      replace: (...args) => guardNavigation(() => router.replace(...args), args[0]),
      back: () => guardNavigation(() => router.back()),
    }),
    [router],
  );
}
