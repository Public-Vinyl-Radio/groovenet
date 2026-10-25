"use client";

import React from "react";
import { Box, Flex, Heading, IconButton, Menu, Text } from "@chakra-ui/react";
import { FiMoreHorizontal } from "react-icons/fi";
import { useRootFlag } from "@/hooks/useRootFlag";

export type PageHeaderAction = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
};

export type PageHeaderOverflowItem = {
  label: string;
  onClick: () => void;
};

type PageHeaderProps = {
  title: string;
  count?: number | string;
  /** Back button on detail pages; sits left of the title. */
  leading?: React.ReactNode;
  /** At most two icon buttons; extras are dropped (use `overflow`). */
  actions?: PageHeaderAction[];
  /** Everything beyond two actions, in a "More" menu. */
  overflow?: PageHeaderOverflowItem[];
};

const MAX_ACTIONS = 2;

/**
 * Shared page header. On phones: a solid 52px bar, sticky just under the
 * status-bar strip, with a 2px ink rule below it. From `md` up the sidebar
 * layout stays and only the title renders (no bar, no actions).
 * Mounting one flips `data-page-header` on <html>, which drops the shell's
 * legacy top padding (houseStyle `--content-pt`).
 */
export default function PageHeader({
  title,
  count,
  leading,
  actions = [],
  overflow = [],
}: PageHeaderProps) {
  useRootFlag("data-page-header", true);
  const shown = actions.slice(0, MAX_ACTIONS);

  return (
    <Box
      as="header"
      data-testid="page-header"
      position={{ base: "sticky", md: "static" }}
      top="var(--safe-top)"
      zIndex={80}
      bg="bg"
      mx={{ base: -4, md: 0 }}
      px={{ base: 4, md: 0 }}
      h={{ base: "var(--header-h)", md: "auto" }}
      mb={{ base: 4, md: 4 }}
      borderBottomWidth={{ base: "outline", md: 0 }}
      borderColor="border.ink"
    >
      <Flex h="full" align="center" gap={2}>
        {leading ? <Box data-testid="page-header-leading">{leading}</Box> : null}
        <Flex align="baseline" gap={2} minW={0} flex="1">
          <Heading
            as="h1"
            fontFamily="heading"
            fontSize={{ base: "20px", md: "2xl" }}
            lineHeight="1.2"
            truncate
          >
            {title}
          </Heading>
          {count !== undefined && (
            <Text
              data-testid="page-header-count"
              fontFamily="mono"
              fontSize="xs"
              color="fg.muted"
              flexShrink={0}
            >
              {typeof count === "number" ? count.toLocaleString() : count}
            </Text>
          )}
        </Flex>
        <Flex display={{ base: "flex", md: "none" }} align="center" gap={1}>
          {shown.map((action) => (
            <IconButton
              key={action.label}
              aria-label={action.label}
              variant="ghost"
              boxSize="44px"
              minW="44px"
              onClick={action.onClick}
            >
              {action.icon}
            </IconButton>
          ))}
          {overflow.length > 0 && (
            <Menu.Root>
              <Menu.Trigger asChild>
                <IconButton
                  aria-label="More actions"
                  variant="ghost"
                  boxSize="44px"
                  minW="44px"
                >
                  <FiMoreHorizontal />
                </IconButton>
              </Menu.Trigger>
              <Menu.Positioner>
                <Menu.Content>
                  {overflow.map((item) => (
                    <Menu.Item
                      key={item.label}
                      value={item.label}
                      onClick={item.onClick}
                    >
                      {item.label}
                    </Menu.Item>
                  ))}
                </Menu.Content>
              </Menu.Positioner>
            </Menu.Root>
          )}
        </Flex>
      </Flex>
    </Box>
  );
}
