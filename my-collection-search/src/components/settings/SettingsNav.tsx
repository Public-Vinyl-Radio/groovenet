"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, Link, Text } from "@chakra-ui/react";
import { FiChevronRight } from "react-icons/fi";
import { SETTINGS_GROUPS, settingsHref, type SettingsSectionId } from "./settingsSections";
import type { SettingsSummaries } from "./settingsSummaries";

const groupLabelCss = {
  fontFamily: "label",
  fontSize: "11px",
  fontWeight: "semibold",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "fg.muted",
} as const;

/** Desktop: the 220px grouped rail beside the open section. */
export function SettingsRail({ current }: { current: SettingsSectionId }) {
  return (
    <Flex as="nav" aria-label="Settings" direction="column" gap={5} w="220px" flexShrink={0}>
      {SETTINGS_GROUPS.map((group) => {
        const labelId = `settings-rail-${group.label.toLowerCase()}`;
        return (
          <Flex key={group.label} role="group" aria-labelledby={labelId} direction="column" gap={1}>
            <Text id={labelId} pl={3} {...groupLabelCss}>
              {group.label}
            </Text>
            {group.sections.map((section) => {
              const active = section.id === current;
              return (
                <Link
                  key={section.id}
                  asChild
                  h="40px"
                  px={3}
                  display="flex"
                  alignItems="center"
                  borderWidth="outline"
                  borderRadius="md"
                  borderColor={active ? "border.ink" : "transparent"}
                  bg={active ? "bg.subtle" : "transparent"}
                  color="fg"
                  fontSize="15px"
                  fontWeight={active ? "semibold" : "normal"}
                  textDecoration="none"
                  focusVisibleRing="outside"
                  _hover={{ bg: active ? "bg.subtle" : "bg.muted", textDecoration: "none" }}
                >
                  <NextLink
                    href={settingsHref(section.id)}
                    aria-current={active ? "page" : undefined}
                  >
                    {section.label}
                  </NextLink>
                </Link>
              );
            })}
          </Flex>
        );
      })}
    </Flex>
  );
}

/**
 * Phone: Settings itself is this list. Each group is one outlined block of
 * rows (label, current value, chevron); a row opens its section as a screen.
 */
export function SettingsDrillList({ summaries }: { summaries: SettingsSummaries }) {
  return (
    <Flex direction="column" gap={5} data-testid="settings-drill-list">
      {SETTINGS_GROUPS.map((group) => {
        const headingId = `settings-list-${group.label.toLowerCase()}`;
        return (
          <Flex
            as="section"
            key={group.label}
            aria-labelledby={headingId}
            direction="column"
            gap={2}
          >
            <Text as="h2" id={headingId} m={0} {...groupLabelCss}>
              {group.label}
            </Text>
            <Box
              as="ul"
              listStyleType="none"
              m={0}
              mr="6px"
              p={0}
              borderWidth="outline"
              borderRadius="md"
              borderColor="border.ink"
              boxShadow="md"
              bg="bg"
            >
              {group.sections.map((section, index) => {
                const value = summaries[section.id];
                return (
                  <Box
                    as="li"
                    key={section.id}
                    borderTopWidth={index > 0 ? "rule" : 0}
                    borderColor="border"
                  >
                    <Link
                      asChild
                      minH="56px"
                      py={2}
                      pl="14px"
                      pr={2}
                      display="flex"
                      alignItems="center"
                      gap="10px"
                      color="fg"
                      textDecoration="none"
                      focusVisibleRing="inside"
                      _hover={{ bg: "bg.muted", textDecoration: "none" }}
                    >
                      <NextLink href={settingsHref(section.id)}>
                        <Flex direction="column" gap="2px" flex="1" minW={0}>
                          <Text fontSize="md" lineHeight="22px" fontWeight="semibold">
                            {section.label}
                          </Text>
                          {value ? (
                            <Text fontSize="13px" lineHeight="18px" color="fg.muted" truncate>
                              {value}
                            </Text>
                          ) : null}
                        </Flex>
                        <FiChevronRight aria-hidden="true" size={20} />
                      </NextLink>
                    </Link>
                  </Box>
                );
              })}
            </Box>
          </Flex>
        );
      })}
    </Flex>
  );
}
