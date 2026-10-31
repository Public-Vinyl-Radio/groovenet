"use client";

import React from "react";
import { toaster } from "@/components/ui/toaster";
import { useSpinMutations } from "@/hooks/useSpinsQuery";
import type { SpinListItem } from "./spinSummary";

/**
 * Edit and delete for one spin session: the edit dialog's open state, and a
 * delete that reports how it went. Shared by the row menu and the spin detail.
 */
export function useSpinActions(item: SpinListItem, options: { onDeleted?: () => void } = {}) {
  const [editOpen, setEditOpen] = React.useState(false);
  // Each caller has its own mutations, so only the spin being deleted shows busy.
  const { deleteSpin, deleteSpinPending } = useSpinMutations(item.session.friend_id);
  const { onDeleted } = options;

  const handleDelete = async () => {
    try {
      await deleteSpin(item.session.id);
      toaster.create({ title: "Spin deleted", type: "success" });
    } catch (error) {
      toaster.create({
        title: "Failed to delete spin",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
      throw error;
    }
    onDeleted?.();
  };

  return { editOpen, setEditOpen, handleDelete, deleting: deleteSpinPending };
}
