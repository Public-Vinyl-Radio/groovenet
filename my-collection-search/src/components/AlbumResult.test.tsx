// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Album } from "@/types/track";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useAlbum", () => ({ useAlbum: () => undefined }));
vi.mock("@/hooks/useAlbumsQuery", () => ({
  useUpdateAlbumMutation: () => ({ mutateAsync: vi.fn() }),
}));
// The care dialog has its own tests; here it only has to open, for this album.
vi.mock("@/components/records/RecordActionDialog", () => ({
  default: (props: { releaseId: string; friendId: number; onOpenChange: (open: boolean) => void }) => (
    <div role="dialog" aria-label="Log care">
      {props.releaseId}:{props.friendId}
      <button onClick={() => props.onOpenChange(false)}>Close care</button>
    </div>
  ),
}));

import AlbumResult from "./AlbumResult";

const album: Album = {
  release_id: "rel",
  friend_id: 7,
  title: "Blue Lines",
  artist: "Massive Attack",
  track_count: 9,
};

afterEach(() => vi.clearAllMocks());

describe("AlbumResult care action", () => {
  it("opens the care dialog for this album from its menu, and closes it", async () => {
    const { user } = renderWithProviders(<AlbumResult album={album} />);

    expect(screen.queryByRole("dialog", { name: "Log care" })).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Log Care/ }));

    const dialog = await screen.findByRole("dialog", { name: "Log care" });
    expect(dialog.textContent).toContain("rel:7");

    await user.click(screen.getByRole("button", { name: "Close care" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log care" })).toBeNull());
  });
});
