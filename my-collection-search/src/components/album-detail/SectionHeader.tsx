"use client";

import React from "react";
import { Box, Flex, Heading, Text } from "@chakra-ui/react";

type Props = {
  title: string;
  /** The mono count beside the heading: "12 tracks", "1 spin". */
  count?: string;
  /** Outline buttons and the like, at the end of the row. */
  children?: React.ReactNode;
  /** A sentence under the row. */
  description?: string;
};

/** The heading row shared by the album page's Tracklist, Vinyl spins and Copies & care. */
export default function SectionHeader({ title, count, children, description }: Props) {
  return (
    <Box>
      <Flex flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={3} minH="36px">
        <Flex alignItems="baseline" gap={3} minW={0}>
          <Heading
            as="h2"
            fontSize={{ base: "20px", md: "22px" }}
            lineHeight="30px"
            fontWeight="semibold"
          >
            {title}
          </Heading>
          {count && (
            <Text
              fontFamily="label"
              fontSize="13px"
              letterSpacing="0.06em"
              textTransform="uppercase"
              color="fg.muted"
            >
              {count}
            </Text>
          )}
        </Flex>
        {children && (
          <Flex alignItems="center" gap={2}>
            {children}
          </Flex>
        )}
      </Flex>
      {description && (
        <Text fontSize="sm" color="fg.muted" mt={1}>
          {description}
        </Text>
      )}
    </Box>
  );
}
