// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DiscogsImport } from "@/services/internalApi/discogsImports";

const api = vi.hoisted(() => ({
  listDiscogsImports: vi.fn(),
  startDiscogsImport: vi.fn(),
  getDiscogsImportLog: vi.fn(),
}));
vi.mock("@/services/internalApi/discogsImports", () => api);

import {
  ACTIVE_POLL_MS,
  DiscogsImportWatcher,
  importFor,
  useDiscogsImportLog,
  useDiscogsImportsQuery,
  useStartDiscogsImport,
} from "./useDiscogsImports";

const job = (patch: Partial<DiscogsImport> = {}): DiscogsImport => ({
  id: 1,
  username: "dj",
  status: "running",
  phase: "fetching",
  found: 3,
  total: 3,
  fetched: 1,
  added: 0,
  removed: 0,
  failed_releases: 0,
  last_error: null,
  attempts: 1,
  stalled: false,
  created_at: "2026-11-24T10:00:00.000Z",
  started_at: "2026-11-24T10:00:00.000Z",
  updated_at: "2026-11-24T10:00:00.000Z",
  finished_at: null,
  ...patch,
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("importFor", () => {
  it("finds a username's import without case, and nothing without a username", () => {
    const imports = [job({ id: 2, username: "Alice" }), job({ id: 3, username: "bob" })];
    expect(importFor(imports, "alice")?.id).toBe(2);
    expect(importFor(imports, "carol")).toBeNull();
    expect(importFor(imports, null)).toBeNull();
    expect(importFor(undefined, "alice")).toBeNull();
  });
});

describe("useDiscogsImportsQuery", () => {
  it("polls every 2 s while an import runs and stops once none does", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    api.listDiscogsImports
      .mockResolvedValueOnce({ imports: [job()] })
      .mockResolvedValue({ imports: [job({ status: "completed" })] });
    const { wrapper } = setup();
    renderHook(() => useDiscogsImportsQuery(), { wrapper });

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(api.listDiscogsImports).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS));
    expect(api.listDiscogsImports).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS * 5));
    expect(api.listDiscogsImports).toHaveBeenCalledTimes(2);
  });

  it("keeps looking at the idle rate on a page that offers an import", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    api.listDiscogsImports.mockResolvedValue({ imports: [] });
    const { wrapper } = setup();
    renderHook(() => useDiscogsImportsQuery({ idlePollMs: 15_000 }), { wrapper });

    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(api.listDiscogsImports).toHaveBeenCalledTimes(2);
  });
});

describe("useStartDiscogsImport", () => {
  it("puts the import it got back into the list, in place of that library's older one", async () => {
    api.startDiscogsImport.mockResolvedValue({ import: job({ id: 9 }), created: false });
    const { client, wrapper } = setup();
    client.setQueryData(["discogs", "imports"], {
      imports: [job({ id: 4, status: "failed" }), job({ id: 5, username: "other" })],
    });
    const { result } = renderHook(() => useStartDiscogsImport(), { wrapper });

    await act(() => result.current.mutateAsync("dj"));

    expect(api.startDiscogsImport).toHaveBeenCalledWith("dj");
    expect(
      client
        .getQueryData<{ imports: DiscogsImport[] }>(["discogs", "imports"])
        ?.imports.map((i) => i.id),
    ).toEqual([9, 5]);
  });

  it("starts a list when none was cached", async () => {
    api.startDiscogsImport.mockResolvedValue({ import: job({ id: 9 }), created: true });
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useStartDiscogsImport(), { wrapper });
    await act(() => result.current.mutateAsync(undefined));
    expect(client.getQueryData(["discogs", "imports"])).toEqual({ imports: [job({ id: 9 })] });
  });
});

describe("DiscogsImportWatcher", () => {
  it("refreshes the library pages when an import ends or saves a batch, not on first sight", async () => {
    api.listDiscogsImports.mockResolvedValue({ imports: [job({ id: 1, added: 0 })] });
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(<DiscogsImportWatcher />, { wrapper });
    await waitFor(() => expect(client.getQueryData(["discogs", "imports"])).toBeDefined());
    await act(async () => {});
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      client.setQueryData(["discogs", "imports"], { imports: [job({ id: 1, added: 25 })] });
    });
    await waitFor(() =>
      expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
        ["friends"],
        ["settings", "default-library"],
        ["home"],
        ["albums"],
        ["tracks"],
      ]),
    );

    invalidate.mockClear();
    await act(async () => {
      client.setQueryData(["discogs", "imports"], {
        imports: [job({ id: 1, added: 25, status: "completed" })],
      });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(5));

    invalidate.mockClear();
    await act(async () => {
      client.setQueryData(["discogs", "imports"], {
        imports: [job({ id: 1, added: 25, status: "completed" })],
      });
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useDiscogsImportLog", () => {
  it("reads on from the last line every second while running, splitting multi-line entries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    api.getDiscogsImportLog
      .mockResolvedValueOnce({ lines: [{ id: 1, line: "Found release ID: 1\n\n" }], next_after: 1 })
      .mockResolvedValueOnce({
        lines: [{ id: 2, line: "\n--- Starting Auto-Ingest ---\n\n" }],
        next_after: 2,
      })
      .mockResolvedValue({ lines: [], next_after: 2 });
    const { result } = renderHook(() => useDiscogsImportLog(7, true));

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.lines).toEqual(["Found release ID: 1"]);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(api.getDiscogsImportLog).toHaveBeenLastCalledWith(7, 1);
    expect(result.current.lines).toEqual(["Found release ID: 1", "--- Starting Auto-Ingest ---"]);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(api.getDiscogsImportLog).toHaveBeenLastCalledWith(7, 2);
  });

  it("reads once for an import that has ended, and starts over for another", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    api.getDiscogsImportLog.mockResolvedValue({ lines: [{ id: 3, line: "done" }], next_after: 3 });
    const { result, rerender } = renderHook(({ id }) => useDiscogsImportLog(id, false), {
      initialProps: { id: 7 as number | null },
    });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(api.getDiscogsImportLog).toHaveBeenCalledTimes(1);
    expect(result.current.lines).toEqual(["done"]);

    rerender({ id: 8 });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(api.getDiscogsImportLog).toHaveBeenLastCalledWith(8, 0);
    expect(result.current.lines).toEqual(["done"]);

    rerender({ id: null });
    expect(result.current.lines).toEqual([]);
  });

  it("reports a failed read", async () => {
    api.getDiscogsImportLog.mockRejectedValueOnce(new Error("HTTP 500"));
    const { result } = renderHook(() => useDiscogsImportLog(7, false));
    await waitFor(() => expect(result.current.error).toBe("HTTP 500"));
  });

  it("names a non-Error failure", async () => {
    api.getDiscogsImportLog.mockRejectedValueOnce("offline");
    const { result } = renderHook(() => useDiscogsImportLog(7, false));
    await waitFor(() => expect(result.current.error).toBe("offline"));
  });

  it("clears its timer on unmount", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    api.getDiscogsImportLog.mockResolvedValue({ lines: [], next_after: 0 });
    const { unmount } = renderHook(() => useDiscogsImportLog(7, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getDiscogsImportLog).toHaveBeenCalledTimes(1);
  });

  it("drops a read that lands after unmount, success or failure", async () => {
    let resolve!: (v: unknown) => void;
    api.getDiscogsImportLog.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const first = renderHook(() => useDiscogsImportLog(7, false));
    first.unmount();
    await act(async () => resolve({ lines: [{ id: 1, line: "late" }], next_after: 1 }));
    expect(first.result.current.lines).toEqual([]);

    let reject!: (e: unknown) => void;
    api.getDiscogsImportLog.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    const second = renderHook(() => useDiscogsImportLog(7, false));
    second.unmount();
    await act(async () => reject(new Error("late")));
    expect(second.result.current.error).toBeNull();
  });
});
