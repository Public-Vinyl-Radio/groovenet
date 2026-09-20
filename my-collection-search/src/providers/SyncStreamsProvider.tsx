"use client";
import { createContext, useContext, useMemo, useState, ReactNode } from "react";

type StreamState = {
  lines: string[];
  done: boolean;
  error: string | null;
};

type SyncStreamsContextType = {
  discogs: StreamState;
  removeFriend: StreamState;
  resetDiscogs: () => void;
  resetRemoveFriend: () => void;
  pushDiscogsLine: (line: string) => void;
  pushRemoveFriendLine: (line: string) => void;
  setDiscogsDone: (v: boolean) => void;
  setRemoveFriendDone: (v: boolean) => void;
  setDiscogsError: (e: string | null) => void;
  setRemoveFriendError: (e: string | null) => void;
};

const SyncStreamsContext = createContext<SyncStreamsContextType | null>(null);

export function SyncStreamsProvider({ children }: { children: ReactNode }) {
  const [discogs, setDiscogs] = useState<StreamState>({ lines: [], done: false, error: null });
  const [removeFriend, setRemoveFriend] = useState<StreamState>({ lines: [], done: false, error: null });

  const api = useMemo(() => ({
    discogs,
    removeFriend,
    resetDiscogs: () => setDiscogs({ lines: [], done: false, error: null }),
    resetRemoveFriend: () => setRemoveFriend({ lines: [], done: false, error: null }),
    pushDiscogsLine: (line: string) => setDiscogs(s => ({ ...s, lines: [...s.lines, line] })),
    pushRemoveFriendLine: (line: string) => setRemoveFriend(s => ({ ...s, lines: [...s.lines, line] })),
    setDiscogsDone: (v: boolean) => setDiscogs(s => ({ ...s, done: v })),
    setRemoveFriendDone: (v: boolean) => setRemoveFriend(s => ({ ...s, done: v })),
    setDiscogsError: (e: string | null) => setDiscogs(s => ({ ...s, error: e })),
    setRemoveFriendError: (e: string | null) => setRemoveFriend(s => ({ ...s, error: e })),
  }), [discogs, removeFriend]);

  return <SyncStreamsContext.Provider value={api}>{children}</SyncStreamsContext.Provider>;
}

export function useSyncStreams() {
  const ctx = useContext(SyncStreamsContext);
  if (!ctx) throw new Error("useSyncStreams must be used within SyncStreamsProvider");
  return ctx;
}
