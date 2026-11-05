"use client";

import React from "react";
import { Box, Button, Flex, Spinner, Stack, Tabs, Text } from "@chakra-ui/react";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader, { type HeaderAction } from "@/components/layout/PageHeader";
import ChoreGroup, { type ChoreRowData } from "@/components/chores/ChoreGroup";
import ChoresCareLog from "@/components/chores/ChoresCareLog";
import ChoresOverview from "@/components/chores/ChoresOverview";
import ChoresSelectionBar from "@/components/chores/ChoresSelectionBar";
import LogCareDialog, { type LogCareRecord } from "@/components/chores/LogCareDialog";
import { copyRefFromKey, undoErrorText, type LogCareTarget } from "@/components/chores/careLog";
import {
  addedMeta,
  choresMeta,
  moreInBacklog,
  rowKey,
  spunMeta,
  STACK_SIZE,
  stackItemRow,
  todoCount,
} from "@/components/chores/choresWording";
import { toaster } from "@/components/ui/toaster";
import {
  useOpenRecordCareStackQuery,
  useRecordCareLogQuery,
  useRecordCareProgressQuery,
  useRecordCareQueueQuery,
  useRecordCareSessionMutations,
  useRecordCareStackMutations,
  useRecordCareSummaryQuery,
} from "@/hooks/useRecordCareQuery";
import { DEFAULT_TARGET_SLEEVE } from "@/lib/recordCare";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import { useUsername } from "@/providers/UsernameProvider";
import type {
  RecordCareQueueItem,
  RecordCareSessionCreate,
} from "@/services/internalApi/recordCare";

// Backlog rows per "more"; the queue asks for a longer page each time.
const BACKLOG_PAGE = 20;

// The column shows a few live entries; ask for some spare for the undone ones.
const CARE_LOG_LIMIT = 10;

const PULL_LABEL = `PULL NEXT STACK OF ${STACK_SIZE}`;

type Tab = "todo" | "log";
const panelId = (tab: string) => `chores-panel-${tab}`;
const triggerId = (tab: string) => `chores-tab-${tab}`;
const tabLabel = { fontSize: "xs", letterSpacing: "0.06em", px: { md: 4 } } as const;

function toRow(item: RecordCareQueueItem, meta?: string): ChoreRowData {
  return {
    key: rowKey(item),
    title: item.title,
    artist: item.artist,
    thumbnail: item.thumbnail,
    meta,
    sleeveUnknown: item.inner_sleeve_type === null,
  };
}

function Notice({ role, children }: { role?: "alert"; children: React.ReactNode }) {
  return (
    <Flex
      role={role}
      minH="72px"
      align="center"
      justify="center"
      px={4}
      mr="6px"
      borderWidth="outline"
      borderRadius="md"
      borderStyle="dashed"
      borderColor="border"
      fontFamily="mono"
      fontSize="11px"
      letterSpacing="0.08em"
      color="fg.muted"
      textAlign="center"
    >
      {children}
    </Flex>
  );
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Chores (#943): clean and sleeve the whole library, one stack of ten at a time. */
function ChorePageContent() {
  const { friend, isHydrated } = useUsername();
  const friendId = friend?.id ?? 0;
  const enabled = isHydrated && friendId > 0;
  const timeZone = useDisplayTimeZone();
  const [tab, setTab] = React.useState<Tab>("todo");
  const [backlogLimit, setBacklogLimit] = React.useState(BACKLOG_PAGE);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());

  const queueQuery = useRecordCareQueueQuery(
    { friend_id: friendId, limit: backlogLimit },
    { enabled },
  );
  const progressQuery = useRecordCareProgressQuery({ friend_id: friendId }, { enabled });
  const stackQuery = useOpenRecordCareStackQuery({ friend_id: friendId }, { enabled });
  const summaryQuery = useRecordCareSummaryQuery({ friend_id: friendId }, { enabled });
  const logQuery = useRecordCareLogQuery(
    { friend_id: friendId, limit: CARE_LOG_LIMIT },
    { enabled },
  );
  const { pullStack, discardStack, pullPending, discardPending } =
    useRecordCareStackMutations(friendId);
  const { logSession, voidSession, voidPending } = useRecordCareSessionMutations(friendId);
  const [logOpen, setLogOpen] = React.useState(false);
  // Only the log saved on this visit can be undone from the column.
  const [justSavedId, setJustSavedId] = React.useState<number | null>(null);
  const [undoError, setUndoError] = React.useState<string | null>(null);

  const stack = stackQuery.data ?? null;
  const stackKeys = React.useMemo(
    () => new Set(stack?.items.map((item) => rowKey(item)) ?? []),
    [stack],
  );

  // An open stack found on load is selected once; later toggles are the user's.
  const restoredStackId = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!stack || restoredStackId.current === stack.id) return;
    restoredStackId.current = stack.id;
    setSelected(new Set(stack.items.map((item) => rowKey(item))));
  }, [stack]);

  // The selection is "the stack" while it is exactly the stack's copies; any
  // other pick, a part of it included, is logged copy by copy.
  const selectedStack =
    stack !== null &&
    selected.size === stackKeys.size &&
    [...selected].every((key) => stackKeys.has(key))
      ? stack
      : null;

  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleSection = (keys: string[], select: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (select) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  const pull = async () => {
    try {
      const result = await pullStack(STACK_SIZE);
      restoredStackId.current = result.stack.id;
      setSelected(new Set(result.stack.items.map((item) => rowKey(item))));
    } catch (error) {
      toaster.create({
        title: "Couldn't pull a stack",
        description: errorText(error),
        type: "error",
      });
    }
  };

  // CLEAR discards a pulled stack; an ad-hoc pick is only deselected.
  const clear = async () => {
    if (stack) {
      try {
        await discardStack(stack.id);
      } catch (error) {
        toaster.create({
          title: "Couldn't clear the stack",
          description: errorText(error),
          type: "error",
        });
        return;
      }
    }
    setSelected(new Set());
  };

  const save = async (body: Omit<RecordCareSessionCreate, "friend_id">) => {
    const result = await logSession(body);
    setJustSavedId(result.session.id);
    setUndoError(null);
    setSelected(new Set());
  };

  // Undo voids the log and gives the selection back: the reopened stack, or
  // the copies an ad-hoc log touched (made real if they were implicit).
  const undo = async (sessionId: number) => {
    setUndoError(null);
    try {
      const result = await voidSession(sessionId);
      setJustSavedId(null);
      if (result.session.status === "open") {
        restoredStackId.current = result.session.id;
        setSelected(new Set(result.session.items.map((item) => rowKey(item))));
      } else {
        setSelected(
          new Set(
            result.copies.map((copy) => rowKey({ copy_id: copy.id, release_id: copy.release_id })),
          ),
        );
      }
    } catch (error) {
      setUndoError(undoErrorText(error));
    }
  };

  const progress = progressQuery.data;
  const queue = queueQuery.data;
  const todo = progress ? todoCount(progress) : null;
  const todoLabel = todo === null ? "TO DO" : `TO DO · ${todo.toLocaleString("en-US")}`;
  const nothingToPull = todo === 0 && !stack;

  const pullAction: HeaderAction = {
    label: PULL_LABEL,
    onClick: () => void pull(),
    loading: pullPending,
    disabled: !enabled || nothingToPull,
    primary: true,
    // Phones pull from under the overview instead.
    phone: "hidden",
  };

  // The tabs close the header at both widths, so the page sits inside them.
  const page = (children: React.ReactNode) => (
    <PageContainer>
      <Tabs.Root
        value={tab}
        onValueChange={(details) => setTab(details.value as Tab)}
        activationMode="automatic"
        ids={{ content: panelId, trigger: triggerId }}
      >
        <PageHeader>
          <PageHeader.Title meta={progress ? choresMeta(progress) : undefined} metaOnPhone={false}>
            Chores
          </PageHeader.Title>
          <PageHeader.Actions actions={[pullAction]} />
          <PageHeader.Tabs>
            <Tabs.List
              aria-label="Chores"
              gap={0}
              mx={{ base: -4, md: 0 }}
              display={{ base: "grid", md: "flex" }}
              gridTemplateColumns="repeat(2, minmax(0, 1fr))"
            >
              <Tabs.Trigger value="todo" justifyContent="center" h="44px" {...tabLabel}>
                {todoLabel}
              </Tabs.Trigger>
              <Tabs.Trigger value="log" justifyContent="center" h="44px" ml="-2px" {...tabLabel}>
                CARE LOG
              </Tabs.Trigger>
            </Tabs.List>
          </PageHeader.Tabs>
        </PageHeader>
        {children}
      </Tabs.Root>
    </PageContainer>
  );

  if (!enabled) {
    return page(
      <Flex justify="center" py={10}>
        <Spinner />
      </Flex>,
    );
  }

  // Every row on screen by key, for the modal's covers and names.
  const rowsByKey = new Map<string, LogCareRecord>();
  for (const item of stack?.items ?? []) {
    const row = stackItemRow(item);
    rowsByKey.set(rowKey(row), { key: rowKey(row), title: row.title, thumbnail: row.thumbnail });
  }
  for (const item of queue
    ? [...queue.spun_recently.items, ...queue.new_arrivals.items, ...queue.backlog.items]
    : []) {
    rowsByKey.set(rowKey(item), {
      key: rowKey(item),
      title: item.title,
      thumbnail: item.thumbnail,
    });
  }
  const selectedRecords = [...selected].flatMap((key) => rowsByKey.get(key) ?? []);
  const logTarget: LogCareTarget = selectedStack
    ? { stack_id: selectedStack.id }
    : { copies: [...selected].map(copyRefFromKey) };

  let groups: React.ReactNode;
  if (queueQuery.error) {
    groups = (
      <Notice role="alert">
        COULDN&apos;T LOAD THE QUEUE · {queueQuery.error.message.toUpperCase()}
      </Notice>
    );
  } else if (!queue) {
    groups = (
      <Flex justify="center" py={6}>
        <Spinner size="sm" />
      </Flex>
    );
  } else {
    const backlogRemaining = queue.backlog.total - queue.backlog.items.length;
    const empty =
      !stack &&
      queue.spun_recently.items.length === 0 &&
      queue.new_arrivals.items.length === 0 &&
      queue.backlog.items.length === 0;
    const shared = { selected, onToggle: toggle, onToggleSection: toggleSection };
    groups = empty ? (
      <Notice>NOTHING LEFT TO CLEAN. EVERY RECORD HAS HAD ITS FIRST CLEAN.</Notice>
    ) : (
      <>
        {stack && (
          <ChoreGroup
            id="chores-stack"
            title={stack.stack_no !== null ? `STACK ${stack.stack_no} · PULLED` : "PULLED STACK"}
            reason="Up next, in queue order."
            rows={stack.items.map((item) => toRow(stackItemRow(item)))}
            {...shared}
          />
        )}
        <ChoreGroup
          id="chores-spun"
          title="SPUN RECENTLY · NEVER CLEANED"
          reason="Played records wear first."
          rows={queue.spun_recently.items.map((item) =>
            toRow(item, spunMeta(item.spin_count, item.window_label)),
          )}
          {...shared}
        />
        <ChoreGroup
          id="chores-new"
          title="NEW ARRIVALS"
          reason="Clean before the first play."
          rows={queue.new_arrivals.items.map((item) =>
            toRow(item, item.added_at ? addedMeta(item.added_at, timeZone) : undefined),
          )}
          {...shared}
        />
        <ChoreGroup
          id="chores-backlog"
          title="BACKLOG · A–Z"
          reason="Everything else, never cleaned."
          rows={queue.backlog.items.map((item) => toRow(item))}
          more={
            backlogRemaining > 0
              ? {
                  label: moreInBacklog(backlogRemaining),
                  onClick: () => setBacklogLimit((limit) => limit + BACKLOG_PAGE),
                  loading: queueQuery.isPlaceholderData,
                }
              : undefined
          }
          {...shared}
        />
      </>
    );
  }

  return page(
    <>
      <Text display={{ base: "none", md: "block" }} mt={-1} mb={5} fontSize="15px" color="fg.muted">
        Get the whole library cleaned and sleeved, one stack of ten at a time.
      </Text>

      {/* The overview heads the TO DO tab. */}
      <Stack
        as="section"
        id={panelId("todo")}
        role="tabpanel"
        aria-labelledby={triggerId("todo")}
        display={tab === "todo" ? "flex" : "none"}
        gap={{ base: "18px", md: 5 }}
        pb={6}
        minW={0}
      >
        <Stack gap="18px" minW={0}>
          {progress ? (
            <ChoresOverview progress={progress} />
          ) : progressQuery.error ? (
            <Notice role="alert">
              COULDN&apos;T LOAD PROGRESS · {progressQuery.error.message.toUpperCase()}
            </Notice>
          ) : (
            <Box
              data-testid="chores-overview-loading"
              h={{ base: "200px", md: "150px" }}
              mr="6px"
              bg="bg.muted"
              borderWidth="outline"
              borderRadius="md"
              borderColor="border.ink"
            />
          )}
          <Button
            size="sm"
            variant="outline"
            h="48px"
            mr="6px"
            boxShadow="sm"
            display={{ base: "flex", md: "none" }}
            onClick={pullAction.onClick}
            loading={pullPending}
            disabled={pullAction.disabled}
          >
            {PULL_LABEL}
          </Button>
        </Stack>
        <Stack gap="18px">{groups}</Stack>
        <ChoresSelectionBar
          selected={selected.size}
          stackNo={selectedStack?.stack_no ?? null}
          onClear={() => void clear()}
          clearing={discardPending}
          onLogCare={() => setLogOpen(true)}
        />
      </Stack>

      <Box
        as="section"
        id={panelId("log")}
        role="tabpanel"
        aria-labelledby={triggerId("log")}
        display={tab === "log" ? "block" : "none"}
        maxW={{ md: "720px" }}
        minW={0}
      >
        <ChoresCareLog
          thisMonth={progress?.this_month}
          entries={logQuery.data?.items}
          error={logQuery.error}
          timeZone={timeZone}
          justSavedSessionId={justSavedId}
          onUndo={(sessionId) => void undo(sessionId)}
          undoPending={voidPending}
          undoError={undoError}
        />
      </Box>

      <LogCareDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        stackNo={selectedStack?.stack_no ?? null}
        target={logTarget}
        records={selectedRecords}
        count={selected.size}
        defaultSleeve={summaryQuery.data?.needs_sleeve_type ?? DEFAULT_TARGET_SLEEVE}
        onSave={save}
      />
    </>,
  );
}

export default function ChorePage() {
  return <ChorePageContent />;
}
