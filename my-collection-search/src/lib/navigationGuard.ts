/**
 * In-app navigation that a page can hold back (#1231). The App Router can't
 * block a route change, so code that navigates programmatically (the command
 * palette, menu actions) goes through `guardNavigation`, and a page with
 * unsaved work registers a guard that takes the navigation over and asks
 * first. Links and the back button are caught by `useUnsavedChangesGuard`
 * itself; this covers `router.push` and friends.
 */

export type NavigationAttempt = {
  /** Carries the navigation out; the guard calls it once the user agrees. */
  proceed: () => void;
  /** Where it goes, when known. */
  href?: string;
};

/** Returns true when it takes the navigation over (and will call `proceed` itself, or not). */
export type NavigationGuard = (attempt: NavigationAttempt) => boolean;

const guards: NavigationGuard[] = [];

/** Adds a guard; the latest one registered decides. Returns its removal. */
export function registerNavigationGuard(guard: NavigationGuard): () => void {
  guards.push(guard);
  return () => {
    const index = guards.lastIndexOf(guard);
    if (index >= 0) guards.splice(index, 1);
  };
}

/** Runs `proceed` now, unless a registered guard takes the navigation over. */
export function guardNavigation(proceed: () => void, href?: string): void {
  const guard = guards[guards.length - 1];
  if (guard && guard({ proceed, href })) return;
  proceed();
}

// A dialog whose content is still mounted but closed is playing its exit; a
// layer opened over it is dismissed with it once it unmounts (zag's layer stack).
const CLOSING_DIALOG = '[data-scope="dialog"][data-part="content"][data-state="closed"]';
const POLL_MS = 16;

/**
 * Calls `fn` once no dialog is mid-close, so a dialog opened from a closing
 * palette or sheet isn't dismissed with it. Waits a tick first, as the caller
 * usually closes its own dialog just after asking; gives up waiting after
 * `timeout` ms.
 */
export function afterClosingDialogs(fn: () => void, timeout = 1000): void {
  const started = Date.now();
  const tick = () => {
    if (!document.querySelector(CLOSING_DIALOG) || Date.now() - started > timeout) fn();
    else window.setTimeout(tick, POLL_MS);
  };
  window.setTimeout(tick, 0);
}
