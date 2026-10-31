"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, Grid, Heading, Link, Text, useBreakpointValue } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { ATTENTION_ITEMS, isAllClear, type Attention } from "./attentionItems";

export default function NeedsAttention({
  attention,
  error,
}: {
  attention: Attention | null;
  error?: string | null;
}) {
  const phone = useBreakpointValue({ base: true, md: false });
  return (
    <Box as="section" aria-labelledby="home-attention-heading">
      <Flex align="center" gap={3} mb={3}>
        <Heading
          as="h2"
          id="home-attention-heading"
          bg="fg"
          color="bg"
          px={2}
          py={1}
          fontFamily="mono"
          fontSize="xs"
          fontWeight="semibold"
          letterSpacing="0.08em"
        >
          NEEDS ATTENTION
        </Heading>
        <Box flex="1" borderTopWidth="outline" borderColor="border.ink" />
      </Flex>
      <Box borderWidth="outline" borderColor="border.ink" boxShadow="md" mr="6px">
        {error ? (
          <Text role="alert" p={3} color="fg.muted">
            Couldn&apos;t load needs attention · {error}
          </Text>
        ) : attention === null ? (
          <Text role="status" p={3} color="fg.muted">
            Loading needs attention…
          </Text>
        ) : isAllClear(attention) ? (
          <Flex align="center" gap={3} p={3} minH="52px">
            <LuCheck aria-hidden="true" />
            <Text fontFamily="mono" fontSize="sm" fontWeight="semibold">
              ALL CLEAR
            </Text>
            {!phone && (
              <Text color="fg.muted" fontSize="sm">
                Every record is cleaned, analysed and has audio.
              </Text>
            )}
          </Flex>
        ) : (
          <Grid
            as="ul"
            listStyleType="none"
            m={0}
            p={0}
            templateColumns={phone ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)"}
          >
            {ATTENTION_ITEMS.map((item, index) => {
              const count = attention[item.key];
              return (
                <Box
                  as="li"
                  key={item.key}
                  borderTopWidth={(phone ? index >= 2 : index > 0) ? "rule" : 0}
                  borderLeftWidth={phone && index % 2 === 1 ? "rule" : 0}
                  borderColor="border.ink"
                >
                  <Link
                    asChild
                    display="flex"
                    flexDirection={phone ? "column" : "row"}
                    alignItems={phone ? "start" : "center"}
                    gap={phone ? 1 : 3}
                    px={3}
                    py={2}
                    minH={phone ? "76px" : "52px"}
                    color="fg"
                    bg={phone && item.strong ? "bg.panel" : undefined}
                    textDecoration="none"
                    _hover={{ bg: "bg.muted" }}
                  >
                    <NextLink
                      href={item.href}
                      aria-label={`${count === null ? "Unavailable count for" : count} ${item.label.toLowerCase()}, open ${item.destination}`}
                    >
                      <Text
                        as="span"
                        fontFamily="mono"
                        fontWeight="semibold"
                        fontSize={phone ? "2xl" : "xs"}
                        minW={phone ? undefined : "48px"}
                        textAlign="center"
                        px={phone ? 0 : 1}
                        borderWidth={phone ? 0 : "outline"}
                        borderColor="border.ink"
                        bg={!phone && item.strong ? "fg" : undefined}
                        color={!phone && item.strong ? "bg" : undefined}
                      >
                        {count ?? "—"}
                      </Text>
                      <Text as="span" flex="1" fontSize={phone ? "sm" : "md"}>
                        {phone ? item.phoneLabel : item.label}
                      </Text>
                      {!phone && (
                        <Text
                          as="span"
                          fontFamily="mono"
                          fontSize="xs"
                          color="fg.muted"
                          whiteSpace="nowrap"
                        >
                          {item.destination.toUpperCase()} →
                        </Text>
                      )}
                    </NextLink>
                  </Link>
                </Box>
              );
            })}
          </Grid>
        )}
      </Box>
    </Box>
  );
}
