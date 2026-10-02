// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const api = vi.hoisted(() => ({
  listRecordCare: vi.fn(),
  getRecordCareSummary: vi.fn(),
  listRecordCopies: vi.fn(),
  createRecordAction: vi.fn(),
}));
vi.mock("@/services/internalApi/recordCare", () => api);
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: vi.fn() } }));
const username = vi.hoisted(() => ({
  current: { friend: { id: 7 } as { id: number } | null, isHydrated: true },
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => username.current }));

import ChorePage from "./page";
import ChoreLayout, { metadata } from "./layout";

const summary = {
  total: 60,
  never_cleaned: 12,
  overdue: 4,
  needs_sleeve: 30,
  by_sleeve_type: { original: 20, paper: 2, "poly-rice-paper-poly": 28, poly: 3, unknown: 7 },
  overdue_days: 365,
  needs_sleeve_type: "poly-rice-paper-poly",
};

const item = (n: number, extra: Record<string, unknown> = {}) => ({
  friend_id: 7,
  release_id: `rel-${n}`,
  album_title: `Album ${n}`,
  album_artist: "Artist",
  album_thumbnail: null,
  copy_id: n,
  is_default: false,
  label: null,
  inner_sleeve_type: null,
  last_cleaned_at: null,
  ...extra,
});

function careResponse(items: unknown[], total = items.length, offset = 0) {
  return { items, total, limit: 50, offset, overdue_days: 365, needs_sleeve_type: "poly-rice-paper-poly" };
}

const lastCareParams = () => api.listRecordCare.mock.calls.at(-1)?.[0];

beforeEach(() => {
  username.current = { friend: { id: 7 }, isHydrated: true };
  api.getRecordCareSummary.mockResolvedValue(summary);
  api.listRecordCare.mockResolvedValue(
    careResponse([item(1, { label: "DJ copy", album_thumbnail: "/a.jpg" }), item(2, { copy_id: null, is_default: true })])
  );
  api.listRecordCopies.mockResolvedValue({ items: [], overdue_days: 365 });
  api.createRecordAction.mockResolvedValue({});
});
afterEach(() => vi.resetAllMocks());

describe("chore layout", () => {
  it("titles the page and renders its children", () => {
    expect(metadata.title).toBe("Chores");
    renderWithProviders(<ChoreLayout><p>child</p></ChoreLayout>);
    expect(screen.getByText("child")).toBeTruthy();
  });
});

describe("ChorePage", () => {
  it("waits for a library", () => {
    username.current = { friend: null, isHydrated: true };
    renderWithProviders(<ChorePage />);
    expect(screen.queryByText("Chores")).toBeNull();
    expect(api.getRecordCareSummary).not.toHaveBeenCalled();
  });

  it("shows the counts, then copies never cleaned", async () => {
    renderWithProviders(<ChorePage />);

    const neverCleaned = await screen.findByRole("button", { name: /Never cleaned/ });
    expect(neverCleaned.getAttribute("aria-pressed")).toBe("true");
    expect(within(neverCleaned).getByText("12")).toBeTruthy();
    expect(screen.getByText("Not cleaned in 365 days")).toBeTruthy();
    expect(screen.getByText("Not yet in poly / rice paper / poly")).toBeTruthy();
    expect(screen.getByText("60 copies by sleeve:")).toBeTruthy();
    expect(screen.getByText("Unknown 7")).toBeTruthy();

    expect(await screen.findByRole("link", { name: "Album 1" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Album 1" }).getAttribute("href")).toBe(
      "/albums/rel-1?friend_id=7"
    );
    expect(screen.getByText("DJ copy")).toBeTruthy();
    expect(screen.getAllByText("Never cleaned").length).toBeGreaterThan(1);
    expect(lastCareParams()).toEqual({ friend_id: 7, status: "never_cleaned", limit: 50, offset: 0 });
  });

  it("switches chore from the counts", async () => {
    const { user } = renderWithProviders(<ChorePage />);

    await user.click(await screen.findByRole("button", { name: /Needs a sleeve/ }));

    await waitFor(() => expect(lastCareParams()).toMatchObject({ status: "needs_sleeve", offset: 0 }));
    expect(await screen.findByRole("button", { name: "Log sleeve change for Album 1" })).toBeTruthy();
  });

  it("logs the chore's action against the row's copy", async () => {
    const { user } = renderWithProviders(<ChorePage />);

    await user.click(await screen.findByRole("button", { name: "Log cleaning for Album 2" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));

    // Album 2's copy is its implicit default, so it is logged by release.
    await waitFor(() =>
      expect(api.createRecordAction).toHaveBeenCalledWith(
        expect.objectContaining({ release_id: "rel-2", action_type: "cleaned" })
      )
    );
    await waitFor(() => expect(screen.queryByText("Log Record Care")).toBeNull());
  });

  it("pages through a long list, back to the start on a new chore", async () => {
    const page = Array.from({ length: 50 }, (_, i) => item(i + 1));
    api.listRecordCare.mockImplementation(({ offset }: { offset: number }) =>
      Promise.resolve(
        offset === 0
          ? careResponse(page, 60)
          : careResponse(Array.from({ length: 10 }, (_, i) => item(i + 51)), 60, offset)
      )
    );
    const { user } = renderWithProviders(<ChorePage />);

    expect(await screen.findByText("1–50 of 60")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("51–60 of 60")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("1–50 of 60")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("51–60 of 60");
    await user.click(screen.getByRole("button", { name: /Overdue/ }));
    await waitFor(() => expect(lastCareParams()).toMatchObject({ status: "overdue", offset: 0 }));
  });

  it.each([
    ["never_cleaned", /Never cleaned/, "Every copy has been cleaned at least once."],
    ["overdue", /Overdue/, "No copy is overdue for a cleaning."],
    ["needs_sleeve", /Needs a sleeve/, "Every copy is in the target sleeve."],
  ])("says when no copy needs %s", async (_status, tile, message) => {
    api.listRecordCare.mockResolvedValue(careResponse([]));
    const { user } = renderWithProviders(<ChorePage />);

    await user.click(await screen.findByRole("button", { name: tile }));

    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("shows load failures", async () => {
    api.getRecordCareSummary.mockRejectedValue(new Error("summary down"));
    api.listRecordCare.mockRejectedValue(new Error("list down"));
    renderWithProviders(<ChorePage />);

    expect(await screen.findByText("summary down")).toBeTruthy();
    expect(await screen.findByText("list down")).toBeTruthy();
  });
});
