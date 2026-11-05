"use client";

import React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  EmptyState,
  Flex,
  Grid,
  Spinner,
  Stack,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react";
import { FiChevronLeft, FiChevronRight, FiDisc } from "react-icons/fi";
import { pageHeader } from "@/app/houseStyle";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import { HeaderButton } from "@/components/layout/ListHeader";
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
  /** The month's spin count once it has loaded, for the meta. */
  spins?: number;
};

/** "so far · 358 spins" for the month in progress, "358 spins" for one that's over. */
export function recapMeta(spins: number, current: boolean): string {
  const count = `${spins.toLocaleString("en-US")} ${spins === 1 ? "spin" : "spins"}`;
  return current ? `so far · ${count}` : count;
}

/**
 * The month is the page title. From `md`: the Spins / Recap trail, then the
 * month switcher and Listening log in the actions. Phones: one bar with back
 * to Spins and the months either side as two icons.
 */
export function SpinRecapHeader({ month, latest, onMonthChange, spins }: HeaderProps) {
  const current = month >= latest;
  const meta = spins === undefined ? undefined : recapMeta(spins, current);
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return (
    <>
      <PageHeader>
        <PageHeader.Context
          crumbs={[{ label: "Spins", href: logHref(month) }, { label: "Recap" }]}
        />
        <PageHeader.Title meta={meta} metaOnPhone={false}>
          {formatMonthTitle(month)}
        </PageHeader.Title>
        <PageHeader.Actions
          actions={[
            {
              label: formatMonthTitle(previous),
              icon: <FiChevronLeft />,
              onClick: () => onMonthChange(previous),
              desktop: "hidden",
            },
            {
              label: formatMonthTitle(next),
              icon: <FiChevronRight />,
              onClick: () => onMonthChange(next),
              disabled: current,
              desktop: "hidden",
            },
          ]}
          // Phones go back to the log from the bar, so Listening log is desktop only.
          desktop={
            <>
              <SpinMonthSwitcher month={month} latest={latest} onChange={onMonthChange} />
              <HeaderButton asChild>
                <NextLink href={logHref(month)}>Listening log</NextLink>
              </HeaderButton>
            </>
          }
        />
      </PageHeader>
      {meta && (
        <Text display={{ base: "block", md: "none" }} mt={-1} mb={4} {...pageHeader.meta}>
          {meta}
        </Text>
      )}
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
      borderRadius="md"
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
        spins={query.recap?.stats.spins.value}
      />
      {body}
    </PageContainer>
  );
}
