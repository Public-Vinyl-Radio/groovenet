// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The dialogs have their own tests; here only that every Settings route gets them, after its page.
// The providers they read sit at the root (`app/providers.tsx`).
vi.mock("@/components/settings/dialogs/DiscogsSyncDialog", () => ({
  default: () => "sync dialog",
}));
vi.mock("@/components/settings/dialogs/RemoveFriendDialog", () => ({
  default: () => "remove dialog",
}));

import SettingsLayout, { metadata } from "./layout";

describe("SettingsLayout", () => {
  it("renders every section with the Discogs sync and remove dialogs", () => {
    render(
      <SettingsLayout>
        <p>section</p>
      </SettingsLayout>,
    );
    expect(screen.getByText("section")).toBeTruthy();
    expect(document.body.textContent).toBe("sectionsync dialogremove dialog");
  });

  it("titles the document Settings", () => {
    expect(metadata.title).toBe("Settings");
  });
});
