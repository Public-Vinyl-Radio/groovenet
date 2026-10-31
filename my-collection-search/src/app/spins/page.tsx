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
  Heading,
  Spinner,
  Stack,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FiDisc } from "react-icons/fi";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import ListeningSessionCard from "@/components/spins/ListeningSessionCard";
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
    <Flex
      align="baseline"
      justify="space-between"
      wrap="wrap"
      columnGap={3}
      rowGap={1}
      pb={1.5}
      borderBottomWidth="outline"
      borderColor="border.ink"
    >
      <Heading
        as="h3"
        fontSize={{ base: "17px", md: "18px" }}
        lineHeight={{ base: "22px", md: "24px" }}
        fontWeight="semibold"
      >
        {day.label}{" "}
        <Text
          as="span"
          fontFamily="mono"
          fontSize={{ base: "11px", md: "xs" }}
          fontWeight="normal"
          letterSpacing="0.06em"
          color="fg.muted"
        >
          {day.date}
        </Text>
      </Heading>
      <Text
        fontFamily="mono"
        fontSize={{ base: "11px", md: "xs" }}
        letterSpacing={{ base: "0.04em", md: "0.06em" }}
        color="fg.muted"
      >
        {countLabel(day.spinCount, "SPIN")} · {countLabel(day.recordCount, "RECORD")}
      </Text>
    </Flex>
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

  const setMonth = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

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
    <PageHeader
      title="Spins"
      trailing={<SpinMonthSwitcher month={month} latest={latest} onChange={setMonth} short />}
      desktopActions={
        <>
          <SpinMonthSwitcher month={month} latest={latest} onChange={setMonth} />
          <Button asChild variant="solid" size="sm" h="44px">
            <NextLink href={`/spins/recap/${month}`}>FULL RECAP →</NextLink>
          </Button>
        </>
      }
    />
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
                <ListeningSessionCard session={session} />
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
                <Heading
                  as="h2"
                  id="spin-log-heading"
                  h="26px"
                  px={2.5}
                  display={{ base: "none", md: "flex" }}
                  alignItems="center"
                  bg="fg"
                  color="bg"
                  fontFamily="mono"
                  fontSize="xs"
                  fontWeight="semibold"
                  letterSpacing="0.08em"
                  flexShrink={0}
                >
                  LISTENING LOG
                </Heading>
                <Box
                  flex="1"
                  h="2px"
                  bg="fg"
                  display={{ base: "none", md: "block" }}
                  aria-hidden="true"
                />
                <Tabs.List
                  aria-label="Source"
                  gap={0}
                  display="grid"
                  gridTemplateColumns="repeat(3, minmax(0, 1fr))"
                  w={{ base: "full", md: "auto" }}
                >
                  {MEDIUM_TABS.map((tab, index) => (
                    <Tabs.Trigger
                      key={tab.value}
                      value={tab.value}
                      justifyContent="center"
                      h="44px"
                      px={3}
                      ml={index ? "-2px" : 0}
                      fontSize={{ base: "xs", md: "11px" }}
                      letterSpacing="0.06em"
                    >
                      {tab.label}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
              </Flex>
            </Tabs.Root>
            {log}
          </Stack>

          <Box as="aside" aria-label="Spin detail" display={{ base: "none", xl: "block" }} pr="6px">
            <Flex
              minH="200px"
              align="center"
              justify="center"
              p={6}
              borderWidth="outline"
              borderStyle="dashed"
              borderColor="border"
              textAlign="center"
              fontSize="sm"
              color="fg.muted"
            >
              Pick a spin to see how it was logged.
            </Flex>
          </Box>
        </Grid>
      </Stack>
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
