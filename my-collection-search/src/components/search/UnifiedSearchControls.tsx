"use client";

import React from "react";
import { Box, Flex, Input, InputGroup } from "@chakra-ui/react";
import { LuSearch } from "react-icons/lu";
import UsernameSelect from "@/components/UsernameSelect";
import type { Friend } from "@/types/track";

type UnifiedSearchControlsProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onQueryEnter?: () => void;
  friends?: Friend[];
  selectedFriend?: Friend | null;
  onFriendChange?: (friendId: number) => void;
  includeAllOption?: boolean;
  showLibrarySelect?: boolean;
  placeholder?: string;
  compactDesktop?: boolean;
  desktopControls?: React.ReactNode;
  mobilePrimaryControl?: React.ReactNode;
  mobileSecondaryControls?: React.ReactNode;
};

const SEARCH_FONT_SIZE = { base: "16px", md: "14px" };

export default function UnifiedSearchControls({
  query,
  onQueryChange,
  onQueryEnter,
  friends = [],
  selectedFriend,
  onFriendChange,
  includeAllOption = false,
  showLibrarySelect = true,
  placeholder = "Search",
  compactDesktop = false,
  desktopControls,
  mobilePrimaryControl,
  mobileSecondaryControls,
}: UnifiedSearchControlsProps) {
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && onQueryEnter) onQueryEnter();
    },
    [onQueryEnter]
  );

  return (
    <Box
      p={{ base: 2, md: 3 }}
      borderWidth="1px"
      borderColor="border.subtle"
      borderRadius="xl"
      bg="bg.subtle"
      boxShadow="sm"
    >
      {/* Desktop */}
      <Flex display={{ base: "none", md: "flex" }} gap={2} align="center">
        <InputGroup startElement={<LuSearch size={16} />} flex="1" maxW="520px">
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            variant="outline"
            bg="bg.panel"
            size="sm"
            // 16px on phones so iOS doesn't zoom on focus; 14px beside the 13px label-face controls.
            fontSize={SEARCH_FONT_SIZE}
            placeholder={placeholder}
          />
        </InputGroup>
        {showLibrarySelect ? (
          <Box flexShrink={0} width={compactDesktop ? "auto" : "200px"}>
            <UsernameSelect
              usernames={friends}
              includeAllOption={includeAllOption}
              value={selectedFriend}
              onChange={onFriendChange}
              size="sm"
              iconOnlyMobile={compactDesktop}
            />
          </Box>
        ) : null}
        {desktopControls ? <Flex gap={2} align="center">{desktopControls}</Flex> : null}
      </Flex>

      {/* Mobile */}
      <Flex display={{ base: "flex", md: "none" }} direction="column" gap={2}>
        <Flex gap={2} align="center">
          <InputGroup startElement={<LuSearch size={16} />} flex="1">
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              variant="outline"
              bg="bg.panel"
              fontSize={SEARCH_FONT_SIZE}
              size="sm"
              h="44px"
              placeholder={placeholder}
            />
          </InputGroup>
          {showLibrarySelect ? (
            <UsernameSelect
              usernames={friends}
              includeAllOption={includeAllOption}
              value={selectedFriend}
              onChange={onFriendChange}
              iconOnlyMobile={true}
              width="auto"
              size="sm"
            />
          ) : null}
          {mobilePrimaryControl}
        </Flex>
        {mobileSecondaryControls ? (
          <Flex gap={2} align="center" wrap="wrap">
            {mobileSecondaryControls}
          </Flex>
        ) : null}
      </Flex>
    </Box>
  );
}
