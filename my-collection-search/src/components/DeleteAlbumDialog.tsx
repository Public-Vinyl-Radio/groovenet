import React from "react";
import { Dialog, Portal, CloseButton, Button, Text } from "@chakra-ui/react";
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
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const { mutateAsync: deleteAlbum, isPending } = useDeleteAlbumMutation();

  const confirmDeleteAlbum = async () => {
    try {
      await deleteAlbum({ releaseId, friendId });
      notify({ title: "Album deleted.", type: "success" });
      onDeleted();
    } catch {
      notify({ title: "Failed to delete album.", type: "error" });
    } finally {
      onClose();
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={() => onClose()}
      role="alertdialog"
      initialFocusEl={() => cancelRef.current}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Delete {albumTitle ?? "Album"}</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton ref={cancelRef} size="sm" onClick={onClose} />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body>
              <Text mb={2}>
                This permanently deletes the album and all of its tracks. This action cannot be
                undone.
              </Text>
              <Text color="fg.muted" fontSize="sm">
                If this album came from Discogs, deleting it here doesn&apos;t remove it from your
                Discogs collection — the next full sync will add it back unless you also remove it
                there.
              </Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                colorPalette="danger"
                ml={3}
                onClick={confirmDeleteAlbum}
                loading={isPending}
                disabled={isPending}
              >
                Delete
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
