"use client";
import { Button, Text, VStack } from "@chakra-ui/react";
import RetroDialog from "@/components/ui/RetroDialog";
import type { PublicProfile } from "@/services/internalApi/profiles";

export function shouldShowPicker(
  profiles: PublicProfile[],
  current: PublicProfile | null,
): boolean {
  return profiles.length > 1 && current === null;
}
export function ProfilePicker({
  profiles,
  open,
  dismissible = false,
  pending = false,
  error,
  onSelect,
  onClose,
}: {
  profiles: PublicProfile[];
  open: boolean;
  dismissible?: boolean;
  pending?: boolean;
  error?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <RetroDialog
      open={open}
      onOpenChange={onClose}
      dismissible={dismissible}
      title="Who's listening?"
    >
      <VStack align="stretch" gap={3}>
        {profiles.map((user) => (
          <Button
            key={user.id}
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => onSelect(user.id)}
          >
            {user.name}
          </Button>
        ))}
        {error && (
          <Text role="alert" color="fg.muted">
            {error}
          </Text>
        )}
      </VStack>
    </RetroDialog>
  );
}
