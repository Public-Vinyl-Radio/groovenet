// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import PageHeader, { type HeaderAction } from ".";
import { pageHeader } from "@/app/houseStyle";

const act = (label: string, extra: Partial<HeaderAction> = {}): HeaderAction => ({
  label,
  icon: <span>i</span>,
  onClick: vi.fn(),
  ...extra,
});

describe("PageHeader parts", () => {
  it("composes a header from its children and flags <html>", () => {
    const { unmount } = renderWithProviders(
      <PageHeader>
        <PageHeader.Title>Albums</PageHeader.Title>
      </PageHeader>,
    );
    expect(screen.getByTestId("page-header").tagName).toBe("HEADER");
    expect(document.documentElement.hasAttribute("data-page-header")).toBe(true);
    unmount();
    expect(document.documentElement.hasAttribute("data-page-header")).toBe(false);
  });

  describe("Title", () => {
    it("is the h1, with a string's full text as its tooltip", () => {
      renderWithProviders(
        <PageHeader>
          <PageHeader.Title meta="4,044 results">Tracks</PageHeader.Title>
        </PageHeader>,
      );
      const h1 = screen.getByRole("heading", { level: 1, name: "Tracks" });
      expect(h1.getAttribute("title")).toBe("Tracks");
      expect(screen.getByTestId("page-header-meta").textContent).toBe("4,044 results");
    });

    it("leaves the tooltip off a non-string title and the meta off when there is none", () => {
      renderWithProviders(
        <PageHeader>
          <PageHeader.Title>
            <span>Custom</span>
          </PageHeader.Title>
        </PageHeader>,
      );
      expect(screen.getByRole("heading", { level: 1 }).hasAttribute("title")).toBe(false);
      expect(screen.queryByTestId("page-header-meta")).toBeNull();
    });

    it("keeps the meta in the phone bar unless told not to", () => {
      const { rerender } = renderWithProviders(
        <PageHeader>
          <PageHeader.Title meta="12">Tracks</PageHeader.Title>
        </PageHeader>,
      );
      expect(getComputedStyle(screen.getByTestId("page-header-meta")).display).toBe("block");
      rerender(
        <PageHeader>
          <PageHeader.Title meta="so far · 358 spins" metaOnPhone={false}>
            October
          </PageHeader.Title>
        </PageHeader>,
      );
      expect(getComputedStyle(screen.getByTestId("page-header-meta")).display).toBe("none");
    });
  });

  describe("Context", () => {
    it("shows the trail and a phone back button to the last linked parent", () => {
      renderWithProviders(
        <PageHeader>
          <PageHeader.Context
            crumbs={[{ label: "Albums", href: "/albums" }, { label: "Mezzanine" }]}
          />
          <PageHeader.Title>Mezzanine</PageHeader.Title>
        </PageHeader>,
      );
      expect(screen.getByTestId("page-header-breadcrumbs")).toBeTruthy();
      expect(
        screen.getByRole("link", { name: "Back to Albums", hidden: true }).getAttribute("href"),
      ).toBe("/albums");
    });

    it("renders nothing without crumbs or a leading control", () => {
      renderWithProviders(
        <PageHeader>
          <PageHeader.Context />
          <PageHeader.Title>Home</PageHeader.Title>
        </PageHeader>,
      );
      expect(screen.queryByTestId("page-header-breadcrumbs")).toBeNull();
      expect(screen.queryByTestId("page-header-leading")).toBeNull();
    });

    it("puts a leading control in place of the back button, on phones only", () => {
      renderWithProviders(
        <PageHeader>
          <PageHeader.Context
            crumbs={[{ label: "Albums", href: "/albums" }, { label: "Edit" }]}
            leading={<button>Cancel</button>}
          />
          <PageHeader.Title>Edit album</PageHeader.Title>
        </PageHeader>,
      );
      expect(screen.queryByRole("link", { name: /Back to/, hidden: true })).toBeNull();
      expect(
        within(screen.getByTestId("page-header-leading")).getByRole("button", { name: "Cancel" }),
      ).toBeTruthy();
    });
  });

  describe("Actions", () => {
    it("renders nothing for no actions and no slots", () => {
      renderWithProviders(
        <PageHeader>
          <PageHeader.Title>Home</PageHeader.Title>
          <PageHeader.Actions />
        </PageHeader>,
      );
      expect(screen.queryByTestId("page-header-phone-actions")).toBeNull();
      expect(screen.queryByTestId("page-header-desktop-actions")).toBeNull();
    });

    it("feeds one list to labelled desktop buttons and two phone icons", () => {
      const refresh = act("Refresh");
      renderWithProviders(
        <PageHeader>
          <PageHeader.Title>Jobs</PageHeader.Title>
          <PageHeader.Actions actions={[refresh, act("Edit"), act("Add", { primary: true })]} />
        </PageHeader>,
      );
      const desktop = within(screen.getByTestId("page-header-desktop-actions"));
      const phone = within(screen.getByTestId("page-header-phone-actions"));
      expect(desktop.getAllByRole("button", { hidden: true }).map((b) => b.textContent)).toEqual([
        "iRefresh",
        "iEdit",
        "iAdd",
      ]);
      expect(
        phone.getAllByRole("button", { hidden: true }).map((b) => b.getAttribute("aria-label")),
      ).toEqual(["Refresh", "Edit", "More actions"]);
      fireEvent.click(desktop.getByRole("button", { name: /Refresh/, hidden: true }));
      fireEvent.click(phone.getByRole("button", { name: "Refresh", hidden: true }));
      expect(refresh.onClick).toHaveBeenCalledTimes(2);
    });

    it("runs a desktop ⋯ item", async () => {
      const remove = act("Delete", { desktop: "menu", phone: "hidden" });
      renderWithProviders(
        <PageHeader>
          <PageHeader.Title>Album</PageHeader.Title>
          <PageHeader.Actions actions={[remove]} />
        </PageHeader>,
      );
      expect(screen.queryByTestId("page-header-phone-actions")).toBeNull();
      const desktop = within(screen.getByTestId("page-header-desktop-actions"));
      fireEvent.click(desktop.getByRole("button", { name: "More actions", hidden: true }));
      fireEvent.click(await screen.findByText("Delete"));
      expect(remove.onClick).toHaveBeenCalledTimes(1);
    });

    it("draws a form's Cancel quiet beside its solid Save", () => {
      renderWithProviders(
        <PageHeader>
          <PageHeader.Title>Edit album</PageHeader.Title>
          <PageHeader.Actions
            actions={[
              act("Cancel", { ghost: true, phone: "hidden" }),
              act("Save", { primary: true }),
              act("Archive"),
            ]}
          />
        </PageHeader>,
      );
      const desktop = within(screen.getByTestId("page-header-desktop-actions"));
      const button = (name: string) =>
        desktop.getByRole("button", { name: new RegExp(name), hidden: true });
      // jsdom can't resolve the colour tokens, so compare styles: the ghost
      // differs from a plain outline action, which differs from the solid.
      expect(button("Cancel").className).not.toBe(button("Archive").className);
      expect(button("Save").className).not.toBe(button("Archive").className);
      expect(desktop.getAllByRole("button", { hidden: true }).map((b) => b.textContent)).toEqual([
        "iCancel",
        "iSave",
        "iArchive",
      ]);
    });

    it("exposes a toggle action as pressed at both widths", () => {
      renderWithProviders(
        <PageHeader>
          <PageHeader.Title>Set</PageHeader.Title>
          <PageHeader.Actions actions={[act("Suggestions", { pressed: true })]} />
        </PageHeader>,
      );
      const phone = within(screen.getByTestId("page-header-phone-actions"));
      expect(phone.getByRole("button", { name: "Suggestions", pressed: true })).toBeTruthy();
      const desktop = within(screen.getByTestId("page-header-desktop-actions"));
      expect(
        desktop.getByRole("button", { name: /Suggestions/, pressed: true, hidden: true }),
      ).toBeTruthy();
    });

    it("disables a loading action everywhere it shows", async () => {
      renderWithProviders(
        <PageHeader>
          <PageHeader.Title>Edit album</PageHeader.Title>
          <PageHeader.Actions
            actions={[
              act("Save", { loading: true, primary: true }),
              act("Sync", { loading: true, desktop: "menu", phone: "menu" }),
            ]}
          />
        </PageHeader>,
      );
      const phone = within(screen.getByTestId("page-header-phone-actions"));
      expect((phone.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      const desktop = within(screen.getByTestId("page-header-desktop-actions"));
      const save = desktop.getAllByRole("button", { hidden: true })[0] as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      expect(save.hasAttribute("data-loading")).toBe(true);
      fireEvent.click(desktop.getByRole("button", { name: "More actions", hidden: true }));
      const items = await screen.findAllByRole("menuitem", { name: "Sync", hidden: true });
      expect(items[0].hasAttribute("data-disabled")).toBe(true);
    });

    it("puts the custom slots beside the generated controls", () => {
      renderWithProviders(
        <PageHeader>
          <PageHeader.Title>Tracks</PageHeader.Title>
          <PageHeader.Actions
            desktop={<button>List / Grid</button>}
            phone={<button>Menu</button>}
          />
        </PageHeader>,
      );
      expect(screen.getByTestId("page-header-desktop-actions").textContent).toBe("List / Grid");
      expect(screen.getByTestId("page-header-phone-actions").textContent).toBe("Menu");
    });
  });

  it("marks tabs so they replace the rule, and puts the toolbar under the header", () => {
    renderWithProviders(
      <>
        <PageHeader>
          <PageHeader.Title>Chores</PageHeader.Title>
          <PageHeader.Tabs>
            <div role="tablist">tabs</div>
          </PageHeader.Tabs>
        </PageHeader>
        <PageHeader.Toolbar>
          <input aria-label="Search" />
        </PageHeader.Toolbar>
      </>,
    );
    const header = screen.getByTestId("page-header");
    expect(header.querySelector("[data-page-header-tabs]")?.textContent).toBe("tabs");
    const toolbar = screen.getByTestId("page-header-toolbar");
    expect(header.contains(toolbar)).toBe(false);
    expect(within(toolbar).getByRole("textbox", { name: "Search" })).toBeTruthy();
  });

  it("spaces header tabs on desktop and keeps a phone strip joined", () => {
    // Each tab stands on the rule with its own outline: no -2px overlap.
    expect(pageHeader.tabs["& [role=tablist]"].gap).toEqual({ base: 0, md: 1 });
  });
});
