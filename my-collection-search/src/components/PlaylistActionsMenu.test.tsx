// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { chooseMenuItem, renderWithProviders } from "@/test/renderWithProviders";
import type { RankingProfileEntry } from "@groovenet/contracts";
import PlaylistActionsMenu from "./PlaylistActionsMenu";

const handlers = () => ({
  onSortGreedy: vi.fn(),
  onSortGenetic: vi.fn(),
  onSortCohesiveBlocks: vi.fn(),
  onExportJson: vi.fn(),
  onImportJson: vi.fn(),
  onExportPdf: vi.fn(),
  onOpenSaveDialog: vi.fn(),
  enqueuePlaylist: vi.fn(),
});

afterEach(() => vi.clearAllMocks());

const profile = (id: string, name: string) =>
  ({ id, name, kind: "preset", surfaces: [], description: "" }) as unknown as RankingProfileEntry;
const ordering = {
  value: "selector",
  options: [
    profile("default", "Default"),
    profile("beatmatcher", "Beatmatcher"),
    profile("selector", "Selector"),
  ],
  onChange: vi.fn(),
};

async function openModal(props: Partial<React.ComponentProps<typeof PlaylistActionsMenu>> = {}) {
  const h = handlers();
  const rendered = renderWithProviders(
    <PlaylistActionsMenu {...h} playlistName="Late Night" summary="12 tracks · 1h 4m" {...props} />,
  );
  await rendered.user.click(
    screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0],
  );
  await screen.findByText("12 tracks · 1h 4m");
  return { ...rendered, h };
}

describe("PlaylistActionsMenu phone modal (#751)", () => {
  it("puts Order by over the two sorts that use it, and Greedy apart (#1193, #1231)", async () => {
    const onChange = vi.fn();
    const { user } = await openModal({ ordering: { ...ordering, onChange } });
    const picker = screen.getByLabelText("Order by") as HTMLSelectElement;
    expect(picker.value).toBe("selector");
    await user.selectOptions(picker, "beatmatcher");
    expect(onChange).toHaveBeenCalledWith("beatmatcher");

    const sortGroup = screen.getByText("Sort").parentElement as HTMLElement;
    expect(sortGroup.contains(picker)).toBe(true);
    expect(sortGroup.textContent).toContain("Genetic order");
    expect(sortGroup.textContent).toContain("Cohesive blocks");
    expect(sortGroup.textContent).not.toContain("Greedy order");
    expect((screen.getByText("More").parentElement as HTMLElement).textContent).toContain(
      "Greedy order",
    );
  });

  it("has no view choice: phones always show cards (#1231)", async () => {
    await openModal({ ordering, view: { value: "row", onChange: vi.fn() } });
    expect(screen.queryByText("View")).toBeNull();
    expect(screen.queryByText("List")).toBeNull();
  });

  it("shows the summary and title, and runs the tiles", async () => {
    const { user, h } = await openModal({ onDuplicate: vi.fn() });
    expect(screen.getByText("Late Night")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Enqueue" }));
    await waitFor(() => expect(h.enqueuePlaylist).toHaveBeenCalled());
  });

  it("saves and duplicates", async () => {
    const onDuplicate = vi.fn();
    const { user, h } = await openModal({ onDuplicate });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.onOpenSaveDialog).toHaveBeenCalled());
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(onDuplicate).toHaveBeenCalled());
  });

  it("renames from the header button, only when renaming is available", async () => {
    const onRename = vi.fn();
    const { user, unmount } = await openModal({ onRename });
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(onRename).toHaveBeenCalled());
    unmount();

    await openModal();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
  });

  it("sorts and exports, and has no temporary maintenance actions", async () => {
    const { user, h } = await openModal({ onOpenRecommendations: vi.fn() });
    expect(screen.queryByText(/Enqueue Missing Downloads/i)).toBeNull();
    expect(screen.queryByText(/Backfill Duration/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Greedy order" }));
    await waitFor(() => expect(h.onSortGreedy).toHaveBeenCalled());
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Genetic order" }));
    await waitFor(() => expect(h.onSortGenetic).toHaveBeenCalled());
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Cohesive blocks" }));
    await waitFor(() => expect(h.onSortCohesiveBlocks).toHaveBeenCalled());
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Export JSON" }));
    await waitFor(() => expect(h.onExportJson).toHaveBeenCalled());
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Export PDF" }));
    await waitFor(() => expect(h.onExportPdf).toHaveBeenCalled());
    await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
    await user.click(await screen.findByRole("button", { name: "Import & append JSON" }));
    await waitFor(() => expect(h.onImportJson).toHaveBeenCalled());
  });

  it("disables a sort that is running and shows Sorting...", async () => {
    await openModal({ isGeneticSorting: true, isCohesiveBlocksSorting: true });
    const sorting = screen.getAllByRole("button", { name: "Sorting..." }) as HTMLButtonElement[];
    expect(sorting).toHaveLength(2);
    expect(sorting.every((b) => b.disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: "Suggestions" })).toBeNull();
  });

  it("defaults the strip when no summary or name is given", async () => {
    const rendered = renderWithProviders(<PlaylistActionsMenu {...handlers()} />);
    await rendered.user.click(
      screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0],
    );
    expect(await screen.findByText("Playlist actions", { selector: "h2" })).toBeTruthy();
  });
});

it("opens Suggestions from the phone action sheet", async () => {
  const onOpenRecommendations = vi.fn();
  const { user } = await openModal({ onOpenRecommendations });
  await user.click(screen.getByRole("button", { name: "Suggestions" }));
  await waitFor(() => expect(onOpenRecommendations).toHaveBeenCalledOnce());
});

it("opens Suggestions from the desktop menu", async () => {
  const onOpenRecommendations = vi.fn();
  const { user } = renderWithProviders(
    <PlaylistActionsMenu {...handlers()} onOpenRecommendations={onOpenRecommendations} />,
  );
  await chooseMenuItem(
    user,
    screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[1],
    /^Suggestions$/,
  );
  await waitFor(() => expect(onOpenRecommendations).toHaveBeenCalledOnce());
});

it("offers Create set in the phone action sheet only when a handler is given", async () => {
  const onCreateSet = vi.fn();
  const { user, unmount } = await openModal({ onCreateSet });
  await user.click(screen.getByRole("button", { name: "Create set" }));
  await waitFor(() => expect(onCreateSet).toHaveBeenCalledOnce());
  unmount();

  await openModal();
  expect(screen.queryByRole("button", { name: "Create set" })).toBeNull();
});

it("offers Create set in the desktop menu only when a handler is given", async () => {
  const onCreateSet = vi.fn();
  const { user, unmount } = renderWithProviders(
    <PlaylistActionsMenu {...handlers()} onCreateSet={onCreateSet} />,
  );
  await chooseMenuItem(
    user,
    screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[1],
    /^Create set$/,
  );
  await waitFor(() => expect(onCreateSet).toHaveBeenCalledOnce());
  unmount();

  const none = renderWithProviders(<PlaylistActionsMenu {...handlers()} />);
  await none.user.click(
    screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[1],
  );
  expect(screen.queryByRole("menuitem", { name: /Create set/, hidden: true })).toBeNull();
});

describe("PlaylistActionsMenu desktop: order and view in the menu (#1231)", () => {
  const desktopTrigger = () =>
    screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[1];

  it("names the current profile on the Order by item, above Genetic and Cohesive", async () => {
    const { user } = renderWithProviders(
      <PlaylistActionsMenu {...handlers()} ordering={ordering} />,
    );
    await user.click(desktopTrigger());
    const trigger = await screen.findByTestId("order-by-trigger");
    expect(trigger.textContent).toContain("Order by: Selector");
    const items = screen.getAllByRole("menuitem", { hidden: true }).map((el) => el.textContent);
    const at = (label: RegExp) => items.findIndex((text) => label.test(text ?? ""));
    expect(at(/Greedy Order/)).toBeLessThan(at(/Order by/));
    expect(at(/Order by/)).toBeLessThan(at(/Genetic Order/));
    expect(at(/Genetic Order/)).toBeLessThan(at(/Cohesive Blocks/));
  });

  it("chooses a profile from the Order by submenu", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <PlaylistActionsMenu {...handlers()} ordering={{ ...ordering, onChange }} />,
    );
    await user.click(desktopTrigger());
    await user.click(await screen.findByTestId("order-by-trigger"));
    await user.click(
      await screen.findByRole("menuitemradio", { name: /Beatmatcher/, hidden: true }),
    );
    expect(onChange).toHaveBeenCalledWith("beatmatcher");
  });

  it("switches the view from the menu", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <PlaylistActionsMenu {...handlers()} view={{ value: "row", onChange }} />,
    );
    await user.click(desktopTrigger());
    const list = await screen.findByRole("menuitemradio", { name: /List/, hidden: true });
    expect(list.getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("menuitemradio", { name: /Grid/, hidden: true }));
    expect(onChange).toHaveBeenCalledWith("card");
  });

  it("leaves out Order by and View when not given", async () => {
    const { user } = renderWithProviders(<PlaylistActionsMenu {...handlers()} />);
    await user.click(desktopTrigger());
    await screen.findByRole("menuitem", { name: /Greedy Order/, hidden: true });
    expect(screen.queryByTestId("order-by-trigger")).toBeNull();
    expect(screen.queryByRole("menuitemradio", { hidden: true })).toBeNull();
  });
});

it("reads plain Order by when the chosen profile isn't among the options (#1231)", async () => {
  const { user } = renderWithProviders(
    <PlaylistActionsMenu {...handlers()} ordering={{ ...ordering, value: "gone" }} />,
  );
  await user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[1]);
  expect((await screen.findByTestId("order-by-trigger")).textContent).toBe("Order by");
});

describe("PlaylistActionsMenu visibility (#1284)", () => {
  it("makes a household playlist private from the desktop menu", async () => {
    const onToggle = vi.fn();
    const { user } = renderWithProviders(
      <PlaylistActionsMenu {...handlers()} visibility={{ value: "household", onToggle }} />,
    );
    await chooseMenuItem(
      user,
      screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[1],
      /Make private/,
    );
    await waitFor(() => expect(onToggle).toHaveBeenCalledOnce());
  });

  it("shares a private playlist from the phone action sheet", async () => {
    const onToggle = vi.fn();
    const { user } = await openModal({ visibility: { value: "private", onToggle } });
    await user.click(screen.getByRole("button", { name: "Share with household" }));
    await waitFor(() => expect(onToggle).toHaveBeenCalledOnce());
  });

  it("offers nothing to anyone but the owner", async () => {
    await openModal();
    expect(screen.queryByRole("button", { name: /Make private|Share with household/ })).toBeNull();
  });
});
