import React from "react";
import {
  Dialog,
  Portal,
  CloseButton,
  Button,
  Input,
  Text,
} from "@chakra-ui/react";

interface NamePlaylistDialogProps {
  open: boolean;
  name: string;
  setName: (name: string) => void;
  trackCount?: number;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
}

export default function NamePlaylistDialog({
  open,
  name,
  setName,
  trackCount,
  onConfirm,
  onCancel,
  confirmLabel = "Import",
}: NamePlaylistDialogProps) {
  // Local state for the input to prevent parent re-renders on every keystroke
  const [localName, setLocalName] = React.useState(name);

  // Sync local state when the dialog opens or name prop changes
  React.useEffect(() => {
    if (open) {
      setLocalName(name);
    }
  }, [open, name]);

  const handleConfirm = React.useCallback(() => {
    setName(localName); // Update parent state on confirm
    onConfirm(localName); // Pass the name to the confirm handler
  }, [localName, setName, onConfirm]);

  const handleCancel = React.useCallback(() => {
    setLocalName(name); // Reset to original value
    onCancel();
  }, [name, onCancel]);
  return (
    <Dialog.Root open={open} onOpenChange={(d) => !d.open && handleCancel()}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Name Playlist</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" onClick={handleCancel} />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body>
              <Input
                autoFocus
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder="Playlist name"
                mb={2}
              />
              {typeof trackCount === "number" && (
                <Text fontSize="sm" color="gray.500">
                  {trackCount} tracks will be saved.
                </Text>
              )}
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                onClick={handleConfirm}
                colorPalette="blue"
                disabled={!localName.trim()}
              >
                {confirmLabel}
              </Button>
              <Button ml={2} variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
