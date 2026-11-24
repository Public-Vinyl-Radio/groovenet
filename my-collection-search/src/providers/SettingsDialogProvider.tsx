"use client";
import { createContext, useContext, useState, ReactNode } from "react";

type DialogsContextType = {
  discogsSyncOpen: boolean;
  setDiscogsSyncOpen: (v: boolean) => void;
  /** The import the sync dialog shows the log of (#1274). */
  discogsSyncImportId: number | null;
  setDiscogsSyncImportId: (id: number | null) => void;
  removeFriendOpen: boolean;
  setRemoveFriendOpen: (v: boolean) => void;
};

const DialogsContext = createContext<DialogsContextType | null>(null);

export function SettingsDialogsProvider({ children }: { children: ReactNode }) {
  const [discogsSyncOpen, setDiscogsSyncOpen] = useState(false);
  const [discogsSyncImportId, setDiscogsSyncImportId] = useState<number | null>(null);
  const [removeFriendOpen, setRemoveFriendOpen] = useState(false);

  return (
    <DialogsContext.Provider
      value={{
        discogsSyncOpen,
        setDiscogsSyncOpen,
        discogsSyncImportId,
        setDiscogsSyncImportId,
        removeFriendOpen,
        setRemoveFriendOpen,
      }}
    >
      {children}
    </DialogsContext.Provider>
  );
}

export function useSettingsDialogs() {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error("useSettingsDialogs must be used within SettingsDialogsProvider");
  return ctx;
}
