"use client";
import { Button, HStack, Icon, Menu, Portal, Text } from "@chakra-ui/react";
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
          w="100%"
          minW={0}
          h="auto"
          px={compact ? 2 : 3}
          py={2}
          borderWidth="outline"
          borderRadius="md"
          borderColor="transparent"
          justifyContent={compact ? "center" : "flex-start"}
          _hover={{ bg: "bg.subtle" }}
        >
          <HStack gap={compact ? 0 : 3} w="100%" justify={compact ? "center" : "flex-start"}>
            <Icon as={FiUser} boxSize={5} color="fg.muted" />
            {!compact && (
              <Text
                truncate
                fontFamily="label"
                fontWeight="normal"
                fontSize="xs"
                letterSpacing="0.06em"
                textTransform="uppercase"
              >
                {data.current?.name ?? "Profile"}
              </Text>
            )}
          </HStack>
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
