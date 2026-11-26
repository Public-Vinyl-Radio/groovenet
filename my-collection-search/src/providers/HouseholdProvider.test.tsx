// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
const api = vi.hoisted(() => ({ list: vi.fn(), select: vi.fn() }));
vi.mock("@/services/internalApi/profiles", () => ({ profilesApi: api }));
import { HouseholdProvider, useHousehold } from "./HouseholdProvider";
import { useTrackStore } from "@/stores/trackStore";
const owner = { id: "one", name: "Adam", is_owner: true };
const other = { id: "two", name: "Sam", is_owner: false };
function Consumer() {
  const { data, switchProfile } = useHousehold();
  return <button onClick={switchProfile}>{data?.current?.name ?? "No selection"}</button>;
}
beforeEach(() => {
  vi.resetAllMocks();
  api.select.mockResolvedValue({ selected: true });
});
describe("household provider", () => {
  it("silently persists the sole profile once", async () => {
    api.list.mockResolvedValue({ users: [owner], current: owner, selected: false });
    renderWithProviders(
      <HouseholdProvider>
        <Consumer />
      </HouseholdProvider>,
    );
    await waitFor(() => expect(api.select).toHaveBeenCalledTimes(1));
    expect(api.select.mock.calls[0][0]).toBe("one");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not show a picker on a selected device and can switch then close", async () => {
    api.list.mockResolvedValue({ users: [owner, other], current: owner, selected: true });
    const { user } = renderWithProviders(
      <HouseholdProvider>
        <Consumer />
      </HouseholdProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Adam" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.select).not.toHaveBeenCalled();
  });
  it("shows a picker for an unselected device, preserves errors and retries", async () => {
    api.list.mockResolvedValue({ users: [owner, other], current: null, selected: false });
    api.select
      .mockRejectedValueOnce(new Error("Selection failed"))
      .mockImplementationOnce(async () => {
        api.list.mockResolvedValue({ users: [owner, other], current: other, selected: true });
        return {};
      });
    const { user } = renderWithProviders(
      <HouseholdProvider>
        <Consumer />
      </HouseholdProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Sam" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sam" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.select).toHaveBeenCalledTimes(2);
  });
  it("keeps the page usable when profile discovery fails", async () => {
    api.list.mockRejectedValue(new Error("offline"));
    renderWithProviders(
      <HouseholdProvider>
        <Consumer />
      </HouseholdProvider>,
    );
    expect(screen.getByRole("button", { name: "No selection" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("drops the previous profile's tracks when switching, so ratings refetch (#1283)", async () => {
    api.list.mockResolvedValue({ users: [owner, other], current: owner, selected: true });
    useTrackStore.getState().setTrack({ track_id: "t1", friend_id: 1, star_rating: 5 } as never);
    const { user } = renderWithProviders(
      <HouseholdProvider>
        <Consumer />
      </HouseholdProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Adam" }));
    await user.click(await screen.findByRole("button", { name: "Sam" }));
    await waitFor(() => expect(api.select).toHaveBeenCalledWith("two", expect.anything()));
    await waitFor(() => expect(useTrackStore.getState().tracks.size).toBe(0));
  });
});
