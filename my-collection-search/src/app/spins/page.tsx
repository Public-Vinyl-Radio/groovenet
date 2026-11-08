"use client";

import React, { Suspense } from "react";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Button,
  EmptyState,
  Flex,
  Grid,
  Spinner,
  Stack,
  Tabs,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react";
import { FiDisc } from "react-icons/fi";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import ListeningSessionCard from "@/components/spins/ListeningSessionCard";
import { SpinDetailEmpty, SpinDetailModal, SpinDetailPanel } from "@/components/spins/SpinDetail";
import { findSpinSelection, SPIN_PARAM } from "@/components/spins/spinSelection";
import { countLabel } from "@/components/spins/listeningLogParts";
import SpinMonthSwitcher from "@/components/spins/SpinMonthSwitcher";
import SpinRecapStrip from "@/components/spins/SpinRecapStrip";
import {
  currentMonth,
  formatMonthLabel,
  formatMonthName,
  monthBounds,
  resolveMonth,
} from "@/components/spins/spinMonth";
import { groupListeningLog, type ListeningLogDay } from "@/components/spins/spinSummary";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useSpinRecapQuery, useSpinsInfiniteQuery } from "@/hooks/useSpinsQuery";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import { useUsername } from "@/providers/UsernameProvider";

const MEDIUM_TABS = [
  { value: "all", label: "ALL" },
  { value: "vinyl", label: "VINYL" },
  { value: "digital", label: "DIGITAL" },
] as const;
type MediumTab = (typeof MEDIUM_TABS)[number]["value"];

// Sessions per page; a day of listening is usually a page or less.
const PAGE_SIZE = 50;

function DayHeading({ day }: { day: ListeningLogDay }) {
  return (
    <SectionHeading
      level={3}
      meta={day.date}
      actions={
        <Text fontFamily="label" fontSize="xs" letterSpacing="0.06em" color="fg.muted">
          {countLabel(day.spinCount, "SPIN")} · {countLabel(day.recordCount, "RECORD")}
        </Text>
      }
      columnGap={3}
      rowGap={1}
      pb={1.5}
      borderBottomWidth="outline"
      borderColor="border.ink"
    >
      {day.label}
    </SectionHeading>
  );
}

function LogStatus({ children }: { children: React.ReactNode }) {
  return (
    <Flex
      minH="72px"
      align="center"
      justify="center"
      gap={2}
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

function SpinsPageContent() {
  const { friend: currentUserFriend, isHydrated } = useUsername();
  const friendId = currentUserFriend?.id ?? 0;
  const timeZone = useDisplayTimeZone();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const latest = currentMonth(timeZone);
  const month = resolveMonth(searchParams.get("month"), latest);
  const [medium, setMedium] = React.useState<MediumTab>("all");
  const { from, to } = monthBounds(month, timeZone);

  const replaceParam = (name: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(name);
    else params.set(name, value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const setMonth = (next: string) => replaceParam("month", next);
  // The selected play lives in the URL, so a reload or a shared link reopens it.
  const selectSpin = (key: string | null) => replaceParam(SPIN_PARAM, key);
  const clearSelection = () => selectSpin(null);
  // The side panel shows the detail from `xl`; below it, a modal does.
  const isDesktop = useBreakpointValue({ base: false, xl: true }) === true;

  const enabled = isHydrated && friendId > 0;
  const recapQuery = useSpinRecapQuery({ friend_id: friendId, month }, { enabled });
  const spinsQuery = useSpinsInfiniteQuery(
    {
      friend_id: friendId,
      from,
      to,
      limit: PAGE_SIZE,
      medium: medium === "all" ? undefined : medium,
    },
    { enabled },
  );
  const { spins, fetchNextPage, hasNextPage, isFetchingNextPage } = spinsQuery;
  const days = React.useMemo(() => groupListeningLog(spins, timeZone), [spins, timeZone]);
  const selectedKey = searchParams.get(SPIN_PARAM);
  // An unknown key, or one not loaded yet, is no selection.
  const selection = React.useMemo(() => findSpinSelection(days, selectedKey), [days, selectedKey]);

  const sentinel = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, days.length]);

  const header = (
    <PageHeader>
      <PageHeader.Title>Spins</PageHeader.Title>
      <PageHeader.Actions
        phone={<SpinMonthSwitcher month={month} latest={latest} onChange={setMonth} short />}
        desktop={
          <>
            <SpinMonthSwitcher month={month} latest={latest} onChange={setMonth} />
            <Button asChild variant="solid" size="sm" h="44px">
              <NextLink href={`/spins/recap/${month}`}>FULL RECAP →</NextLink>
            </Button>
          </>
        }
      />
    </PageHeader>
  );

  if (!enabled) {
    return (
      <PageContainer>
        {header}
        <Flex justify="center" py={10}>
          <Spinner />
        </Flex>
      </PageContainer>
    );
  }

  const monthName = formatMonthName(month);
  const mediumWord = medium === "all" ? "" : `${medium} `;

  let log: React.ReactNode;
  if (spinsQuery.isLoading) {
    log = (
      <Flex justify="center" py={6}>
        <Spinner size="sm" />
      </Flex>
    );
  } else if (spinsQuery.error) {
    log = (
      <LogStatus>COULDN&apos;T LOAD SPINS · {spinsQuery.error.message.toUpperCase()}</LogStatus>
    );
  } else if (days.length === 0) {
    log = (
      <EmptyState.Root size="sm">
        <EmptyState.Content>
          <EmptyState.Indicator>
            <FiDisc />
          </EmptyState.Indicator>
          <VStack textAlign="center">
            <EmptyState.Title>
              No {mediumWord}spins in {monthName.charAt(0) + monthName.slice(1).toLowerCase()}
            </EmptyState.Title>
            <EmptyState.Description>
              Log a spin from an album page, or pick another month.
            </EmptyState.Description>
          </VStack>
        </EmptyState.Content>
      </EmptyState.Root>
    );
  } else {
    log = (
      <Stack gap={3.5}>
        {days.map((day) => (
          <Stack as="section" key={day.key} gap={3.5} aria-label={`${day.label} ${day.date}`}>
            <DayHeading day={day} />
            {day.sessions.map((session) => (
              <Box key={session.key} mr="6px" mb="6px">
                <ListeningSessionCard
                  session={session}
                  selectedKey={selection?.play.key}
                  onSelect={(play) => selectSpin(play.key)}
                />
              </Box>
            ))}
          </Stack>
        ))}
        <div ref={sentinel} data-testid="spins-sentinel" />
        {isFetchingNextPage ? (
          <LogStatus>
            <Spinner size="xs" /> LOADING OLDER DAYS
          </LogStatus>
        ) : hasNextPage ? (
          <LogStatus>OLDER DAYS LOAD AS YOU SCROLL</LogStatus>
        ) : (
          <LogStatus>START OF {formatMonthLabel(month)}</LogStatus>
        )}
      </Stack>
    );
  }

  return (
    <PageContainer>
      {header}
      <Stack gap={4.5} pb={6}>
        <SpinRecapStrip month={month} current={month === latest} recap={recapQuery.recap} />

        <Grid
          templateColumns={{ base: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 380px" }}
          gap={8}
          mt={{ md: 1.5 }}
        >
          <Stack as="section" aria-labelledby="spin-log-heading" gap={3.5} minW={0}>
            <Tabs.Root
              value={medium}
              onValueChange={(details) => setMedium(details.value as MediumTab)}
              activationMode="automatic"
            >
              <Flex align="center" gap={3}>
                <SectionLabel
                  variant="strip"
                  id="spin-log-heading"
                  flex="1"
                  display={{ base: "none", md: "flex" }}
                >
                  LISTENING LOG
                </SectionLabel>
                <SegmentedControl
                  tabs
                  framed
                  aria-label="Source"
                  items={MEDIUM_TABS}
                  w={{ base: "full", md: "auto" }}
                />
              </Flex>
            </Tabs.Root>
            {log}
          </Stack>

          <Box
            as="aside"
            aria-label="Spin detail"
            display={{ base: "none", xl: "block" }}
            pr="6px"
            pb="6px"
            position="sticky"
            top={4}
            alignSelf="start"
            maxH="calc(100dvh - var(--chrome-bottom, 0px) - 32px)"
            overflowY="auto"
          >
            {isDesktop && selection ? (
              <SpinDetailPanel
                selection={selection}
                onSelect={selectSpin}
                onClose={clearSelection}
                onDeleted={clearSelection}
              />
            ) : (
              <SpinDetailEmpty />
            )}
          </Box>
        </Grid>
      </Stack>
      {!isDesktop && selection && (
        <SpinDetailModal
          selection={selection}
          onSelect={selectSpin}
          onClose={clearSelection}
          onDeleted={clearSelection}
        />
      )}
    </PageContainer>
  );
}

export default function SpinsPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <Flex justify="center" py={10}>
            <Spinner />
          </Flex>
        </PageContainer>
      }
    >
      <SpinsPageContent />
    </Suspense>
  );
}
