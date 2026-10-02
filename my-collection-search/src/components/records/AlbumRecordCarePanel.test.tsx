// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { chooseMenuItem, renderWithProviders } from "@/test/renderWithProviders";

const api = vi.hoisted(() => ({
  listRecordCopies: vi.fn(),
  createRecordCopy: vi.fn(),
  updateRecordCopy: vi.fn(),
  updateDefaultRecordCopy: vi.fn(),
  deleteRecordCopy: vi.fn(),
  listRecordActions: vi.fn(),
  createRecordAction: vi.fn(),
  voidRecordAction: vi.fn(),
}));
vi.mock("@/services/internalApi/recordCare", () => api);
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));

import AlbumRecordCarePanel from "./AlbumRecordCarePanel";

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const base = {
  friend_id: 7,
  release_id: "rel",
  label: null,
  notes: null,
  inner_sleeve_type: null,
  last_cleaned_at: null,
  deleted_at: null,
  created_at: null,
  updated_at: null,
};
const implicit = { ...base, id: null, is_default: true };
const defaultCopy = {
  ...base,
  id: 3,
  is_default: true,
  inner_sleeve_type: "poly-rice-paper-poly" as const,
  last_cleaned_at: daysAgo(400),
  notes: "Original pressing",
};
const djCopy = { ...base, id: 4, is_default: false, label: "DJ copy", last_cleaned_at: daysAgo(3) };

const cleaned = {
  id: 11,
  copy_id: 3,
  friend_id: 7,
  action_type: "cleaned" as const,
  occurred_at: daysAgo(400),
  notes: "two passes",
  sleeve_type: null,
  details: { method: "vacuum" as const },
  voided_at: null,
  created_at: daysAgo(400),
};

function listCopies(items: unknown[]) {
  api.listRecordCopies.mockResolvedValue({ items, overdue_days: 365 });
}

function renderPanel() {
  return renderWithProviders(<AlbumRecordCarePanel releaseId="rel" friendId={7} albumTitle="Blue Lines" />);
}

/** The card for a copy, by its name. */
const card = (name: string) => screen.findByRole("group", { name });

beforeEach(() => listCopies([defaultCopy, djCopy]));
afterEach(() => vi.resetAllMocks());

describe("AlbumRecordCarePanel", () => {
  it("shows each copy's care state", async () => {
    renderPanel();

    expect(await screen.findByText("Default copy")).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.getByText("Poly / rice paper / poly")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("Cleaned 13 months ago")).toBeTruthy();
    expect(screen.getByText("Original pressing")).toBeTruthy();

    expect(screen.getByText("DJ copy")).toBeTruthy();
    expect(screen.getByText("Unknown sleeve")).toBeTruthy();
    expect(screen.getByText("Cleaned 3 days ago")).toBeTruthy();
  });

  it("shows an untouched release's implicit copy, with no history to open", async () => {
    listCopies([implicit]);
    renderPanel();

    expect(await screen.findByText("Default copy")).toBeTruthy();
    expect(screen.getByText("Never cleaned")).toBeTruthy();
    expect(screen.queryByText("Default")).toBeNull();
    expect(screen.queryByRole("button", { name: "History" })).toBeNull();
  });

  it("shows a load failure", async () => {
    api.listRecordCopies.mockRejectedValue(new Error("Album not found"));
    renderPanel();
    expect(await screen.findByText("Album not found")).toBeTruthy();
  });

  it("logs care against the default copy from the header", async () => {
    api.createRecordAction.mockResolvedValue({});
    const { user } = renderPanel();
    await screen.findByText("DJ copy");

    await user.click(screen.getByRole("button", { name: "Log Care" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.createRecordAction).toHaveBeenCalledWith(
        expect.objectContaining({ release_id: "rel", action_type: "cleaned" })
      )
    );
    await waitFor(() => expect(screen.queryByText("Log Record Care")).toBeNull());
  });

  it("logs care against one copy from its menu", async () => {
    api.createRecordAction.mockResolvedValue({});
    const { user } = renderPanel();
    const dj = await card("DJ copy");

    const [, menuButton] = within(dj).getAllByRole("button", { name: "Copy actions", hidden: true });
    await chooseMenuItem(user, menuButton, /Log care/);
    await user.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.createRecordAction).toHaveBeenCalledWith(expect.objectContaining({ copy_id: 4 }))
    );
  });

  it("adds a copy, and edits one from the mobile sheet", async () => {
    api.createRecordCopy.mockResolvedValue({});
    api.updateRecordCopy.mockResolvedValue({});
    const { user } = renderPanel();
    await screen.findByText("DJ copy");

    await user.click(screen.getByRole("button", { name: "Add Copy" }));
    await user.type(await screen.findByLabelText("Label"), "Sealed");
    // The dialog is modal, so the header's "Add Copy" is hidden behind it.
    await user.click(screen.getByRole("button", { name: "Add Copy" }));
    await waitFor(() =>
      expect(api.createRecordCopy).toHaveBeenCalledWith({
        friend_id: 7,
        release_id: "rel",
        label: "Sealed",
      })
    );
    await waitFor(() => expect(screen.queryByLabelText("Label")).toBeNull());

    const dj = await card("DJ copy");
    await user.click(within(dj).getAllByRole("button", { name: "Copy actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Edit label & notes/ }));
    const label = await screen.findByLabelText("Label");
    await user.clear(label);
    await user.type(label, "Club copy");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(api.updateRecordCopy).toHaveBeenCalledWith(4, { friend_id: 7, label: "Club copy" })
    );
  });

  it("opens log care from the mobile sheet", async () => {
    const { user } = renderPanel();
    const dj = await card("DJ copy");

    await user.click(within(dj).getAllByRole("button", { name: "Copy actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Log care/ }));

    expect(await screen.findByText("Log Record Care")).toBeTruthy();
  });

  it("removes a copy once confirmed, and only a copy that is not the default", async () => {
    api.deleteRecordCopy.mockResolvedValue({});
    const { user } = renderPanel();

    const defaultCard = await card("Default copy");
    await user.click(within(defaultCard).getAllByRole("button", { name: "Copy actions" })[0]);
    expect(await screen.findByRole("button", { name: /Edit label & notes/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remove copy/ })).toBeNull();
    await user.keyboard("{Escape}");

    const dj = await card("DJ copy");
    const [, menuButton] = within(dj).getAllByRole("button", { name: "Copy actions", hidden: true });
    await chooseMenuItem(user, menuButton, /Remove copy/);
    const prompt = await screen.findByRole("alertdialog");
    expect(within(prompt).getByText("DJ copy")).toBeTruthy();
    await user.click(within(prompt).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(api.deleteRecordCopy).toHaveBeenCalledWith(4, 7));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copy removed" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps the remove prompt open when removal fails", async () => {
    api.deleteRecordCopy.mockRejectedValue(new Error("Record copy not found"));
    const { user } = renderPanel();
    const dj = await card("DJ copy");

    await user.click(within(dj).getAllByRole("button", { name: "Copy actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Remove copy/ }));
    const prompt = await screen.findByRole("alertdialog");
    await user.click(within(prompt).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Failed to remove copy", description: "Record copy not found" })
      )
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(within(prompt).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("closes the remove prompt on Escape, but not while removing", async () => {
    let finish: () => void = () => {};
    api.deleteRecordCopy.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { user } = renderPanel();
    const dj = await card("DJ copy");

    await user.click(within(dj).getAllByRole("button", { name: "Copy actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Remove copy/ }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    await user.click(within(dj).getAllByRole("button", { name: "Copy actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Remove copy/ }));
    const prompt = await screen.findByRole("alertdialog");
    await user.click(within(prompt).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.deleteRecordCopy).toHaveBeenCalled());
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    finish();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("names a removal failure that is not an Error", async () => {
    api.deleteRecordCopy.mockRejectedValue("boom");
    const { user } = renderPanel();
    const dj = await card("DJ copy");

    await user.click(within(dj).getAllByRole("button", { name: "Copy actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Remove copy/ }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Unknown error" }))
    );
  });
});

describe("copy history", () => {
  async function openHistory() {
    const rendered = renderPanel();
    const defaultCard = await card("Default copy");
    const toggle = within(defaultCard).getByRole("button", { name: "History" });
    await rendered.user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    return { ...rendered, defaultCard, toggle };
  }

  it("lists a copy's actions, and hides them again", async () => {
    api.listRecordActions.mockResolvedValue({ items: [cleaned], limit: 100, offset: 0 });
    const { user, toggle } = await openHistory();

    expect(await screen.findByText("Cleaned · Vacuum machine")).toBeTruthy();
    expect(screen.getByText("two passes")).toBeTruthy();
    expect(api.listRecordActions).toHaveBeenCalledWith(3, { friend_id: 7, limit: 100 });

    await user.click(toggle);
    expect(screen.queryByText("Cleaned · Vacuum machine")).toBeNull();
  });

  it("says when nothing is logged, and shows a load failure", async () => {
    api.listRecordActions.mockResolvedValueOnce({ items: [], limit: 100, offset: 0 });
    await openHistory();
    expect(await screen.findByText("No care logged yet")).toBeTruthy();
  });

  it("shows a history load failure", async () => {
    api.listRecordActions.mockRejectedValue(new Error("Record copy not found"));
    await openHistory();
    expect(await screen.findByText("Record copy not found")).toBeTruthy();
  });

  it("voids an action once confirmed", async () => {
    api.listRecordActions.mockResolvedValue({
      items: [{ ...cleaned, notes: null, details: {} }],
      limit: 100,
      offset: 0,
    });
    api.voidRecordAction.mockResolvedValue({});
    const { user } = await openHistory();

    await user.click(await screen.findByRole("button", { name: "Void Cleaned" }));
    const prompt = await screen.findByRole("alertdialog");
    await user.click(within(prompt).getByRole("button", { name: "Void" }));

    await waitFor(() => expect(api.voidRecordAction).toHaveBeenCalledWith(11, 7));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Action voided" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it.each([
    [new Error("Record action not found"), "Record action not found"],
    ["boom", "Unknown error"],
  ])("reports a failed void and keeps the prompt", async (thrown, description) => {
    api.listRecordActions.mockResolvedValue({ items: [cleaned], limit: 100, offset: 0 });
    api.voidRecordAction.mockRejectedValue(thrown);
    const { user } = await openHistory();

    await user.click(await screen.findByRole("button", { name: "Void Cleaned · Vacuum machine" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Void" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Failed to void action", description })
      )
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});
