// hooks/useBackupsQuery.ts
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  backupDatabase,
  deleteBackup,
  fetchBackups,
} from "@/services/internalApi/backup";

export function useBackupsQuery() {
  const qc = useQueryClient();
  const { data: backups = [], isLoading } = useQuery({
    queryKey: queryKeys.backups(),
    queryFn: async () => {
      const data = await fetchBackups();
      return data.backups;
    },
  });

  const addBackup = useMutation({
    mutationFn: () => backupDatabase(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backups() }),
  });

  const removeBackup = useMutation({
    mutationFn: (filename: string) => deleteBackup(filename),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.backups() }),
  });

  return {
    backups,
    backupsLoading: isLoading,
    addBackup,
    addBackupLoading: addBackup.isPending,
    removeBackup,
  };
}
