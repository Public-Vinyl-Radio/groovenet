import { useCallback, useMemo, useState } from "react";
import type { AppleMusicResult } from "@/types/track";
import { useAppleMusicAISearchQuery } from "@/hooks/useAppleMusicAISearchQuery";

type Query = { title: string; artist: string };

export function useAppleMusicPicker(opts?: {
  onSelect?: (song: AppleMusicResult) => void | Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [args, setArgs] = useState<Query | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Compute whether query should run
  const enabled = useMemo(
    () => isOpen && !!args?.title && !!args?.artist,
    [isOpen, args?.title, args?.artist],
  );

  const { data, isPending, isFetching, refetch } = useAppleMusicAISearchQuery(
    { title: args?.title ?? "", artist: args?.artist ?? "" },
    enabled,
  );

  const loading = isPending || isFetching;
  const results: AppleMusicResult[] = data?.results ?? [];

  const search = useCallback(
    async ({ title, artist }: Query) => {
      setIsOpen(true);
      setArgs({ title, artist });
      // If already open and args change, React Query will auto-run due to enabled
      // Optionally force immediate fetch
      refetch();
    },
    [refetch],
  );

  const select = useCallback(
    async (song: AppleMusicResult) => {
      try {
        await opts?.onSelect?.(song);
      } finally {
        setIsOpen(false);
      }
    },
    [opts],
  );

  return { isOpen, open, close, loading, results, search, select };
}
