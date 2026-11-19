// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import RetroDialog, { RetroDialogTitle, useRunAfterClose } from "./RetroDialog";

function renderDialog(props: Partial<React.ComponentProps<typeof RetroDialog>> = {}) {
  const onOpenChange = vi.fn();
  const rendered = renderWithProviders(
    <RetroDialog open onOpenChange={onOpenChange} title="Delete track" {...props}>
      <p>Body</p>
    </RetroDialog>,
  );
  return { ...rendered, onOpenChange };
}

describe("RetroDialog", () => {
  it("is a dialog named by its label strip", async () => {
    renderDialog();
    expect(await screen.findByRole("dialog", { name: "Delete track" })).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("can be an alertdialog", async () => {
    renderDialog({ role: "alertdialog" });
    expect(await screen.findByRole("alertdialog", { name: "Delete track" })).toBeTruthy();
  });

  it("renders a custom header in place of the title", async () => {
    renderDialog({
      title: undefined,
      header: <RetroDialogTitle>Custom</RetroDialogTitle>,
    });
    expect(await screen.findByRole("dialog", { name: "Custom" })).toBeTruthy();
  });

  it("keeps the close button in the strip's flow, so header buttons are not overlapped", async () => {
    renderDialog({
      title: undefined,
      header: <RetroDialogTitle>Custom</RetroDialogTitle>,
    });
    const close = await screen.findByRole("button", { name: "Close" });
    expect(getComputedStyle(close).position).toBe("static");
  });

  it("pins a footer under the body", async () => {
    renderDialog({ footer: <button>Apply</button> });
    expect(await screen.findByRole("button", { name: "Apply" })).toBeTruthy();
  });

  it("closes from the close button and Escape", async () => {
    const { user, onOpenChange } = renderDialog();
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it("ignores Escape and disables Close while not dismissible", async () => {
    const { user, onOpenChange } = renderDialog({ dismissible: false });
    const close = await screen.findByRole("button", { name: "Close" });
    expect((close as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

it("keeps the shared close target at least 44px square", async () => {
  renderDialog();
  const close = await screen.findByRole("button", { name: "Close" });
  expect(getComputedStyle(close).width).toBe("44px");
  expect(getComputedStyle(close).height).toBe("44px");
});

it("allows a wide data viewer without changing its scrolling body", async () => {
  renderDialog({ maxW: "980px" });
  const dialog = await screen.findByRole("dialog");
  expect(getComputedStyle(dialog).maxWidth).toBe("980px");
  const body = screen.getByText("Body").parentElement!;
  expect(getComputedStyle(body).overflowY).toBe("auto");
});

it("fills the phone viewport for editors and forwards their initial focus ref", async () => {
  const ref = React.createRef<HTMLButtonElement>();
  renderDialog({
    fullScreenOnMobile: true,
    maxW: "lg",
    closeButtonRef: ref,
    initialFocusEl: () => ref.current,
  });
  const dialog = await screen.findByRole("dialog");
  expect(getComputedStyle(dialog).maxWidth).toBe("none");
  expect(getComputedStyle(dialog).height).toBe("100%");
  expect(ref.current).toBe(screen.getByRole("button", { name: "Close" }));
});

describe("useRunAfterClose (#1234)", () => {
  function Runner({ fn, close }: { fn: () => void; close?: () => void }) {
    const runAfterClose = useRunAfterClose();
    return (
      <button
        onClick={() => {
          runAfterClose(fn);
          close?.();
        }}
      >
        Go
      </button>
    );
  }

  it("runs at once outside a dialog", async () => {
    const fn = vi.fn();
    const { user } = renderWithProviders(<Runner fn={fn} />);
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits for the dialog to finish closing, then runs once", async () => {
    const fn = vi.fn();
    function Host() {
      const [open, setOpen] = React.useState(true);
      return (
        <RetroDialog open={open} onOpenChange={setOpen} title="Menu">
          <Runner fn={fn} close={() => setOpen(false)} />
        </RetroDialog>
      );
    }
    const { user } = renderWithProviders(<Host />);
    await user.click(await screen.findByRole("button", { name: "Go" }));
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes with nothing queued when dismissed another way", async () => {
    function Host() {
      const [open, setOpen] = React.useState(true);
      return (
        <RetroDialog open={open} onOpenChange={setOpen} title="Menu">
          <p>Body</p>
        </RetroDialog>
      );
    }
    const { user } = renderWithProviders(<Host />);
    await user.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
