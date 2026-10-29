"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
  ReactNode,
} from "react";
import type { Playlist, Track } from "@/types/track";
import { importPlaylist } from "@/services/internalApi/playlists";
import {
  useRecommendations,
  type TrackWithEmbedding as TrackWithEmbeddingFromHook,
} from "@/hooks/useRecommendations";
import { usePlaylistsQuery } from "@/hooks/usePlaylistsQuery";
import { moveTrackReorder } from "@/utils/playlist";
import { toaster } from "@/components/ui/toaster";
import {
  buildCompatibilityGraph,
  greedyPath,
  keyToCamelot,
  TrackCompat,
} from "@/lib/playlistOrder";
import { useGenerateGeneticPlaylistMutation } from "@/hooks/useGenerateGeneticPlaylistMutation";

export interface PlaylistInfo {
  id?: number;
  name: string;
}

export interface TrackWithEmbedding extends Track {
  _vectors?: { default?: number[] };
}

/** ---------- small utilities ---------- */
function useLocalStorageState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const s = localStorage.getItem(key);
      return s ? (JSON.parse(s) as T) : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: React.SetStateAction<T>) => {
      setState((prev) => {
        const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch {}
        }
        return value;
      });
    },
    [key],
  );

  const clear = useCallback(() => {
    setState(initial);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  }, [initial, key]);

  return [state, set, clear] as const;
}

function averageEmbedding(tracks: TrackWithEmbedding[]): number[] | null {
  const embs = tracks
    .map((t) => t._vectors?.default)
    .filter((v): v is number[] => Array.isArray(v) && v.length > 0);
  if (embs.length === 0) return null;
  const dims = embs[0].length;
  const sum = new Array(dims).fill(0);
  for (const e of embs) for (let i = 0; i < dims; i++) sum[i] += e[i];
  for (let i = 0; i < dims; i++) sum[i] /= embs.length;
  return sum;
}

type OrderMode = "original" | "greedy" | "genetic";

/** single identity function for dedupe semantics */
type WithUser = { username?: string };
const sameIdentity = (a: Track & WithUser, b: Track & WithUser) =>
  a.track_id === b.track_id && a.username === b.username;

/** ---------- reducer for playlist mutations ---------- */
type Action =
  | { type: "REPLACE"; tracks: TrackWithEmbedding[] }
  | { type: "ADD"; track: TrackWithEmbedding }
  | { type: "REMOVE"; trackId: string }
  | { type: "MOVE"; from: number; to: number }
  | { type: "CLEAR" };

function playlistReducer(state: TrackWithEmbedding[], action: Action) {
  switch (action.type) {
    case "REPLACE":
      return action.tracks;
    case "ADD": {
      const exists = state.some((t) =>
        sameIdentity(
          t as TrackWithEmbedding & WithUser,
          action.track as TrackWithEmbedding & WithUser,
        ),
      );
      return exists ? state : [...state, action.track];
    }
    case "REMOVE":
      return state.filter((t) => t.track_id !== action.trackId);
    case "MOVE":
      return moveTrackReorder(state, action.from, action.to);
    case "CLEAR":
      return [];
    default:
      return state;
  }
}

/** ---------- context types ---------- */
interface PlaylistsContextType {
  // state
  playlists: Playlist[];
  playlistsLoading: boolean;

  playlistInfo: PlaylistInfo;
  setPlaylistInfo: React.Dispatch<React.SetStateAction<PlaylistInfo>>;

  playlistName: string;
  setPlaylistName: React.Dispatch<React.SetStateAction<string>>;

  loadingPlaylists: { id: number } | false;

  playlist: TrackWithEmbedding[]; // single source of truth
  orderedPlaylist: TrackWithEmbedding[]; // equals playlist unless you later implement "greedy/genetic"
  orderMode: OrderMode;
  setOrderMode: React.Dispatch<React.SetStateAction<OrderMode>>;

  // computed
  playlistAvgEmbedding: number[] | null;

  // ops
  addToPlaylist: (track: TrackWithEmbedding) => void;
  removeFromPlaylist: (trackId: string) => void;
  moveTrack: (fromIdx: number, toIdx: number) => void;
  clearPlaylist: () => void;

  // network / io
  fetchPlaylists: () => Promise<void>;
  // handleCreatePlaylist: () => Promise<void>;
  savePlaylist: () => Promise<void>;
  exportPlaylist: () => void;

  // recs
  getRecommendations: (k?: number) => Promise<Track[]>;

  // sorting
  sortGreedy: () => void;
  sortGenetic: () => void;
}

const PlaylistsContext = createContext<PlaylistsContextType | undefined>(undefined);

/** ---------- provider ---------- */
export function PlaylistsProvider({ children }: { children: ReactNode }) {
  const [orderMode, setOrderMode] = useState<OrderMode>("original");
  const { playlists, refetch, isPending } = usePlaylistsQuery({
    enabled: true,
    staleTime: 30_000,
  });
  const [playlist, setPlaylistLS, clearLS] = useLocalStorageState<TrackWithEmbedding[]>(
    "playlist",
    [],
  );
  const [state, dispatch] = useReducer(playlistReducer, playlist);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo>({ name: "" });
  const [loadingPlaylists, setLoadingPlaylists] = useState<{ id: number } | false>(false);
  const { mutateAsync: sortGeneticMutation } = useGenerateGeneticPlaylistMutation();

  // keep localStorage in sync with reducer state
  useMemo(() => {
    setPlaylistLS(state);
    return null;
  }, [state, setPlaylistLS]);

  const orderedPlaylist = useMemo(() => {
    if (state.length <= 2) return state;

    switch (orderMode) {
      case "greedy":
        return state;
      case "genetic":
        return state;
      case "original":
      default:
        return state;
    }
  }, [state, orderMode]);

  const playlistAvgEmbedding = useMemo(() => averageEmbedding(orderedPlaylist), [orderedPlaylist]);

  const fetchPlaylists = useCallback(async () => {
    await refetch();
    setLoadingPlaylists(false);
  }, [refetch]);

  const sortGreedy = useCallback(() => {
    const enrichedPlaylist = playlist.map((track, idx) => {
      const t = track as TrackCompat;
      return {
        camelot_key: keyToCamelot(t.key),
        _vectors: t._vectors,
        energy: typeof t.energy === "number" ? t.energy : Number(t.energy) || 0,
        bpm: typeof t.bpm === "number" ? t.bpm : Number(t.bpm) || 0,
        idx,
      };
    });

    const greedyPlaylist = greedyPath(enrichedPlaylist, buildCompatibilityGraph(enrichedPlaylist));

    dispatch({
      type: "REPLACE",
      tracks: greedyPlaylist.map((t) => playlist[t]),
    });
  }, [playlist]);

  const sortGenetic = useCallback(async () => {
    try {
      const result = await sortGeneticMutation(playlist);

      dispatch({ type: "REPLACE", tracks: result });
    } catch (e) {
      console.error("Error during genetic sort:", e);
      toaster.create({
        title: "Genetic sort failed: " + (JSON.stringify(e) ?? ""),
        type: "error",
      });
      return;
    }
  }, [playlist, sortGeneticMutation]);

  const savePlaylist = useCallback(async () => {
    await importPlaylist(
      playlistInfo.name || playlistName,
      orderedPlaylist.map((t) => t.track_id),
    );
  }, [playlistInfo.name, playlistName, orderedPlaylist]);

  const exportPlaylist = useCallback(() => {
    const base = orderedPlaylist;
    const json = JSON.stringify(base, (k, v) => (k === "_vectors" ? undefined : v), 2);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(json);
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", (playlistInfo.name || "playlist") + ".json");
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [orderedPlaylist, playlistInfo.name]);

  const clearPlaylist = useCallback(() => {
    dispatch({ type: "CLEAR" });
    clearLS();
  }, [clearLS]);

  const addToPlaylist = useCallback((track: TrackWithEmbedding) => {
    dispatch({ type: "ADD", track });
  }, []);

  const removeFromPlaylist = useCallback((trackId: string) => {
    dispatch({ type: "REMOVE", trackId });
  }, []);

  const moveTrack = useCallback((fromIdx: number, toIdx: number) => {
    dispatch({ type: "MOVE", from: fromIdx, to: toIdx });
  }, []);

  // recommendations wrapper uses current playlist
  const getRecommendationsRaw = useRecommendations();
  const getRecommendations = useCallback(
    async (k: number = 25) =>
      getRecommendationsRaw(k, orderedPlaylist as TrackWithEmbeddingFromHook[]),
    [getRecommendationsRaw, orderedPlaylist],
  );

  const value: PlaylistsContextType = {
    playlists,
    playlistsLoading: isPending,
    playlistInfo,
    setPlaylistInfo,
    playlistName,
    setPlaylistName,
    loadingPlaylists,
    playlist: state,
    orderedPlaylist,
    orderMode,
    setOrderMode,
    playlistAvgEmbedding,
    addToPlaylist,
    removeFromPlaylist,
    moveTrack,
    clearPlaylist,
    fetchPlaylists,

    savePlaylist,
    exportPlaylist,
    getRecommendations,
    sortGreedy,
    sortGenetic,
  };

  return <PlaylistsContext.Provider value={value}>{children}</PlaylistsContext.Provider>;
}

/** ---------- hook ---------- */
export function usePlaylists() {
  const ctx = useContext(PlaylistsContext);
  if (!ctx) throw new Error("usePlaylists must be used within a PlaylistsProvider");
  return ctx;
}

export default PlaylistsProvider;
