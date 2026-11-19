"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Flex, Text } from "@chakra-ui/react";
import RetroDialog from "@/components/ui/RetroDialog";
import { afterClosingDialogs, registerNavigationGuard } from "@/lib/navigationGuard";

/** Marks the extra history entry that holds the back button while there are unsaved changes. */
export const GUARD_HISTORY_KEY = "__gnUnsavedChanges";

type Options = {
  /** Unsaved work the page would lose. Only real edits: never a view or sort-profile choice. */
  dirty: boolean;
  /** Saves it; resolve `false` when the save failed, so the page stays. */
  onSave: () => Promise<boolean | void>;
  /** What is unsaved, named in the dialog ("Order changed · by Selector"). */
  summary: string;
};

// A pop a guard causes itself (taking its entry off history) isn't the user's back.
// Shared, as it can land after the page that caused it has remounted; it lapses
// after a moment, so one that never arrives can't swallow a later real back.
const OWN_POP_MS = 1000;
let ownPopUntil = 0;
const expectOwnPop = () => {
  ownPopUntil = Date.now() + OWN_POP_MS;
};
const takeOwnPop = () => {
  const own = Date.now() < ownPopUntil;
  ownPopUntil = 0;
  return own;
};

const atGuardEntry = () =>
  Boolean((window.history.state as Record<string, unknown> | null)?.[GUARD_HISTORY_KEY]);

const pushGuardEntry = () =>
  window.history.pushState(
    { ...(window.history.state as object | null), [GUARD_HISTORY_KEY]: true },
    "",
    window.location.href,
  );

/** True for a click the browser would turn into a same-tab, in-app page change. */
function inAppNavigation(event: MouseEvent): URL | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // The same page (a hash, or the link to where we are) isn't leaving it.
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null;
  }
  return url;
}

/**
 * Asks before a page with unsaved work is left (#1231). While `dirty`, every way
 * out within the app opens one `RetroDialog` offering Save and leave, Leave
 * without saving, and Stay (focused):
 *
 * - in-app links (nav, breadcrumbs, track and album links): a capture-phase
 *   click handler on same-origin `<a>`s; modified and new-tab clicks pass;
 * - programmatic navigation through `useGuardedRouter` (the palette, menus);
 * - the browser or phone back button: an extra history entry for this page,
 *   caught on `popstate`, and taken off again once the page is clean, so back
 *   and forward work as before.
 *
 * Reload, closing the tab and typing a URL keep the browser's own
 * `beforeunload` prompt, which no page can replace. Render the returned
 * `dialog`.
 */
export function useUnsavedChangesGuard({ dirty, onSave, summary }: Options) {
  const router = useRouter();
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const stayRef = useRef<HTMLButtonElement>(null);
  const onSaveRef = useRef(onSave);
  const routerRef = useRef(router);
  useEffect(() => {
    onSaveRef.current = onSave;
    routerRef.current = router;
  });
  const dirtyRef = useRef(false);
  // Set while this page is leaving on the user's word, so nothing asks again.
  const leaving = useRef(false);

  const ask = useCallback((proceed: () => void) => {
    afterClosingDialogs(() => setPending(() => proceed));
  }, []);

  // Leaves without asking again. The guard entry comes off history first, so the
  // page being left doesn't linger behind the next one.
  const leave = useCallback((proceed: () => void) => {
    leaving.current = true;
    setPending(null);
    if (!atGuardEntry()) {
      proceed();
      return;
    }
    const done = () => {
      window.removeEventListener("popstate", done);
      proceed();
    };
    window.addEventListener("popstate", done);
    expectOwnPop();
    window.history.back();
  }, []);

  // One listener for the page's life, so a pop this hook caused is recognised
  // even when it lands after the page went clean, or dirty again.
  useEffect(() => {
    const onPopState = () => {
      if (takeOwnPop()) {
        if (dirtyRef.current && !leaving.current && !atGuardEntry()) pushGuardEntry();
        return;
      }
      if (!dirtyRef.current || leaving.current || atGuardEntry()) return;
      // Back took us off the guard entry: put it back so the page stays, then ask.
      pushGuardEntry();
      ask(() => window.history.back());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [ask]);

  useEffect(() => {
    if (!dirty) return;
    dirtyRef.current = true;
    leaving.current = false;

    const unregister = registerNavigationGuard(({ proceed }) => {
      if (leaving.current) return false;
      ask(proceed);
      return true;
    });

    const onClick = (event: MouseEvent) => {
      if (leaving.current) return;
      const url = inAppNavigation(event);
      if (!url) return;
      event.preventDefault();
      event.stopPropagation();
      ask(() => routerRef.current.push(`${url.pathname}${url.search}${url.hash}`));
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    if (!atGuardEntry()) pushGuardEntry();
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      dirtyRef.current = false;
      unregister();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Saved or discarded, still on this page: take the entry off again.
      if (!leaving.current && atGuardEntry()) {
        expectOwnPop();
        window.history.back();
      }
    };
  }, [dirty, ask]);

  const stay = () => setPending(null);
  // The navigation the open dialog holds; its buttons only show while it is open.
  const proceed = pending as () => void;
  const saveAndLeave = async () => {
    setSaving(true);
    // Saving makes the page clean; marked as leaving first, the cleanup leaves the
    // guard entry for `leave` to take off, rather than both stepping back.
    leaving.current = true;
    try {
      const saved = await onSaveRef.current();
      if (saved === false) leaving.current = false;
      else leave(proceed);
    } catch {
      leaving.current = false;
    } finally {
      setSaving(false);
    }
  };

  const dialog = (
    <RetroDialog
      open={pending !== null}
      // Open only while a navigation waits, so any change is a close: Stay.
      onOpenChange={stay}
      role="alertdialog"
      title="Unsaved changes"
      dismissible={!saving}
      initialFocusEl={() => stayRef.current}
      footer={
        <Flex justify="flex-end" gap={2} p="12px 14px" wrap="wrap">
          <Button
            ref={stayRef}
            size="sm"
            variant="outline"
            minH={{ base: "44px", md: "auto" }}
            disabled={saving}
            onClick={stay}
          >
            Stay
          </Button>
          <Button
            size="sm"
            variant="ghost"
            colorPalette="danger"
            minH={{ base: "44px", md: "auto" }}
            disabled={saving}
            onClick={() => leave(proceed)}
          >
            Leave without saving
          </Button>
          <Button
            size="sm"
            variant="solid"
            colorPalette="accent"
            minH={{ base: "44px", md: "auto" }}
            loading={saving}
            onClick={() => void saveAndLeave()}
          >
            Save and leave
          </Button>
        </Flex>
      }
    >
      <Flex direction="column" gap={1} p="14px">
        <Text fontWeight="semibold" data-testid="unsaved-changes-summary">
          {summary}
        </Text>
        <Text fontSize="sm" color="fg.muted">
          These changes aren’t saved yet. Leaving drops them.
        </Text>
      </Flex>
    </RetroDialog>
  );

  return { dialog };
}
