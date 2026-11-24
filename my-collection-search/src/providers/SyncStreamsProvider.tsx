"use client";
import { createContext, useContext, useMemo, useState, ReactNode } from "react";

type StreamState = {
  lines: string[];
  done: boolean;
  error: string | null;
};

// The Discogs import is a background job with its own state since #1274
// (`useDiscogsImports`); only removing a friend still streams through here.
type SyncStreamsContextType = {
  removeFriend: StreamState;
  resetRemoveFriend: () => void;
  pushRemoveFriendLine: (line: string) => void;
  setRemoveFriendDone: (v: boolean) => void;
  setRemoveFriendError: (e: string | null) => void;
};

const SyncStreamsContext = createContext<SyncStreamsContextType | null>(null);

export function SyncStreamsProvider({ children }: { children: ReactNode }) {
  const [removeFriend, setRemoveFriend] = useState<StreamState>({
    lines: [],
    done: false,
    error: null,
  });

  const api = useMemo(
    () => ({
      removeFriend,
      resetRemoveFriend: () => setRemoveFriend({ lines: [], done: false, error: null }),
      pushRemoveFriendLine: (line: string) =>
        setRemoveFriend((s) => ({ ...s, lines: [...s.lines, line] })),
      setRemoveFriendDone: (v: boolean) => setRemoveFriend((s) => ({ ...s, done: v })),
      setRemoveFriendError: (e: string | null) => setRemoveFriend((s) => ({ ...s, error: e })),
    }),
    [removeFriend],
  );

  return <SyncStreamsContext.Provider value={api}>{children}</SyncStreamsContext.Provider>;
}

export function useSyncStreams() {
  const ctx = useContext(SyncStreamsContext);
  if (!ctx) throw new Error("useSyncStreams must be used within SyncStreamsProvider");
  return ctx;
}
