// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { sampleTrack } from "@/stories/fixtures/track";
import { reprobeTrackAudio } from "@/services/internalApi/tracks";
import { useTrackStore } from "@/stores/trackStore";
import FileSection from "./FileSection";

vi.mock("@/services/internalApi/tracks", () => ({ reprobeTrackAudio: vi.fn() }));
const track = { ...sampleTrack, local_audio_url: "/audio/a.m4a" };
beforeEach(() => vi.clearAllMocks());
describe("File section", () => {
  it("only probes on request and hydrates the shared track", async () => {
    const updated = { ...track, audio_codec: "alac" };
    vi.mocked(reprobeTrackAudio).mockResolvedValue(updated);
    const { user } = renderWithProviders(<FileSection track={track} />);
    expect(reprobeTrackAudio).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Re-probe" }));
    await waitFor(() => expect(useTrackStore.getState().tracks).toBeTruthy());
    expect(reprobeTrackAudio).toHaveBeenCalledWith(track);
    expect([...useTrackStore.getState().tracks.values()]).toContainEqual(updated);
  });
  it.each([new Error("File missing"), "failure"])("shows probe errors", async (error) => {
    vi.mocked(reprobeTrackAudio).mockRejectedValue(error);
    const { user } = renderWithProviders(<FileSection track={track} />);
    await user.click(screen.getByRole("button", { name: "Re-probe" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      error instanceof Error ? error.message : "Re-probe failed",
    );
  });
  it("disables re-probe for streams", () => {
    renderWithProviders(<FileSection track={{ ...track, local_audio_url: undefined }} />);
    expect((screen.getByRole("button", { name: "Re-probe" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
