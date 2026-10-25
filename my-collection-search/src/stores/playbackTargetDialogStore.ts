import { create } from "zustand";

/** Open state of the playback-target dialog, so triggers in the nav can open the one dialog `PlaylistPlayer` mounts. */
export const usePlaybackTargetDialog = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
