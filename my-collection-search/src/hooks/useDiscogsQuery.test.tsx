// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  setDiscogsSyncOpen: vi.fn(),
  resetDiscogs: vi.fn(),
  pushDiscogsLine: vi.fn(),
  setDiscogsDone: vi.fn(),
  setDiscogsError: vi.fn(),
  syncDiscogsStream: vi.fn(),
}));
vi.mock("@/providers/SettingsDialogProvider", () => ({
  useSettingsDialogs: () => ({ setDiscogsSyncOpen: mocks.setDiscogsSyncOpen }),
}));
vi.mock("@/providers/SyncStreamsProvider", () => ({
  useSyncStreams: () => ({
    resetDiscogs: mocks.resetDiscogs,
    pushDiscogsLine: mocks.pushDiscogsLine,
    setDiscogsDone: mocks.setDiscogsDone,
    setDiscogsError: mocks.setDiscogsError,
  }),
}));
vi.mock("@/services/internalApi/discogs", () => ({ syncDiscogsStream: mocks.syncDiscogsStream }));

import { useSyncDiscogs } from "./useDiscogsQuery";

function render() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useSyncDiscogs(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.syncDiscogsStream.mockImplementation(async (_u: string, onLine: (l: string) => void) => {
    onLine("Found release ID: 1");
  });
});

describe("useSyncDiscogs", () => {
  it("refreshes every page that reads the library when a sync ends, so they leave their empty states", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSyncDiscogs(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await act(() => result.current.mutateAsync({ showDialog: false }));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["friends"],
      ["settings", "default-library"],
      ["home"],
      ["albums"],
      ["tracks"],
    ]);
  });

  it("refreshes them after a failed sync too: whatever it saved is kept", async () => {
    mocks.syncDiscogsStream.mockRejectedValue(new Error("connection lost"));
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSyncDiscogs(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await act(() => result.current.mutateAsync({}).catch(() => null));
    expect(invalidate).toHaveBeenCalledTimes(5);
    expect(mocks.setDiscogsError).toHaveBeenCalledWith("connection lost");
  });

  it("opens the progress dialog by default", async () => {
    const { result } = render();
    await act(() => result.current.mutateAsync({ username: "dj" }));
    expect(mocks.setDiscogsSyncOpen).toHaveBeenCalledWith(true);
    expect(mocks.pushDiscogsLine).toHaveBeenCalledWith("Found release ID: 1");
    expect(mocks.setDiscogsDone).toHaveBeenCalledWith(true);
  });

  it("streams without the dialog when a row shows its own progress", async () => {
    const { result } = render();
    await act(() => result.current.mutateAsync({ username: "dj", showDialog: false }));
    expect(mocks.setDiscogsSyncOpen).not.toHaveBeenCalled();
    expect(mocks.resetDiscogs).toHaveBeenCalled();
    expect(mocks.pushDiscogsLine).toHaveBeenCalledWith("Found release ID: 1");
  });
});
