import React from "react";
import { Dialog, Portal, CloseButton, Button, Text, VStack, Stack } from "@chakra-ui/react";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { fetchFriends } from "@/services/internalApi/friends";
import type { Friend } from "@/types/track";

interface FriendSelectDialogProps {
  open: boolean;
  selectedFriendId: number | null;
  setSelectedFriendId: (friendId: number) => void;
  trackCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function FriendSelectDialog({
  open,
  selectedFriendId,
  setSelectedFriendId,
  trackCount,
  onConfirm,
  onCancel,
}: FriendSelectDialogProps) {
  const [friends, setFriends] = React.useState<Friend[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Fetch friends when dialog opens
  React.useEffect(() => {
    if (open) {
      setLoading(true);
      fetchFriends(true)
        .then((data) => setFriends(data))
        .catch((err) => {
          console.error("Error fetching friends:", err);
          setFriends([]);
        })
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleConfirm = React.useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  const handleCancel = React.useCallback(() => {
    onCancel();
  }, [onCancel]);

  return (
    <Dialog.Root open={open} onOpenChange={(d) => !d.open && handleCancel()}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Select Library</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" onClick={handleCancel} />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body>
              <VStack align="stretch" gap={3}>
                <Text fontSize="sm" color="fg.muted">
                  This playlist doesn&apos;t have library information, or the library doesn&apos;t
                  exist in your system. Please select which library these tracks belong to:
                </Text>
                {typeof trackCount === "number" && (
                  <Text fontSize="sm" color="fg.muted">
                    {trackCount} tracks will be imported.
                  </Text>
                )}
                {loading ? (
                  <Text fontSize="sm">Loading libraries...</Text>
                ) : friends.length === 0 ? (
                  <Text fontSize="sm" color="fg.error">
                    No libraries found. Please add a library first.
                  </Text>
                ) : (
                  <RadioGroup
                    value={selectedFriendId?.toString()}
                    onValueChange={(e) => e.value && setSelectedFriendId(Number(e.value))}
                  >
                    <Stack gap={2}>
                      {friends.map((friend) => (
                        <Radio key={friend.id} value={friend.id.toString()}>
                          {friend.username}
                        </Radio>
                      ))}
                    </Stack>
                  </RadioGroup>
                )}
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                onClick={handleConfirm}
                colorPalette="accent"
                disabled={!selectedFriendId || loading || friends.length === 0}
              >
                Import
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
