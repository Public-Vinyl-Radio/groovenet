"use client";
import { Button, Menu, Portal } from "@chakra-ui/react";
import { FiUser } from "react-icons/fi";
import { useHousehold } from "@/providers/HouseholdProvider";
export default function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const { data, switchProfile } = useHousehold();
  if (!data || data.users.length < 2) return null;
  return (
    <Menu.Root onSelect={switchProfile}>
      <Menu.Trigger asChild>
        <Button
          variant="ghost"
          aria-label="User menu"
          title={data.current?.name ?? "Profile"}
          minW={compact ? 0 : undefined}
        >
          <FiUser />
          {!compact && (data.current?.name ?? "Profile")}
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            <Menu.Item value="switch">Switch profile</Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
