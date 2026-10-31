"use client";

import React from "react";
import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import type { SpinRecapResponse } from "@/services/internalApi/spins";
import { Bar, RecapLinkBar, SplitSegments } from "@/components/spins/recapParts";
import SpinStatTiles from "@/components/spins/SpinStatTiles";
import { currentMonth, formatMonthName } from "@/components/spins/spinMonth";
import { useSpinRecapQuery } from "@/hooks/useSpinsQuery";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";

type Props = {
  /** "YYYY-MM", the current month in the display time zone. */
  month: string;
  /** Null while loading or after an error: the tiles show "–". */
  recap: SpinRecapResponse | null;
  error?: string | null;
};

/**
 * Home's month card (#881): "OCTOBER SO FAR", the recap's four stats and, from
 * `md` up, the vinyl/digital split. The header is the link to the full recap.
 */
export function MonthCard({ month, recap, error }: Props) {
  const vinyl = recap?.split.vinyl ?? 0;
  const digital = recap?.split.digital ?? 0;
  return (
    <Box
      as="section"
      aria-labelledby="home-month-heading"
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="md"
      mr="6px"
    >
      <RecapLinkBar
        href={`/spins/recap/${month}`}
        title={
          <Heading
            as="h2"
            id="home-month-heading"
            fontFamily="mono"
            fontSize="xs"
            fontWeight="semibold"
            letterSpacing="0.08em"
          >
            {formatMonthName(month)} SO FAR
          </Heading>
        }
      />
      {error ? (
        <Text
          role="alert"
          px="14px"
          py={3}
          fontFamily="mono"
          fontSize="xs"
          letterSpacing="0.06em"
          color="fg.muted"
        >
          COULDN&apos;T LOAD THE RECAP · {error.toUpperCase()}
        </Text>
      ) : (
        <>
          <SpinStatTiles stats={recap?.stats ?? null} inset />
          <Flex
            display={{ base: "none", md: "flex" }}
            align="center"
            gap={3}
            px="14px"
            py={3}
            borderTopWidth="outline"
            borderColor="border.ink"
          >
            <Text
              as="span"
              fontFamily="mono"
              fontSize="10px"
              fontWeight="semibold"
              letterSpacing="0.08em"
              whiteSpace="nowrap"
            >
              VINYL / DIGITAL
            </Text>
            <Bar
              flex="1"
              h="20px"
              boxShadow="none"
              label={`Vinyl ${vinyl} spins, digital ${digital} spins`}
            >
              <SplitSegments vinyl={vinyl} digital={digital} />
            </Bar>
            <Text
              as="span"
              fontFamily="mono"
              fontSize="11px"
              color="fg.muted"
              whiteSpace="nowrap"
              data-testid="home-month-split"
            >
              {vinyl} · {digital}
            </Text>
          </Flex>
        </>
      )}
    </Box>
  );
}

/** The month card for this friend's current month, in the configured display time zone. */
export default function HomeMonthCard({
  friendId,
  enabled,
}: {
  friendId: number;
  enabled: boolean;
}) {
  const month = currentMonth(useDisplayTimeZone());
  const query = useSpinRecapQuery({ friend_id: friendId, month }, { enabled });
  return <MonthCard month={month} recap={query.recap} error={query.error?.message ?? null} />;
}
