// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { sampleTrack } from "@/stories/fixtures/track";
import FileInfo, { FileInfoDetails } from "./FileInfo";

const track = {
  ...sampleTrack,
  local_audio_url: "/audio/test.m4a",
  audio_source: "apple_music" as const,
  audio_codec: "alac",
  audio_lossless: true,
  audio_sample_rate: 96000,
  audio_bit_depth: 24,
  audio_probed_at: "2026-11-06T10:00:00Z",
};

describe("File info", () => {
  it.each([false, true])("opens and closes the file details (mobile %s)", async (mobile) => {
    const { user } = renderWithProviders(<FileInfo track={track} mobile={mobile} />);
    expect(screen.queryByText("Lossless")).toBeNull();
    await user.click(screen.getByRole("button", { name: "File info: ALAC 24/96" }));
    expect(await screen.findByText("Lossless")).toBeTruthy();
    expect(screen.getByText("Apple Music")).toBeTruthy();
    expect(screen.getByText(/Probed/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "View track" }).getAttribute("href")).toContain(
      `friend_id=${track.friend_id}`,
    );
    await user.click(await screen.findByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /close/i })).toBeNull());
  });
  it("keeps the mobile tag at standard size with an invisible touch area", () => {
    renderWithProviders(<FileInfo track={track} mobile />);
    const button = screen.getByRole("button", { name: "File info: ALAC 24/96" });
    const tag = button.closest("[class]") as HTMLElement;
    expect(getComputedStyle(tag).minHeight).not.toBe("44px");
    expect(getComputedStyle(button).minHeight).not.toBe("44px");
  });
  it("shows the full path and pending metadata without a track link", () => {
    renderWithProviders(
      <FileInfoDetails
        track={{ ...track, audio_probed_at: null, audio_lossless: null }}
        fullPath
      />,
    );
    expect(screen.getByText(/No metadata yet/)).toBeTruthy();
    expect(screen.getByText("/audio/test.m4a")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("re-probes in details and reports errors", async () => {
    const onReprobe = vi
      .fn()
      .mockRejectedValueOnce(new Error("probe failed"))
      .mockRejectedValueOnce("failed")
      .mockResolvedValueOnce(undefined);
    const { user } = renderWithProviders(<FileInfo track={track} fullPath onReprobe={onReprobe} />);
    await user.click(screen.getByRole("button", { name: /^File info:/ }));
    await user.click(await screen.findByRole("button", { name: "Re-probe" }));
    expect((await screen.findByRole("alert")).textContent).toBe("probe failed");
    await user.click(screen.getByRole("button", { name: "Re-probe" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Re-probe failed");
    await user.click(screen.getByRole("button", { name: "Re-probe" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(onReprobe).toHaveBeenCalledTimes(3);
  });
  it("clearly labels nominal stream values", () => {
    renderWithProviders(<FileInfoDetails track={{ ...track, local_audio_url: undefined }} />);
    expect(screen.getByText("Streamed")).toBeTruthy();
    expect(screen.getByText("Lossy")).toBeTruthy();
    expect(screen.getByText(/Nominal stream values, not measured/)).toBeTruthy();
    expect(screen.queryByText(/Probed/)).toBeNull();
  });
});
