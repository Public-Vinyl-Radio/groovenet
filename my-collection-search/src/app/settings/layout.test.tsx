// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The providers and dialogs have their own tests; here only that every
// Settings route gets them, around its page.
vi.mock("@/providers/SettingsDialogProvider", () => ({
  SettingsDialogsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialogs-provider">{children}</div>
  ),
}));
vi.mock("@/providers/SyncStreamsProvider", () => ({
  SyncStreamsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sync-provider">{children}</div>
  ),
}));
vi.mock("@/components/settings/dialogs/DiscogsSyncDialog", () => ({
  default: () => "sync dialog",
}));
vi.mock("@/components/settings/dialogs/RemoveFriendDialog", () => ({
  default: () => "remove dialog",
}));

import SettingsLayout, { metadata } from "./layout";

describe("SettingsLayout", () => {
  it("wraps every section in the Discogs sync providers and their dialogs", () => {
    render(
      <SettingsLayout>
        <p>section</p>
      </SettingsLayout>,
    );
    const sync = screen.getByTestId("sync-provider");
    expect(screen.getByTestId("dialogs-provider").contains(sync)).toBe(true);
    expect(sync.textContent).toBe("sectionsync dialogremove dialog");
  });

  it("titles the document Settings", () => {
    expect(metadata.title).toBe("Settings");
  });
});
