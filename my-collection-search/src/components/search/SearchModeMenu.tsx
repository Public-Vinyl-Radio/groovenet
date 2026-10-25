"use client";

import React from "react";
import { Box, Button, Menu, Portal, Text } from "@chakra-ui/react";
import { LuChevronDown } from "react-icons/lu";
import type { TrackSearchMode } from "@/api-contract/schemas";
import { SEARCH_MODE_ITEMS } from "@/components/search/SearchModeToggle";
import { SEARCH_MODE_HINTS } from "@/components/TrackSearchOptionsModal";

type Props = {
  value: TrackSearchMode;
  onChange: (mode: TrackSearchMode) => void;
};

/**
 * The search mode as a menu inside the right end of the desktop search field
 * (`SEMANTIC ▾`, #794): the same setting as the phone modal's switch, each
 * option with its one-line hint.
 */
export default function SearchModeMenu({ value, onChange }: Props) {
  const current = SEARCH_MODE_ITEMS.find((item) => item.value === value) ?? SEARCH_MODE_ITEMS[0];
  return (
    <Menu.Root positioning={{ placement: "bottom-end", offset: { mainAxis: 8 } }}>
      <Menu.Trigger asChild>
        <Button
          aria-label={`Search mode: ${current.label}`}
          variant="ghost"
          h="full"
          px="14px"
          gap={2}
          bg="bg.subtle"
          borderWidth={0}
          fontFamily="label"
          fontSize="12px"
          fontWeight="semibold"
          letterSpacing="0.06em"
          textTransform="uppercase"
          _hover={{ bg: "bg.muted" }}
        >
          {current.label}
          <LuChevronDown aria-hidden="true" />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="300px">
            <Menu.RadioItemGroup value={value} onValueChange={(details) => onChange(details.value as TrackSearchMode)}>
              <Menu.ItemGroupLabel fontFamily="label" fontSize="11px" letterSpacing="0.06em" textTransform="uppercase" color="fg.muted">
                Search mode
              </Menu.ItemGroupLabel>
              {SEARCH_MODE_ITEMS.map((item) => (
                <Menu.RadioItem key={item.value} value={item.value} alignItems="flex-start" py={2}>
                  <Box flex="1">
                    <Text fontWeight="semibold">{item.label}</Text>
                    <Text fontSize="12px" color="fg.muted">
                      {SEARCH_MODE_HINTS[item.value]}
                    </Text>
                  </Box>
                  <Menu.ItemIndicator />
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
