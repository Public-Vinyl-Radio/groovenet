// Renders a component the way the app does — inside Chakra and a QueryClient —
// for suites that opt into `// @vitest-environment jsdom`. Import it only from
// such a suite: it installs the browser APIs Chakra's dialogs and menus reach
// for and jsdom lacks, and a node-environment suite has no `window` to stub.
//
// jsdom evaluates no stylesheet media queries here (see `disableMediaRules`), so
// a component with a mobile and a desktop layout switched by responsive
// `display` renders both, with only the base (mobile) one accessible. Query the
// desktop one with `{ hidden: true }`.
import React from "react";
import { afterEach, expect } from "vitest";
import { cleanup, render, screen, waitFor, type RenderOptions } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "@/components/ui/provider";

/** Desktop by default; set below the `md` breakpoint (48em) for mobile layouts. */
let viewportWidth = 1280;

/** The width `matchMedia` answers `min-width` queries against. */
export function setViewportWidth(width: number) {
  viewportWidth = width;
}

function matchesMinWidth(query: string): boolean {
  const match = /min-width:\s*([\d.]+)(px|em|rem)/.exec(query);
  if (!match) return false;
  const value = Number(match[1]) * (match[2] === "px" ? 1 : 16);
  return viewportWidth >= value;
}

/**
 * jsdom 30 matched no stylesheet `@media` rule, so Chakra's responsive styles
 * rendered their base (phone) values and the suites are written against that.
 * jsdom 31 evaluates them against a fixed 1024x768 window that nothing can
 * resize, so `(min-width: 768px)` always matches and the desktop layout would
 * hide the phone one whatever `setViewportWidth` says. Each width rule is
 * switched off again; `matchMedia` (below) is what follows the viewport.
 */
let mediaSignature = "";

function disableMediaRules() {
  const sheets = Array.from(document.styleSheets);
  const signature = `${sheets.length}:${sheets.reduce((n, sheet) => n + sheet.cssRules.length, 0)}`;
  if (signature === mediaSignature) return;
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule && /width/.test(rule.media.mediaText)) {
        rule.media.mediaText = "not all";
      }
      if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of sheets) walk(sheet.cssRules);
  mediaSignature = signature;
}

const nativeGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((...args: Parameters<typeof nativeGetComputedStyle>) => {
  disableMediaRules();
  return nativeGetComputedStyle(...args);
}) as typeof window.getComputedStyle;

// jsdom 31 computes `animation-name` and `transition-*` from Chakra's recipes
// (jsdom 30 left them empty), so Ark's Presence waits for an `animationend`
// jsdom never fires and a closed dialog, menu or popover stays mounted. Run
// everything instantly, as `prefers-reduced-motion` would in a browser.
const noMotion = document.createElement("style");
noMotion.dataset.testNoMotion = "";
noMotion.textContent =
  "*, *::before, *::after { animation: none !important; transition: none !important; }";
document.head.appendChild(noMotion);

window.matchMedia = (query: string) =>
  ({
    matches: matchesMinWidth(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.scrollTo = () => {};
Element.prototype.scrollTo ??= () => {};

// Vitest runs without globals here, so Testing Library cannot register its own
// cleanup; without this, one test's portals are still open in the next.
afterEach(() => cleanup());

export function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  // A wrapper rather than wrapping `ui`, so `rerender` keeps the providers.
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Provider>{children}</Provider>
    </QueryClientProvider>
  );
  const result = render(ui, { wrapper, ...options });
  return { ...result, user, queryClient };
}

/**
 * Show what a desktop viewport would: jsdom evaluates no media queries, so the
 * desktop layout stays `display: none`, and since jsdom 30.1.2 (like a browser)
 * `focus()` is a no-op inside it. An inline `display` outranks the stylesheet.
 */
function showAncestors(el: HTMLElement) {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).display === "none") node.style.display = "block";
  }
}

/**
 * Choose an item from a Chakra menu by keyboard. Ark selects a clicked item
 * only once a pointer move has highlighted it, which jsdom stops honouring
 * after a few tests; the keyboard path has no such state.
 */
export async function chooseMenuItem(user: UserEvent, trigger: HTMLElement, name: RegExp) {
  showAncestors(trigger);
  trigger.focus();
  await user.keyboard("{Enter}");
  const item = await screen.findByRole("menuitem", { name, hidden: true });
  // Opening by keyboard highlights the first item; walk down to this one.
  await waitFor(() =>
    expect(item.closest("[role=menu]")?.querySelector("[data-highlighted]")).toBeTruthy(),
  );
  const itemCount = screen.getAllByRole("menuitem", { hidden: true }).length;
  for (let step = 0; step < itemCount && !item.hasAttribute("data-highlighted"); step++) {
    await user.keyboard("{ArrowDown}");
  }
  await user.keyboard("{Enter}");
}
