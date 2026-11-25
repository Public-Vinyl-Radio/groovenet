"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { isDiscogsImportActive, type DiscogsImportListResponse } from "@groovenet/contracts";
import { queryKeys } from "@/lib/queryKeys";
import {
  getDiscogsImportLog,
  listDiscogsImports,
  startDiscogsImport,
  type DiscogsImport,
} from "@/services/internalApi/discogsImports";

/** While an import runs, how often its state is read. */
export const ACTIVE_POLL_MS = 2000;
/** With none running, how often a page that offers an import checks for one started elsewhere. */
export const IDLE_POLL_MS = 15_000;

const anyActive = (data: DiscogsImportListResponse | undefined) =>
  data?.imports.some((job) => isDiscogsImportActive(job.status)) ?? false;

/**
 * The latest Discogs import per username (#1274). Every page reads the same
 * query, so a reload, a second device or a tab opened later sees an import
 * that is already running. `idlePollMs` is for pages that offer an import:
 * they look for one started elsewhere even while none is known.
 */
export function useDiscogsImportsQuery(options: { idlePollMs?: number | false } = {}) {
  const idle = options.idlePollMs ?? false;
  return useQuery({
    queryKey: queryKeys.discogsImports(),
    queryFn: listDiscogsImports,
    staleTime: 1000,
    refetchInterval: (query) => (anyActive(query.state.data) ? ACTIVE_POLL_MS : idle),
  });
}

/** The latest import for `username`, matched as Discogs does, without case. */
export function importFor(
  imports: DiscogsImport[] | undefined,
  username: string | null | undefined,
): DiscogsImport | null {
  if (!imports || !username) return null;
  const key = username.toLowerCase();
  return imports.find((job) => job.username.toLowerCase() === key) ?? null;
}

/** Put one import into the cached list, replacing that username's older one. */
function remember(qc: QueryClient, job: DiscogsImport) {
  qc.setQueryData<DiscogsImportListResponse>(queryKeys.discogsImports(), (data) => {
    const key = job.username.toLowerCase();
    const rest = (data?.imports ?? []).filter((other) => other.username.toLowerCase() !== key);
    return { imports: [job, ...rest] };
  });
}

/** Queue an import; the server returns the running one rather than start a second. */
export function useStartDiscogsImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username?: string) => startDiscogsImport(username),
    onSuccess: (result) => remember(qc, result.import),
  });
}

/** What an import's change means for the rest of the app: the library pages read afresh. */
function refreshLibraryPages(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.friends() }),
    qc.invalidateQueries({ queryKey: queryKeys.defaultLibrary() }),
    qc.invalidateQueries({ queryKey: queryKeys.homeRoot() }),
    qc.invalidateQueries({ queryKey: queryKeys.albumsRoot() }),
    qc.invalidateQueries({ queryKey: queryKeys.tracksRoot() }),
  ]);
}

/**
 * Mounted once at the root: reads the imports on load, and whenever one ends
 * (or saves a batch) refreshes the library, Home, Albums and Tracks, wherever
 * the user is by then. Polls only while an import is running.
 */
export function DiscogsImportWatcher() {
  const qc = useQueryClient();
  const { data } = useDiscogsImportsQuery();
  const seen = useRef(new Map<number, { active: boolean; added: number }>());

  useEffect(() => {
    if (!data) return;
    let changed = false;
    for (const job of data.imports) {
      const active = isDiscogsImportActive(job.status);
      const before = seen.current.get(job.id);
      if (before && ((before.active && !active) || job.added > before.added)) changed = true;
      seen.current.set(job.id, { active, added: job.added });
    }
    if (changed) void refreshLibraryPages(qc);
  }, [data, qc]);

  return null;
}

/**
 * An import's progress lines, read on from the last one every second while it
 * runs and once more after it ends. Null `id` reads nothing.
 */
export function useDiscogsImportLog(id: number | null, active: boolean) {
  const [state, setState] = useState<{ id: number | null; lines: string[]; error: string | null }>({
    id,
    lines: [],
    error: null,
  });
  const after = useRef(0);

  if (state.id !== id) {
    after.current = 0;
    setState({ id, lines: [], error: null });
  }

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const page = await getDiscogsImportLog(id, after.current);
        if (cancelled) return;
        after.current = page.next_after;
        const lines = page.lines.flatMap(({ line }) =>
          line.split("\n").filter((text) => text.trim()),
        );
        if (lines.length > 0) {
          setState((s) => ({ ...s, lines: [...s.lines, ...lines], error: null }));
        }
      } catch (error) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
      if (!cancelled && active) timer = setTimeout(read, 1000);
    };
    void read();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, active]);

  return { lines: state.id === id ? state.lines : [], error: state.error };
}
