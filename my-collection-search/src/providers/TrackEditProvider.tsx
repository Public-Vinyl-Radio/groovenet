"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import type { Track } from "@/types/track";
import TrackEditDialog from "@/components/TrackEditDialog";
import type { TrackEditFormProps } from "@/components/track-edit/types";
import { toaster } from "@/components/ui/toaster";
import { useTracksQuery } from "@/hooks/useTracksQuery";

type OpenOptions = {
  // Optional callback after a successful save
  onSaved?: (data: TrackEditFormProps) => void | Promise<void>;
};

type TrackEditContextValue = {
  openTrackEditor: (track: Track, options?: OpenOptions) => void;
  closeTrackEditor: () => void;
  isOpen: boolean;
  track: Track | null;
};

const TrackEditContext = createContext<TrackEditContextValue | undefined>(undefined);

export function useTrackEditor(): TrackEditContextValue {
  const ctx = useContext(TrackEditContext);
  if (!ctx) throw new Error("useTrackEditor must be used within a TrackEditProvider");
  return ctx;
}

export default function TrackEditProvider({ children }: { children: React.ReactNode }) {
  const [track, setTrack] = useState<Track | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const savedOptionsRef = useRef<OpenOptions | null>(null);

  const { saveTrack } = useTracksQuery();

  const handleSave = useCallback(
    async (data: TrackEditFormProps) => {
      await saveTrack(data);
      setIsOpen(false);
      setTrack(null);
      toaster.create({ title: "Updated track", type: "success" });
      const opts = savedOptionsRef.current;
      if (opts?.onSaved) await opts.onSaved(data);
      savedOptionsRef.current = null;
    },
    [saveTrack],
  );

  const openTrackEditor = useCallback((t: Track, options?: OpenOptions) => {
    savedOptionsRef.current = options ?? null;
    setTrack(t);
    setIsOpen(true);
  }, []);

  const closeTrackEditor = useCallback(() => {
    setIsOpen(false);
    setTrack(null);
    savedOptionsRef.current = null;
  }, []);

  const value = useMemo(
    () => ({ openTrackEditor, closeTrackEditor, isOpen, track }),
    [openTrackEditor, closeTrackEditor, isOpen, track],
  );

  return (
    <TrackEditContext.Provider value={value}>
      {children}
      {/* Render the dialog once at root; controlled via context */}
      <TrackEditDialog
        editTrack={track}
        dialogOpen={isOpen}
        setDialogOpen={setIsOpen}
        initialFocusRef={initialFocusRef}
        onSave={handleSave}
      />
    </TrackEditContext.Provider>
  );
}
