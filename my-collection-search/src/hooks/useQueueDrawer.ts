import { create } from "zustand";

export const useQueueDrawerStore = create<{
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}>((set) => ({ isOpen: false, setOpen: (isOpen) => set({ isOpen }) }));

/**
 * Open state of Now playing / the queue panel, shared so a page (Home's Now
 * playing card) can open the one `PlaylistPlayer` mounts.
 */
export function useQueueDrawer() {
  const isOpen = useQueueDrawerStore((state) => state.isOpen);
  const setOpen = useQueueDrawerStore((state) => state.setOpen);

  const open = () => setOpen(true);
  const close = () => setOpen(false);
  const toggle = () => setOpen(!useQueueDrawerStore.getState().isOpen);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
