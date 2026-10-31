"use client";

import React from "react";
import { toaster } from "@/components/ui/toaster";
import { useSpinMutations } from "@/hooks/useSpinsQuery";
import SpinActionsMenu from "./SpinActionsMenu";
import SpinFormDialog from "./SpinFormDialog";
import { summarizeSpin, type SpinListItem } from "./spinSummary";

/** The actions menu for one spin session, with its edit dialog and delete. */
export default function SpinSessionActions({ item }: { item: SpinListItem }) {
  const [editOpen, setEditOpen] = React.useState(false);
  // Each row has its own mutations, so only the spin being deleted shows busy.
  const { deleteSpin, deleteSpinPending } = useSpinMutations(item.session.friend_id);

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
  };

  return (
    <>
      <SpinActionsMenu
        label={summarizeSpin(item).headline}
        onEdit={() => setEditOpen(true)}
        onDelete={handleDelete}
        deleting={deleteSpinPending}
      />
      <SpinFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        releaseId={item.session.release_id}
        friendId={item.session.friend_id}
        spin={item}
      />
    </>
  );
}
