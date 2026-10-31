"use client";

import React from "react";
import SpinActionsMenu from "./SpinActionsMenu";
import SpinFormDialog from "./SpinFormDialog";
import { summarizeSpin, type SpinListItem } from "./spinSummary";
import { useSpinActions } from "./useSpinActions";

/** The actions menu for one spin session, with its edit dialog and delete. */
export default function SpinSessionActions({ item }: { item: SpinListItem }) {
  const { editOpen, setEditOpen, handleDelete, deleting } = useSpinActions(item);

  return (
    <>
      <SpinActionsMenu
        label={summarizeSpin(item).headline}
        onEdit={() => setEditOpen(true)}
        onDelete={handleDelete}
        deleting={deleting}
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
