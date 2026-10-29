// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import PlaylistPlayer from "./PlaylistPlayer";
let count = 0;
let mode: { target: string } | null = null;
let path: string | null = "/settings";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ playlistLength: count }),
}));
vi.mock("@/providers/PlaybackTargetProvider", () => ({ useOptionalPlaybackTarget: () => mode }));
vi.mock("./player/PlayOnPicker", () => ({ default: () => <button>Playback target</button> }));
let notice: { tone: "error"; text: string } | null = null;
vi.mock("./player/ServerNotice", () => ({
  default: ({ notice: n }: { notice: { text: string } }) => <p>{n.text}</p>,
  useServerNotice: () => notice,
}));
vi.mock("./PlayerControls", () => ({
  default: ({ onQueueToggle }: { onQueueToggle: () => void }) => (
    <button onClick={onQueueToggle}>Local controls</button>
  ),
}));
vi.mock("./QueueDrawer", () => ({
  default: ({
    isOpen,
    onClose,
    onQueueToggle,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onQueueToggle: () => void;
  }) =>
    isOpen ? (
      <div>
        Local queue<button onClick={onClose}>Close queue</button>
        <button onClick={onQueueToggle}>Toggle queue</button>
      </div>
    ) : null,
}));
describe("global player mode presentation", () => {
  afterEach(() => {
    count = 0;
    mode = null;
    path = "/settings";
    setViewportWidth(1280);
  });
  it("preserves local controls and queue drawer, and offers target selection even with an empty local queue", () => {
    count = 0;
    mode = null;
    const { rerender } = renderWithProviders(<PlaylistPlayer />);
    expect(screen.queryByTestId("floating-player")).toBeNull();
    mode = { target: "" };
    rerender(<PlaylistPlayer />);
    expect(screen.getByText("Playback target")).toBeTruthy();
    count = 1;
    rerender(<PlaylistPlayer />);
    expect(screen.getByText("Local controls")).toBeTruthy();
    expect(document.documentElement.hasAttribute("data-player")).toBe(true);
    fireEvent.click(screen.getByText("Local controls"));
    expect(screen.getByText("Local queue")).toBeTruthy();
    expect(screen.getByTestId("floating-player")).toBeTruthy();
    fireEvent.click(screen.getByText("Close queue"));
    expect(screen.queryByText("Local queue")).toBeNull();
    fireEvent.click(screen.getByText("Local controls"));
    fireEvent.click(screen.getByText("Toggle queue"));
    // A server keeps its player in view, empty local queue or not.
    count = 0;
    mode = { target: "lounge" };
    rerender(<PlaylistPlayer />);
    expect(document.documentElement.hasAttribute("data-player")).toBe(true);
    expect(screen.getByText("Playback target")).toBeTruthy();
    expect(screen.getByTestId("floating-player")).toBeTruthy();
    notice = { tone: "error", text: "Connection lost" };
    rerender(<PlaylistPlayer />);
    expect(screen.getByText("Connection lost")).toBeTruthy();
    notice = null;
    count = 1;
    mode = { target: "" };
    rerender(<PlaylistPlayer />);
    expect(screen.getByText("Local controls")).toBeTruthy();
  });
  it("keeps the docked bar under the desktop queue panel", () => {
    count = 2;
    mode = { target: "" };
    renderWithProviders(<PlaylistPlayer />);
    fireEvent.click(screen.getByText("Local controls"));
    expect(screen.getByText("Local queue")).toBeTruthy();
    expect(screen.getByTestId("floating-player")).toBeTruthy();
    fireEvent.click(screen.getByText("Close queue"));
    expect(screen.queryByText("Local queue")).toBeNull();
  });
  it("hides the mini player while Now playing is open on phones", () => {
    setViewportWidth(390);
    count = 2;
    mode = { target: "" };
    renderWithProviders(<PlaylistPlayer />);
    fireEvent.click(screen.getByText("Local controls"));
    expect(screen.getByText("Local queue")).toBeTruthy();
    expect(screen.queryByTestId("floating-player")).toBeNull();
    fireEvent.click(screen.getByText("Close queue"));
    expect(screen.getByTestId("floating-player")).toBeTruthy();
  });
  it("hides local floating controls during mobile album/track editing", () => {
    setViewportWidth(390);
    count = 1;
    mode = { target: "" };
    path = "/albums/album/edit";
    const { rerender } = renderWithProviders(<PlaylistPlayer />);
    expect(screen.queryByTestId("floating-player")).toBeNull();
    path = "/tracks/track/edit";
    rerender(<PlaylistPlayer />);
    expect(screen.queryByTestId("floating-player")).toBeNull();
    path = null;
    rerender(<PlaylistPlayer />);
    expect(screen.getByTestId("floating-player")).toBeTruthy();
    setViewportWidth(1280);
    path = "/settings";
  });
});
