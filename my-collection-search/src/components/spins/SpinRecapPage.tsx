"use client";

import React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  EmptyState,
  Flex,
  Grid,
  Heading,
  IconButton,
  Spinner,
  Stack,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react";
import { FiChevronLeft, FiDisc } from "react-icons/fi";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import PageContainer from "@/components/layout/PageContainer";
import { useRootFlag } from "@/hooks/useRootFlag";
import { useSpinRecapQuery } from "@/hooks/useSpinsQuery";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import { useUsername } from "@/providers/UsernameProvider";
import type { SpinRecapResponse } from "@/services/internalApi/spins";
import {
  RecapBpmSpread,
  RecapGenreMix,
  RecapHeatmap,
  RecapSplit,
  RecapTopLists,
} from "./SpinRecapCharts";
import SpinMonthSwitcher from "./SpinMonthSwitcher";
import SpinStatTiles from "./SpinStatTiles";
import { currentMonth, formatMonthTitle, shiftMonth } from "./spinMonth";

const recapHref = (month: string) => `/spins/recap/${month}`;
const logHref = (month: string) => `/spins?month=${month}`;

type HeaderProps = {
  month: string;
  latest: string;
  onMonthChange: (month: string) => void;
};

/**
 * Phones: a 52px bar with back and the SPINS / RECAP trail, then the title and
 * a full-width month switcher. From `md`: the trail, then title, switcher and
 * "← LISTENING LOG" in one row.
 */
export function SpinRecapHeader({ month, latest, onMonthChange }: HeaderProps) {
  useRootFlag("data-page-header", true);
  const crumbs = [{ label: "Spins", href: logHref(month) }, { label: "Recap" }];
  return (
    <>
      {/* Sticky against the page, so it sits outside the title block. */}
      <Flex
        as="header"
        display={{ base: "flex", md: "none" }}
        position="sticky"
        top="var(--safe-top)"
        zIndex={80}
        bg="bg"
        mx={-4}
        pl={1}
        pr={4}
        h="var(--header-h)"
        align="center"
        gap={1}
        borderBottomWidth="outline"
        borderColor="border.ink"
        mb={4}
      >
        <IconButton
          asChild
          aria-label="Back to listening log"
          variant="ghost"
          boxSize="44px"
          minW="44px"
        >
          <NextLink href={logHref(month)}>
            <FiChevronLeft />
          </NextLink>
        </IconButton>
        <Breadcrumbs
          crumbs={crumbs}
          mb={0}
          flex="1"
          h="full"
          // The bar is the touch target's height; the trail's link fills it.
          css={{ "& a": { minHeight: "44px", display: "inline-flex", alignItems: "center" } }}
          data-testid="recap-breadcrumbs-phone"
        />
      </Flex>
      <Box mb={{ base: 7, md: 6 }}>
        <Breadcrumbs
          crumbs={crumbs}
          display={{ base: "none", md: "flex" }}
          mb={2.5}
          data-testid="recap-breadcrumbs"
        />
        <Flex
          direction={{ base: "column", md: "row" }}
          align={{ base: "stretch", md: "center" }}
          gap={{ base: 3, md: 4 }}
        >
          <Heading
            as="h1"
            flex={{ md: 1 }}
            fontFamily="heading"
            fontSize={{ base: "30px", md: "44px" }}
            lineHeight={{ base: "36px", md: "48px" }}
            fontWeight="semibold"
          >
            {formatMonthTitle(month)}
          </Heading>
          <SpinMonthSwitcher
            month={month}
            latest={latest}
            onChange={onMonthChange}
            short
            soFar
            stretch
          />
          <Button
            asChild
            variant="outline"
            size="sm"
            h="44px"
            display={{ base: "none", md: "inline-flex" }}
          >
            <NextLink href={logHref(month)}>← LISTENING LOG</NextLink>
          </Button>
        </Flex>
      </Box>
    </>
  );
}

type ViewProps = {
  month: string;
  recap: SpinRecapResponse;
  friendId: number;
  /** Top lists side by side instead of in a tablist. */
  topColumns: boolean;
  /** Dusty crates (#866) goes here once it exists; nothing renders until then. */
  dustyCrates?: React.ReactNode;
};

/** A month with spins: stats, then every chart, in the artboards' order. */
export function SpinRecapView({ month, recap, friendId, topColumns, dustyCrates }: ViewProps) {
  const previousMonth = shiftMonth(month, -1);
  return (
    <Stack gap={{ base: 7, md: 7 }} pb={6}>
      <SpinStatTiles stats={recap.stats} previousMonth={previousMonth} framed />
      <Grid
        templateColumns={{ base: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }}
        gap={{ base: 7, lg: 10 }}
        pr="6px"
      >
        <RecapSplit month={month} recap={recap} />
        <RecapGenreMix month={month} previousMonth={previousMonth} recap={recap} />
      </Grid>
      <RecapTopLists recap={recap} friendId={friendId} columns={topColumns} />
      <Grid
        templateColumns={{ base: "minmax(0, 1fr)", lg: "minmax(0, 3fr) minmax(0, 2fr)" }}
        gap={{ base: 7, lg: 10 }}
        pr="6px"
      >
        <RecapHeatmap recap={recap} />
        <RecapBpmSpread recap={recap} />
      </Grid>
      {dustyCrates}
    </Stack>
  );
}

/** No spins this month: an empty state instead of a page of zeroed charts. */
export function SpinRecapEmpty({ month, current }: { month: string; current: boolean }) {
  const title = formatMonthTitle(month).split(" ")[0];
  return (
    <EmptyState.Root size="sm">
      <EmptyState.Content>
        <EmptyState.Indicator>
          <FiDisc />
        </EmptyState.Indicator>
        <VStack textAlign="center">
          <EmptyState.Title>
            No spins in {title}
            {current ? " yet" : ""}
          </EmptyState.Title>
          <EmptyState.Description>
            The recap fills in as you log spins. Pick another month, or head back to the log.
          </EmptyState.Description>
        </VStack>
        <Button asChild variant="outline" size="sm" h="44px">
          <NextLink href={logHref(month)}>← LISTENING LOG</NextLink>
        </Button>
      </EmptyState.Content>
    </EmptyState.Root>
  );
}

function RecapStatus({ children }: { children: React.ReactNode }) {
  return (
    <Flex
      minH="72px"
      align="center"
      justify="center"
      borderWidth="outline"
      borderStyle="dashed"
      borderColor="border"
      fontFamily="mono"
      fontSize="11px"
      letterSpacing="0.08em"
      color="fg.muted"
      textAlign="center"
      px={4}
    >
      {children}
    </Flex>
  );
}

/** `/spins/recap/[month]` (#865); the route has already checked `month`. */
export default function SpinRecapPage({ month }: { month: string }) {
  const { friend, isHydrated } = useUsername();
  const friendId = friend?.id ?? 0;
  const timeZone = useDisplayTimeZone();
  const router = useRouter();
  const latest = currentMonth(timeZone);
  const topColumns = useBreakpointValue({ base: false, xl: true }) === true;
  const enabled = isHydrated && friendId > 0;
  const query = useSpinRecapQuery({ friend_id: friendId, month }, { enabled });

  let body: React.ReactNode;
  if (!enabled || query.isLoading) {
    body = (
      <Flex justify="center" py={10}>
        <Spinner />
      </Flex>
    );
  } else if (query.error) {
    body = (
      <RecapStatus>COULDN&apos;T LOAD THE RECAP · {query.error.message.toUpperCase()}</RecapStatus>
    );
  } else if (!query.recap || query.recap.stats.spins.value === 0) {
    body = <SpinRecapEmpty month={month} current={month === latest} />;
  } else {
    // TODO(#866): pass the dusty crates section as `dustyCrates` once it exists.
    body = (
      <SpinRecapView
        month={month}
        recap={query.recap}
        friendId={friendId}
        topColumns={topColumns}
      />
    );
  }

  return (
    <PageContainer>
      <SpinRecapHeader
        month={month}
        latest={latest}
        onMonthChange={(next) => router.push(recapHref(next))}
      />
      {body}
    </PageContainer>
  );
}
