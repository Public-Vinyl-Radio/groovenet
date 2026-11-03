// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const lookupDiscogsUser = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/discogs", () => ({ lookupDiscogsUser }));

import AddLibraryDialog from "./AddLibraryDialog";

const onAdd = vi.fn();
const onOpenChange = vi.fn();

function open(existing: string[] = ["owner"]) {
  const view = renderWithProviders(
    <AddLibraryDialog open onOpenChange={onOpenChange} onAdd={onAdd} existing={existing} />,
  );
  const dialog = screen.getByRole("dialog", { name: "Add a library" });
  const input = within(dialog).getByRole("textbox", { name: "Discogs username" });
  const lookUp = within(dialog).getByRole("button", { name: "Look up" });
  const add = () =>
    within(dialog).getByRole("button", { name: "Add and sync" }) as HTMLButtonElement;
  return { ...view, dialog, input, lookUp, add };
}

beforeEach(() => {
  vi.resetAllMocks();
  onAdd.mockResolvedValue(undefined);
});

describe("AddLibraryDialog", () => {
  it("asks for a lookup before anything can be added", () => {
    const { dialog, lookUp, add } = open();
    expect(within(dialog).getByText("Look up a username to check it before adding.")).toBeTruthy();
    expect((lookUp as HTMLButtonElement).disabled).toBe(true);
    expect(add().disabled).toBe(true);
    expect(within(dialog).getByText(/A large collection takes a few minutes\./)).toBeTruthy();
  });

  it("shows a found user with their release count, then adds and syncs them", async () => {
    lookupDiscogsUser.mockResolvedValue({
      username: "collector-5",
      found: true,
      release_count: 1233,
    });
    const { user, dialog, input, lookUp, add } = open();
    await user.type(input, "  collector-5 ");
    await user.click(lookUp);

    const card = await within(dialog).findByTestId("lookup-found");
    expect(lookupDiscogsUser).toHaveBeenCalledWith("collector-5");
    expect(within(card).getByText("collector-5")).toBeTruthy();
    expect(card.textContent).toContain("1,233 releases in their collection");
    expect(within(card).getByText("Found")).toBeTruthy();
    expect(add().disabled).toBe(false);

    await user.click(add());
    expect(onAdd).toHaveBeenCalledWith("collector-5");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("says when there is no such user, and keeps ADD AND SYNC disabled", async () => {
    lookupDiscogsUser.mockResolvedValue({ username: "collectr-5", found: false });
    const { user, dialog, input, add } = open();
    await user.type(input, "collectr-5{Enter}");
    const message = await within(dialog).findByTestId("lookup-not-found");
    expect(message.textContent).toBe(
      "No Discogs user called “collectr-5”. Check the spelling, or that their collection is public.",
    );
    expect(add().disabled).toBe(true);
  });

  it("reports an API error inline", async () => {
    lookupDiscogsUser.mockRejectedValue(new Error("Discogs lookup failed: HTTP 429"));
    const { user, dialog, input, lookUp, add } = open();
    await user.type(input, "dj");
    await user.click(lookUp);
    const error = await within(dialog).findByTestId("lookup-error");
    expect(error.textContent).toContain("Discogs lookup failed: HTTP 429");
    expect(add().disabled).toBe(true);
  });

  it("won't add a library that is already in the list", async () => {
    lookupDiscogsUser.mockResolvedValue({ username: "Owner", found: true, release_count: 4 });
    const { user, dialog, input, lookUp, add } = open(["owner"]);
    await user.type(input, "Owner");
    await user.click(lookUp);
    await within(dialog).findByText("Already in your libraries.");
    expect(add().disabled).toBe(true);
  });

  it("clears the result when the name is edited, and looks the same name up again on request", async () => {
    lookupDiscogsUser.mockResolvedValue({ username: "dj", found: true, release_count: 1 });
    const { user, dialog, input, lookUp } = open();
    await user.type(input, "dj");
    await user.click(lookUp);
    await within(dialog).findByTestId("lookup-found");

    await user.type(input, "x");
    expect(within(dialog).queryByTestId("lookup-found")).toBeNull();
    expect(within(dialog).getByText("Look up a username to check it before adding.")).toBeTruthy();

    await user.type(input, "{Backspace}");
    await within(dialog).findByTestId("lookup-found");
    await user.click(lookUp);
    await waitFor(() => expect(lookupDiscogsUser).toHaveBeenCalledTimes(2));
  });

  it("keeps the modal open with the reason when adding fails", async () => {
    lookupDiscogsUser.mockResolvedValue({ username: "dj", found: true, release_count: 1 });
    onAdd.mockRejectedValue(new Error("db down"));
    const { user, dialog, input, lookUp, add } = open();
    await user.type(input, "dj");
    await user.click(lookUp);
    await within(dialog).findByTestId("lookup-found");
    await user.click(add());
    expect(await within(dialog).findByText("Couldn't add dj: db down")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("opens with a username already looked up", async () => {
    lookupDiscogsUser.mockResolvedValue({ username: "collectr-5", found: false });
    renderWithProviders(
      <AddLibraryDialog
        open
        onOpenChange={onOpenChange}
        onAdd={onAdd}
        existing={[]}
        initialUsername="collectr-5"
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Add a library" });
    expect((within(dialog).getByRole("textbox") as HTMLInputElement).value).toBe("collectr-5");
    expect(await within(dialog).findByTestId("lookup-not-found")).toBeTruthy();
  });

  it("says it is looking the name up while the request is out", async () => {
    lookupDiscogsUser.mockReturnValue(new Promise(() => {}));
    const { user, dialog, input, lookUp } = open();
    await user.type(input, "dj");
    await user.click(lookUp);
    expect(await within(dialog).findByText("Looking up dj…")).toBeTruthy();
    expect((lookUp as HTMLButtonElement).disabled).toBe(true);
  });

  it("reports a failure that isn't an Error too", async () => {
    lookupDiscogsUser.mockResolvedValue({ username: "dj", found: true, release_count: 1 });
    onAdd.mockRejectedValue("offline");
    const { user, dialog, input, lookUp, add } = open();
    await user.type(input, "dj");
    await user.click(lookUp);
    await within(dialog).findByTestId("lookup-found");
    await user.click(add());
    expect(await within(dialog).findByText("Couldn't add dj: offline")).toBeTruthy();
  });

  it("closes on CANCEL", async () => {
    const { user, dialog } = open();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
