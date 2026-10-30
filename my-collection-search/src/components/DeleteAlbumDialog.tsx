import React from "react";
import ConfirmDialog from "@/components/records/ConfirmDialog";
import { Text } from "@chakra-ui/react";
import { useDeleteAlbumMutation } from "@/hooks/useAlbumsQuery";

interface DeleteAlbumDialogProps {
  open: boolean;
  releaseId: string;
  friendId: number;
  albumTitle?: string;
  onClose: () => void;
  onDeleted: () => void;
  notify: (opts: { title: string; type: string }) => void;
}

export default function DeleteAlbumDialog({
  open,
  releaseId,
  friendId,
  albumTitle,
  onClose,
  onDeleted,
  notify,
}: DeleteAlbumDialogProps) {
  const { mutateAsync: deleteAlbum, isPending } = useDeleteAlbumMutation();

  const confirmDeleteAlbum = async () => {
    try {
      await deleteAlbum({ releaseId, friendId });
      notify({ title: "Album deleted.", type: "success" });
      onDeleted();
    } catch {
      notify({ title: "Failed to delete album.", type: "error" });
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onClose}
      title={`Delete ${albumTitle ?? "Album"}`}
      body={
        <>
          <Text mb={2}>
            This permanently deletes the album and all of its tracks. This action cannot be undone.
          </Text>
          <Text color="fg.muted" fontSize="sm">
            If this album came from Discogs, deleting it here doesn&apos;t remove it from your
            Discogs collection — the next full sync will add it back unless you also remove it
            there.
          </Text>
        </>
      }
      confirmLabel="Delete"
      onConfirm={confirmDeleteAlbum}
      pending={isPending}
    />
  );
}
