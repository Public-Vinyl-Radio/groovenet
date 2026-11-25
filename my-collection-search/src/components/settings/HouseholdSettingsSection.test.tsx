// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
const mock = vi.hoisted(() => ({
  household: vi.fn(),
  tokens: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  createToken: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/providers/HouseholdProvider", () => ({ useHousehold: mock.household }));
vi.mock("@/services/internalApi/profiles", () => ({ profilesApi: mock }));
import HouseholdSettingsSection from "./HouseholdSettingsSection";
const owner = { id: "owner", name: "Adam", is_owner: true, tailscale_login: null };
const other = { id: "other", name: "Sam", is_owner: false, tailscale_login: "sam@example.test" };
const tokens = [
  { id: "t1", user_id: "owner", name: "CLI", scope: "read", last_used_at: null, revoked_at: null },
  {
    id: "t2",
    user_id: "missing",
    name: "Old",
    scope: "write",
    last_used_at: "2026-11-24T00:00:00Z",
    revoked_at: "2026-11-24T01:00:00Z",
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  mock.household.mockReturnValue({ data: { current: owner } });
  mock.tokens.mockResolvedValue({ users: [owner, other], tokens });
});
describe("household settings", () => {
  it.each([false, true])("allows only owner management, tokens=%s", (tokens) => {
    mock.household.mockReturnValue({});
    renderWithProviders(<HouseholdSettingsSection tokens={tokens} />);
    expect(screen.getByText(/Only the owner/)).toBeTruthy();
    expect(mock.tokens).not.toHaveBeenCalled();
  });
  it("handles loading and discovery errors", async () => {
    mock.tokens.mockRejectedValue(new Error("Cannot load profiles"));
    renderWithProviders(<HouseholdSettingsSection />);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect((await screen.findByRole("alert")).textContent).toBe("Cannot load profiles");
  });
  it("adds profiles with optional tailnet login and resets the form", async () => {
    const { user } = renderWithProviders(<HouseholdSettingsSection />);
    const name = await screen.findByRole("textbox", { name: "New profile name" });
    expect(
      (screen.getByRole("button", { name: "Add profile" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.type(name, "Guest");
    await user.type(
      screen.getByRole("textbox", { name: "New Tailscale login" }),
      "guest@example.test",
    );
    await user.click(screen.getByRole("button", { name: "Add profile" }));
    await waitFor(() => expect(mock.create).toHaveBeenCalledWith("Guest", "guest@example.test"));
    expect((name as HTMLInputElement).value).toBe("");
    expect(await screen.findByRole("status")).toBeTruthy();
  });
  it("renames profiles and removes optional mapping, showing save failures", async () => {
    mock.rename.mockRejectedValueOnce(new Error("Name unavailable")).mockResolvedValueOnce({});
    const { user } = renderWithProviders(<HouseholdSettingsSection />);
    const name = await screen.findByRole("textbox", { name: "Name for Sam" });
    await user.clear(name);
    await user.type(name, "Sammy");
    await user.clear(screen.getByRole("textbox", { name: "Tailscale login for Sam" }));
    await user.click(screen.getAllByRole("button", { name: "Save profile" })[1]);
    expect((await screen.findByRole("alert")).textContent).toBe("Name unavailable");
    expect(mock.rename).toHaveBeenCalledWith("other", "Sammy", null);
    await user.click(screen.getAllByRole("button", { name: "Save profile" })[1]);
    expect(await screen.findByRole("status")).toBeTruthy();
  });
  it("adds a profile without a mapping and handles create failures", async () => {
    mock.create.mockRejectedValue(new Error("Unable to add"));
    const { user } = renderWithProviders(<HouseholdSettingsSection />);
    await user.type(await screen.findByRole("textbox", { name: "New profile name" }), "Guest");
    await user.click(screen.getByRole("button", { name: "Add profile" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Unable to add");
    expect(mock.create).toHaveBeenCalledWith("Guest", null);
  });
  it("creates a token for the current profile, shows it once and hides it on Done", async () => {
    mock.createToken.mockResolvedValue({ token: "one-time-secret" });
    const { user } = renderWithProviders(<HouseholdSettingsSection tokens />);
    await user.type(await screen.findByRole("textbox", { name: "Token name" }), "Agent");
    await user.click(screen.getByRole("button", { name: "Create token" }));
    const secret = await screen.findByRole("textbox", { name: "New API token" });
    expect((secret as HTMLInputElement).value).toBe("one-time-secret");
    expect(mock.createToken).toHaveBeenCalledWith("Agent", "owner", "read");
    await user.click(secret);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("textbox", { name: "New API token" })).toBeNull();
  });
  it("selects another user and scope, reports failures and revokes tokens", async () => {
    mock.createToken.mockRejectedValue(new Error("Cannot create token"));
    mock.revoke.mockRejectedValueOnce(new Error("Cannot revoke")).mockResolvedValueOnce({});
    const { user } = renderWithProviders(<HouseholdSettingsSection tokens />);
    await user.type(await screen.findByRole("textbox", { name: "Token name" }), "Listener");
    await user.selectOptions(screen.getByRole("combobox", { name: "Token profile" }), "other");
    await user.selectOptions(screen.getByRole("combobox", { name: "Token scope" }), "ingest");
    await user.click(screen.getByRole("button", { name: "Create token" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Cannot create token");
    expect(mock.createToken).toHaveBeenCalledWith("Listener", "other", "ingest");
    expect(screen.getByText(/Never/)).toBeTruthy();
    expect(screen.getByText("Revoked")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Revoke CLI" }));
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Revoke CLI" }));
    await waitFor(() => expect(mock.revoke).toHaveBeenCalledTimes(2));
    expect(mock.revoke.mock.calls[0][0]).toBe("t1");
  });
});
