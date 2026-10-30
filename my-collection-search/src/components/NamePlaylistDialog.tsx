import RetroDialog from "@/components/ui/RetroDialog";
import React from "react";
import { Flex, Box, Button, Input, Text } from "@chakra-ui/react";

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
  const inputRef = React.useRef<HTMLInputElement>(null);

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
    <RetroDialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && handleCancel()}
      title="Name Playlist"
      initialFocusEl={() => inputRef.current}

      footer={
        <Flex p={4} gap={2} flexWrap="wrap" justify="flex-end">
          <Button
            minH="44px"
            onClick={handleConfirm}
            colorPalette="accent"
            disabled={!localName.trim()}
          >
            {confirmLabel}
          </Button>
          <Button minH="44px" ml={2} variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
        </Flex>
      }
    >
      <Box p={4} minW={0}>
        <Input
          fontSize="16px"
          ref={inputRef}
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          placeholder="Playlist name"
          mb={2}
        />
        {typeof trackCount === "number" && (
          <Text fontSize="sm" color="fg.muted">
            {trackCount} tracks will be saved.
          </Text>
        )}
      </Box>
    </RetroDialog>
  );
}
