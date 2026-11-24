// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const state = vi.hoisted(() => ({
  friend: null as { id: number; username: string } | null,
  libraries: {
    isPending: false,
    data: { results: [], account_username: "owner", discogs_token_set: true } as
      | {
          results: unknown[];
          account_username: string | null;
          discogs_token_set: boolean;
        }
      | undefined,
  },
  importTarget: undefined as unknown,
  importer: {
    running: false,
    progress: null as string | null,
    failure: null as string | null,
    finished: false,
    start: vi.fn(),
  },
}));

vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: state.friend }) }));
vi.mock("@/hooks/useLibraries", () => ({ useLibrariesQuery: () => state.libraries }));
vi.mock("@/hooks/useDiscogsImport", () => ({
  useDiscogsImport: (target: unknown) => {
    state.importTarget = target;
    return state.importer;
  },
}));

import EmptyLibrary, { DISCOGS_SETUP_DOCS } from "./EmptyLibrary";

beforeEach(() => {
  state.friend = null;
  state.libraries = {
    isPending: false,
    data: { results: [], account_username: "owner", discogs_token_set: true },
  };
  state.importer = {
    running: false,
    progress: null,
    failure: null,
    finished: false,
    start: vi.fn(),
  };
});

describe("EmptyLibrary", () => {
  it("reads the import of the library it would fill: the selected one, else the account", () => {
    renderWithProviders(<EmptyLibrary />);
    expect(state.importTarget).toBe("owner");
    state.friend = { id: 3, username: "collector" };
    renderWithProviders(<EmptyLibrary />);
    expect(state.importTarget).toBe("collector");
  });

  it("says the library is empty and offers one action: Import from Discogs", async () => {
    const { user } = renderWithProviders(<EmptyLibrary />);
    expect(screen.getByRole("heading", { name: "Your library is empty" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    // No spinner, no zero stats.
    expect(document.querySelector(".chakra-spinner")).toBeNull();
    const button = screen.getByRole("button", { name: "Import from Discogs" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await user.click(button);
    // No library selected: the server's own account is synced.
    expect(state.importer.start).toHaveBeenCalledWith(undefined);
  });

  it("imports the selected library when it holds nothing", async () => {
    state.friend = { id: 4, username: "alice" };
    const { user } = renderWithProviders(<EmptyLibrary />);
    await user.click(screen.getByRole("button", { name: "Import from Discogs" }));
    expect(state.importer.start).toHaveBeenCalledWith("alice");
  });

  it("holds the action, without a spinner, until the server's setup is known", () => {
    state.libraries = { isPending: true, data: undefined };
    renderWithProviders(<EmptyLibrary />);
    expect(
      (screen.getByRole("button", { name: "Import from Discogs" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(document.querySelector(".chakra-spinner")).toBeNull();
  });

  it("names the missing token and where to set it, with no import button", () => {
    state.libraries.data = { results: [], account_username: "owner", discogs_token_set: false };
    renderWithProviders(<EmptyLibrary />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("DISCOGS_USER_TOKEN is missing");
    expect(alert.textContent).toContain(".env");
    expect(alert.textContent).toContain("restart");
    expect(screen.queryByRole("button", { name: /import/i })).toBeNull();
    const link = screen.getByRole("link", { name: "Read the Discogs setup guide" });
    expect(link.getAttribute("href")).toBe(DISCOGS_SETUP_DOCS);
  });

  it("names both when the username is also unset", () => {
    state.libraries.data = { results: [], account_username: null, discogs_token_set: false };
    renderWithProviders(<EmptyLibrary />);
    expect(screen.getByRole("alert").textContent).toContain(
      "DISCOGS_USER_TOKEN and DISCOGS_USERNAME are missing",
    );
  });

  it("flags only the username when the token is set but nobody can be synced", () => {
    state.libraries.data = { results: [], account_username: null, discogs_token_set: true };
    renderWithProviders(<EmptyLibrary />);
    expect(screen.getByRole("alert").textContent).toContain("DISCOGS_USERNAME is missing");
  });

  it("does not need DISCOGS_USERNAME when a library is selected to sync", () => {
    state.friend = { id: 4, username: "alice" };
    state.libraries.data = { results: [], account_username: null, discogs_token_set: true };
    renderWithProviders(<EmptyLibrary />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Import from Discogs" })).toBeTruthy();
  });

  it("shows progress and that leaving is safe while an import runs", () => {
    state.importer = { ...state.importer, running: true, progress: "Fetching 12 of 340" };
    renderWithProviders(<EmptyLibrary />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Importing · Fetching 12 of 340");
    expect(status.textContent).toContain("You can leave this page");
    expect(screen.queryByRole("button", { name: /import/i })).toBeNull();
  });

  it("offers Resume import after a failure, and says nothing saved is lost", async () => {
    state.importer = { ...state.importer, failure: "Error: Discogs rate limit" };
    const { user } = renderWithProviders(<EmptyLibrary />);
    expect(screen.getByRole("alert").textContent).toContain("Error: Discogs rate limit");
    expect(screen.getByRole("alert").textContent).toContain("resuming carries on");
    await user.click(screen.getByRole("button", { name: "Resume import" }));
    expect(state.importer.start).toHaveBeenCalled();
  });

  it("explains an import that finished with nothing found", () => {
    state.importer = { ...state.importer, finished: true };
    renderWithProviders(<EmptyLibrary />);
    expect(screen.getByRole("status").textContent).toContain("found no releases");
  });
});
