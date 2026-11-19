// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import RetroDialog from "./RetroDialog";
import { Group, TileRow } from "./RetroModalParts";

function Host({ children }: { children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  return (
    <RetroDialog open={open} onOpenChange={setOpen} title="Actions">
      {children(() => setOpen(false))}
    </RetroDialog>
  );
}

describe("action sheet parts (#1234)", () => {
  it("runs an action after the sheet has closed", async () => {
    const onClick = vi.fn();
    const { user } = renderWithProviders(
      <Host>
        {(close) => <Group label="Sort" actions={[{ label: "Go", onClick }]} onDone={close} />}
      </Host>,
    );
    await user.click(await screen.findByRole("button", { name: "Go" }));
    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on an action or tile with no handler", async () => {
    const { user } = renderWithProviders(
      <Host>
        {(close) => (
          <>
            <TileRow tiles={[{ label: "Tile", icon: <span /> }]} onDone={close} />
            <Group label="Sort" actions={[{ label: "Nothing" }]} onDone={close} />
          </>
        )}
      </Host>,
    );
    await user.click(await screen.findByRole("button", { name: "Nothing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes on a tile with no handler", async () => {
    const { user } = renderWithProviders(
      <Host>
        {(close) => <TileRow tiles={[{ label: "Tile", icon: <span /> }]} onDone={close} />}
      </Host>,
    );
    await user.click(await screen.findByRole("button", { name: "Tile" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
