// components/UsernameSelect.tsx
"use client";

import * as React from "react";
import { Menu, Portal, Spinner, useBreakpointValue, HStack, Icon, Box } from "@chakra-ui/react";
import { FiUser, FiX } from "react-icons/fi";
import { useUsername } from "@/providers/UsernameProvider";
import { Friend } from "@/types/track";

export type UsernameSelectProps = {
  usernames: Friend[];
  includeAllOption?: boolean;
  /** Chakra responsive size array is fine here */
  size?: string | string[];
  width?: string | number;
  /** Loading state for when usernames are being fetched */
  isLoading?: boolean;
  /** Text to show while loading */
  loadingText?: string;
  /** Disable the select while loading (default true) */
  disableWhileLoading?: boolean;
  /**
   * Optional override: control the value externally.
   * If omitted, the component uses UsernameProvider's value.
   */
  value?: Friend | null;
  onChange?: (friend_id: number) => void;
  /** Show icon only on mobile (hide text label) */
  iconOnlyMobile?: boolean;
};

export default function UsernameSelect({
  usernames,
  includeAllOption = false,
  size = ["sm", "md", "md"],
  width = "100%",
  isLoading = false,
  loadingText = "Loading...",
  disableWhileLoading = true,
  value,
  onChange,
  iconOnlyMobile = false,
}: UsernameSelectProps) {
  // Context holds Friend | null; external value can override
  const { friend: ctxValue, setFriend: setCtxValue } = useUsername();
  const isControlled = value !== undefined;
  const selectedFriend: Friend | null = value ?? (ctxValue as Friend | null);
  const uniqueUsernames = React.useMemo(() => {
    const map = new Map<number, Friend>();
    for (const u of usernames) {
      if (!map.has(u.id)) map.set(u.id, u);
    }
    return Array.from(map.values());
  }, [usernames]);

  const buttonLabel = React.useMemo(() => {
    if (isLoading) return loadingText;
    if (selectedFriend) return selectedFriend.username;
    if (includeAllOption) return "All Libraries";
    return "Choose user library";
  }, [isLoading, loadingText, selectedFriend, includeAllOption]);

  const handleSelect = React.useCallback(
    (friend: Friend | null) => {
      // Always call onChange when provided, passing the friend_id or 0 for "All"
      if (onChange) {
        onChange(friend ? friend.id : 0);
      }
      // Persist global library selection in both modes when a concrete library is chosen.
      // For "All Libraries" (null), do not clear global selection in controlled mode.
      if (friend) {
        setCtxValue(friend);
        return;
      }
      if (!isControlled) {
        setCtxValue(null);
      }
    },
    [isControlled, onChange, setCtxValue],
  );

  // Heal stale persisted selections (e.g. restored DB with new friend IDs).
  React.useEffect(() => {
    if (isLoading) return;
    if (!selectedFriend) return;
    if (uniqueUsernames.length === 0) return;

    const exists = uniqueUsernames.some((u) => u.id === selectedFriend.id);
    if (exists) return;

    // If IDs changed after restore, try to heal by username before falling back.
    const byUsername = uniqueUsernames.find(
      (u) =>
        typeof u.username === "string" &&
        typeof selectedFriend.username === "string" &&
        u.username.trim().toLowerCase() === selectedFriend.username.trim().toLowerCase(),
    );
    if (byUsername) {
      handleSelect(byUsername);
      return;
    }

    // If the stored selection no longer exists, fall back deterministically.
    const fallback = includeAllOption ? null : (uniqueUsernames[0] ?? null);
    handleSelect(fallback);
  }, [isLoading, selectedFriend, uniqueUsernames, includeAllOption, handleSelect]);

  // Resolve responsive size to a concrete token for styling
  const resolvedSize = useBreakpointValue(Array.isArray(size) ? size : [size]) as
    string | undefined;

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Box
          as="button"
          width={width}
          aria-busy={isLoading}
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          px={3}
          py={2}
          bg="bg.panel"
          borderWidth="1px"
          borderColor="border.subtle"
          borderRadius="md"
          cursor={isLoading && disableWhileLoading ? "not-allowed" : "pointer"}
          opacity={isLoading && disableWhileLoading ? 0.5 : 1}
          _hover={isLoading && disableWhileLoading ? {} : { bg: "bg.subtle" }}
          minH={resolvedSize === "sm" ? 8 : resolvedSize === "md" ? 10 : 12}
        >
          <HStack w="100%" justify="space-between">
            <HStack>
              <Icon as={FiUser} />
              {isLoading && <Spinner size="xs" />}
              <Box display={iconOnlyMobile ? { base: "none", md: "block" } : "block"}>
                {buttonLabel}
              </Box>
            </HStack>
            {selectedFriend && (
              <Icon
                as={FiX}
                aria-label="Clear selection"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(null);
                }}
                cursor="pointer"
                color="fg.muted"
                display={iconOnlyMobile ? { base: "none", md: "block" } : "block"}
              />
            )}
          </HStack>
        </Box>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {includeAllOption && (
              <Menu.Item value="all" onClick={() => handleSelect(null)}>
                All Libraries
              </Menu.Item>
            )}
            {uniqueUsernames.map((u) => (
              <Menu.Item key={u.id} value={String(u.id)} onClick={() => handleSelect(u)}>
                {u.username}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
