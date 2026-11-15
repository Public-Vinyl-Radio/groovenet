// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { PRESET_LIST, DEFAULT_ACTIVE_PROFILES } from "@/lib/ranking/profiles";
import type { RankingProfileEntry } from "@groovenet/contracts";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  importing: vi.fn(),
  exporting: vi.fn(),
  useFriend: vi.fn(),
  choose: vi.fn(),
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: { id: 1 } }) }));
vi.mock("@/hooks/useFriendsQuery", () => ({
  useFriendsQuery: () => ({
    friends: [
      { id: 1, username: "Me" },
      { id: 2, username: "Friend" },
    ],
  }),
}));
vi.mock("@/services/internalApi/ranking", () => ({
  fetchRankingProfiles: mocks.list,
  importRankingProfile: mocks.importing,
  exportRankingProfile: mocks.exporting,
  useFriendRankingProfile: mocks.useFriend,
  setActiveRankingProfile: mocks.choose,
}));
import RankingCatalogue from "./RankingCatalogue";
import RankingProfilesPage from "@/app/ranking-profiles/page";
const custom: RankingProfileEntry = { ...PRESET_LIST[0], id: "7", kind: "custom", name: "Mine" };
const imported: RankingProfileEntry = {
  ...custom,
  id: "8",
  name: "Imported",
  origin: "file",
  author: "DJ",
};
const fromFriend: RankingProfileEntry = {
  ...custom,
  id: "9",
  name: "Shared",
  origin: "friend",
  author: "Friend",
  source_handle: "Friend",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockImplementation(async (id: number) => ({
    friend_id: id,
    profiles:
      id === 2
        ? [custom]
        : [
            ...PRESET_LIST,
            custom,
            imported,
            fromFriend,
            { ...custom, id: "10", name: "Anonymous", origin: "file" },
            {
              ...fromFriend,
              id: "11",
              name: "Anonymous friend",
              author: undefined,
              source_handle: undefined,
            },
          ],
    active: DEFAULT_ACTIVE_PROFILES,
  }));
  mocks.importing.mockResolvedValue({
    profile: imported,
    warnings: ["Dropped unknown signal: future"],
  });
  mocks.exporting.mockResolvedValue({ format: "groovenet-ranking-profile" });
  mocks.choose.mockResolvedValue({ friend_id: 1, active: DEFAULT_ACTIVE_PROFILES });
  mocks.useFriend.mockResolvedValue(fromFriend);
});
async function upload(text = "{}", props: Record<string, unknown> = {}) {
  const file = new File([text], "profile.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => text });
  for (const [key, value] of Object.entries(props)) Object.defineProperty(file, key, { value });
  fireEvent.change(screen.getByLabelText("Profile file"), { target: { files: [file] } });
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Import" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
}
it("lists provenance, uses own profiles, exports and copies a friend's independent profile", async () => {
  const create = vi.fn(() => "blob:profile");
  const revoke = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const { user } = renderWithProviders(<RankingProfilesPage />);
  await screen.findByText("Mine");
  expect(screen.getByText("Imported · DJ")).toBeTruthy();
  expect(screen.getByText("From Friend")).toBeTruthy();
  expect(screen.getByText("From a friend")).toBeTruthy();
  await user.click(screen.getAllByRole("button", { name: "Use" })[0]);
  await waitFor(() =>
    expect(mocks.choose).toHaveBeenCalledWith(
      { friend_id: 1, profile_id: "default" },
      expect.anything(),
    ),
  );
  await user.click(screen.getAllByRole("button", { name: "Export" })[0]);
  await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:profile"));
  expect(click).toHaveBeenCalled();
  click.mockRestore();
  await user.selectOptions(screen.getByLabelText("Friend library"), "2");
  await user.click(await screen.findByRole("button", { name: "Use Friend’s profile" }));
  await waitFor(() => expect(mocks.useFriend).toHaveBeenCalledWith("7", 1, 2));
  expect(screen.getByText(/Later edits to theirs won’t change yours/)).toBeTruthy();
});
it("imports with warnings, then can reopen for a clean import", async () => {
  const { user } = renderWithProviders(<RankingCatalogue />);
  await user.click(screen.getByRole("button", { name: "Import profile" }));
  await upload();
  await user.click(screen.getByRole("button", { name: "Import" }));
  await screen.findByText("Dropped unknown signal: future");
  expect(mocks.importing).toHaveBeenCalledWith(1, "{}");
  expect(screen.getByText(/Review the warnings/)).toBeTruthy();
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /close/i }));
  mocks.importing.mockResolvedValue({ profile: imported, warnings: [] });
  await user.click(screen.getByRole("button", { name: "Import profile" }));
  await upload();
  await user.click(screen.getByRole("button", { name: "Import" }));
  await screen.findByText(/Ready to use in your library/);
});
it("shows server import errors and rejects oversized or unreadable local files", async () => {
  mocks.importing.mockRejectedValue(new Error("Unknown field script"));
  const { user } = renderWithProviders(<RankingCatalogue />);
  await user.click(screen.getByRole("button", { name: "Import profile" }));
  fireEvent.change(screen.getByLabelText("Profile file"), { target: { files: [] } });
  const large = new File(["x"], "big.json");
  Object.defineProperty(large, "size", { value: 40000 });
  fireEvent.change(screen.getByLabelText("Profile file"), { target: { files: [large] } });
  await screen.findByText(/exceeds 32768 bytes/);
  const unreadable = new File(["x"], "bad.json");
  Object.defineProperty(unreadable, "text", {
    value: async () => {
      throw new Error("read failed");
    },
  });
  fireEvent.change(screen.getByLabelText("Profile file"), { target: { files: [unreadable] } });
  await screen.findByText("Could not read profile file");
  await upload();
  await user.click(screen.getByRole("button", { name: "Import" }));
  await screen.findByText("Unknown field script");
});
it("shows list and friend-list failures", async () => {
  mocks.list.mockRejectedValue(new Error("offline"));
  const { user } = renderWithProviders(<RankingCatalogue />);
  await screen.findByText("Could not load your profiles.");
  await user.selectOptions(screen.getByLabelText("Friend library"), "2");
  await screen.findByText("Could not load your friend’s profiles.");
});
it("shows an empty friend's library", async () => {
  mocks.list.mockResolvedValue({
    friend_id: 2,
    profiles: PRESET_LIST,
    active: DEFAULT_ACTIVE_PROFILES,
  });
  const { user } = renderWithProviders(<RankingCatalogue />);
  await user.selectOptions(screen.getByLabelText("Friend library"), "2");
  await screen.findByText("No custom profiles in this library.");
});
it.each(["export", "choose", "friend"])("shows %s failures", async (operation) => {
  mocks.exporting.mockRejectedValue(new Error("export failed"));
  mocks.choose.mockRejectedValue(new Error("choose failed"));
  mocks.useFriend.mockRejectedValue(new Error("friend failed"));
  const { user } = renderWithProviders(<RankingCatalogue />);
  await screen.findByText("Mine");
  if (operation === "friend") {
    await user.selectOptions(screen.getByLabelText("Friend library"), "2");
    await user.click(await screen.findByRole("button", { name: "Use Friend’s profile" }));
  } else
    await user.click(
      screen.getAllByRole("button", { name: operation === "export" ? "Export" : "Use" })[0],
    );
  await screen.findByText(`${operation} failed`);
});
