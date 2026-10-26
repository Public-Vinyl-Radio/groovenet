import { create } from "zustand";

/** Open state of the Play on picker, so triggers in the nav and the player open the one picker `PlaylistPlayer` mounts. */
export const usePlaybackTargetDialog = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
