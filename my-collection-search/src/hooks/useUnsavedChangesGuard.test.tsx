// @vitest-environment jsdom
import React from "react";
import NextLink from "next/link";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { guardNavigation } from "@/lib/navigationGuard";
import { GUARD_HISTORY_KEY, useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

function Page({ dirty, onSave }: { dirty: boolean; onSave: () => Promise<boolean | void> }) {
  const { dialog } = useUnsavedChangesGuard({ dirty, onSave, summary: "Order changed" });
  return (
    <>
      <NextLink href="/tracks">Tracks</NextLink>
      <NextLink href="/playlists/1#top">Same page</NextLink>
      <a href="https://example.com/x">Elsewhere</a>
      <a href="/albums" target="_blank">
        New tab
      </a>
      {dialog}
    </>
  );
}

const atGuardEntry = () =>
  Boolean((window.history.state as Record<string, unknown> | null)?.[GUARD_HISTORY_KEY]);

beforeEach(() => {
  window.history.replaceState(null, "", "/playlists/1");
});
afterEach(async () => {
  cleanup();
  // A history step the hook took on unmount lands asynchronously: let it, before the next test.
  await new Promise((resolve) => setTimeout(resolve, 50));
  vi.clearAllMocks();
});

describe("useUnsavedChangesGuard (#1231)", () => {
  it("asks before an in-app link leaves, and Stay keeps the page", async () => {
    const { user } = renderWithProviders(<Page dirty onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("Tracks"));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Order changed")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("leaves without saving to the link's page, after taking its history entry off", async () => {
    const { user } = renderWithProviders(<Page dirty onSave={vi.fn()} />);
    expect(atGuardEntry()).toBe(true);
    fireEvent.click(screen.getByText("Tracks"));
    await user.click(await screen.findByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/tracks"));
    expect(atGuardEntry()).toBe(false);
  });

  it("saves, then leaves", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const { user } = renderWithProviders(<Page dirty onSave={onSave} />);
    fireEvent.click(screen.getByText("Tracks"));
    await user.click(await screen.findByRole("button", { name: "Save and leave" }));
    expect(onSave).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/tracks"));
  });

  it("stays when the save fails", async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const { user } = renderWithProviders(<Page dirty onSave={onSave} />);
    fireEvent.click(screen.getByText("Tracks"));
    await user.click(await screen.findByRole("button", { name: "Save and leave" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("stays when the save throws", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("down"));
    const { user } = renderWithProviders(<Page dirty onSave={onSave} />);
    fireEvent.click(screen.getByText("Tracks"));
    await user.click(await screen.findByRole("button", { name: "Save and leave" }));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("lets modified clicks, new tabs, other sites and the same page through", () => {
    renderWithProviders(<Page dirty onSave={vi.fn()} />);
    const clicks: [string, MouseEventInit][] = [
      ["Tracks", { metaKey: true }],
      ["Tracks", { ctrlKey: true }],
      ["Tracks", { button: 1 }],
      ["New tab", {}],
      ["Elsewhere", {}],
      ["Same page", {}],
    ];
    for (const [text, init] of clicks) {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
      screen.getByText(text).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it("asks before programmatic navigation (the palette, menus)", async () => {
    const proceed = vi.fn();
    const { user } = renderWithProviders(<Page dirty onSave={vi.fn()} />);
    act(() => guardNavigation(proceed, "/albums"));
    await user.click(await screen.findByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect(proceed).toHaveBeenCalledOnce());
  });

  it("asks when back takes the page off its entry, and puts the entry back", async () => {
    renderWithProviders(<Page dirty onSave={vi.fn()} />);
    expect(atGuardEntry()).toBe(true);
    act(() => window.history.back());
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(atGuardEntry()).toBe(true);
  });

  it("warns on reload or close while dirty", () => {
    renderWithProviders(<Page dirty onSave={vi.fn()} />);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("guards nothing while clean, and takes its entry off once clean again", async () => {
    const proceed = vi.fn();
    const { rerender } = renderWithProviders(<Page dirty={false} onSave={vi.fn()} />);
    expect(atGuardEntry()).toBe(false);
    guardNavigation(proceed);
    expect(proceed).toHaveBeenCalledOnce();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByText("Tracks").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    rerender(<Page dirty onSave={vi.fn()} />);
    expect(atGuardEntry()).toBe(true);
    rerender(<Page dirty={false} onSave={vi.fn()} />);
    await waitFor(() => expect(atGuardEntry()).toBe(false));
    // Its own pop isn't mistaken for the user's back.
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("closes from its close button, as Stay", async () => {
    const { user } = renderWithProviders(<Page dirty onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("Tracks"));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("asks nothing more while it is already leaving on a save", async () => {
    let finish: (saved: boolean) => void = () => {};
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const { user } = renderWithProviders(<Page dirty onSave={onSave} />);
    fireEvent.click(screen.getByText("Tracks"));
    await user.click(await screen.findByRole("button", { name: "Save and leave" }));

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByText("Tracks").dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    const proceed = vi.fn();
    guardNavigation(proceed);
    expect(proceed).toHaveBeenCalledOnce();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    await act(async () => finish(true));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/tracks"));
  });

  it("leaves at once when its history entry is already gone", async () => {
    const { user } = renderWithProviders(<Page dirty onSave={vi.fn()} />);
    window.history.replaceState(null, "", window.location.href);
    fireEvent.click(screen.getByText("Tracks"));
    await user.click(await screen.findByRole("button", { name: "Leave without saving" }));
    expect(mocks.push).toHaveBeenCalledWith("/tracks");
  });

  it("ignores pops while clean, and stepping forward onto its own entry", async () => {
    const { rerender } = renderWithProviders(<Page dirty={false} onSave={vi.fn()} />);
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    rerender(<Page dirty onSave={vi.fn()} />);
    expect(atGuardEntry()).toBe(true);
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps its entry when the page goes clean and dirty again before the pop lands", async () => {
    const { rerender } = renderWithProviders(<Page dirty onSave={vi.fn()} />);
    rerender(<Page dirty={false} onSave={vi.fn()} />);
    // Still on the entry: the step back hasn't landed, so dirty again pushes nothing new.
    rerender(<Page dirty onSave={vi.fn()} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Its own pop took the entry off; it is put back, and nobody is asked.
    expect(atGuardEntry()).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
