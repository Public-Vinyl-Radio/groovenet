import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Stack } from "@chakra-ui/react";
import ChoreGroup, { type ChoreRowData } from "@/components/chores/ChoreGroup";
import ChoresCareLog, {
  CareLogEntryCard,
  careLogEntryKey,
} from "@/components/chores/ChoresCareLog";
import ChoresOverview from "@/components/chores/ChoresOverview";
import ChoresSelectionBar from "@/components/chores/ChoresSelectionBar";
import { careLogFixture, logEntryFixture, progressFixture } from "@/components/chores/fixtures";

// The pieces of the Chores page (#943). Toggle the theme and palette in the
// toolbar to check Mono and Sleeve, light and dark.

const meta: Meta = {
  title: "Chores",
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj;

const phone = { viewport: { defaultViewport: "mobile1" } };

export const Overview: Story = {
  render: () => (
    <Box maxW="1100px">
      <ChoresOverview progress={progressFixture} />
    </Box>
  ),
};

export const OverviewWithPace: Story = {
  name: "Overview · with pace",
  render: () => (
    <Box maxW="1100px">
      <ChoresOverview
        progress={{
          ...progressFixture,
          cleaned: 130,
          stacks_done: 13,
          next_stack_no: 14,
          pace: { stacks_per_week: 1.5, projected_finish_date: "2027-03-14T12:00:00Z" },
          by_sleeve_type: {
            "poly-rice-paper-poly": 96,
            poly: 40,
            paper: 22,
            original: 54,
            unknown: 200,
          },
        }}
      />
    </Box>
  ),
};

export const OverviewPhone: Story = {
  name: "Overview · phone",
  parameters: phone,
  render: () => <ChoresOverview progress={progressFixture} />,
};

const ROWS: ChoreRowData[] = [
  {
    key: "1",
    title: "Innerspeaker",
    artist: "Tame Impala",
    thumbnail: null,
    code: "LP-004",
    editHref: "/albums/1/edit",
    meta: "SPUN 4× IN OCT",
    sleeveUnknown: true,
  },
  {
    key: "2",
    title: "Cumbia Cumbia Cumbia!!! Vol. 1",
    artist: "Various",
    thumbnail: null,
    code: null,
    editHref: "/albums/1/edit",
    meta: "SPUN 2× IN OCT",
    sleeveUnknown: true,
  },
  {
    key: "3",
    title: "Jazz Is Dead 22",
    artist: "Adrian Younge / Ali Shaheed Muhammad / Ebo Taylor",
    thumbnail: null,
    code: "S-013",
    editHref: "/albums/1/edit",
    meta: "ADDED OCT 17",
    sleeveUnknown: false,
  },
];

function GroupDemo({ more }: { more?: boolean }) {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set(["1"]));
  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <Box maxW="760px">
      <ChoreGroup
        id="story"
        title={more ? "BACKLOG · A–Z" : "SPUN RECENTLY · NEVER CLEANED"}
        reason={more ? "Everything else, never cleaned." : "Played records wear first."}
        rows={ROWS}
        selected={selected}
        onToggle={toggle}
        onToggleSection={(keys, select) => setSelected(new Set(select ? keys : []))}
        more={more ? { label: "380 MORE IN THE BACKLOG", onClick: () => {} } : undefined}
      />
    </Box>
  );
}

export const Group: Story = { render: () => <GroupDemo /> };
export const GroupWithMore: Story = {
  name: "Group · backlog with more",
  render: () => <GroupDemo more />,
};
export const GroupPhone: Story = {
  name: "Group · phone",
  parameters: phone,
  render: () => <GroupDemo />,
};

export const SelectionBar: Story = {
  name: "Selection bar",
  render: () => (
    <Stack gap={6} maxW="760px">
      <ChoresSelectionBar selected={0} stackNo={null} onClear={() => {}} />
      <ChoresSelectionBar selected={10} stackNo={2} onClear={() => {}} />
      <ChoresSelectionBar selected={3} stackNo={null} onClear={() => {}} onLogCare={() => {}} />
    </Stack>
  ),
};

export const SelectionBarPhone: Story = {
  name: "Selection bar · phone",
  parameters: phone,
  render: () => <ChoresSelectionBar selected={10} stackNo={2} onClear={() => {}} />,
};

const justSaved = logEntryFixture({
  session_id: 63,
  stack_no: 2,
  occurred_at: "2026-11-01T18:09:00Z",
});

export const CareLog: Story = {
  name: "Care log",
  render: () => (
    <Box maxW="380px">
      <ChoresCareLog
        thisMonth={{ records: 11, sessions: 2 }}
        entries={careLogFixture}
        timeZone="America/Los_Angeles"
        justSavedSessionId={null}
        onUndo={() => {}}
      />
    </Box>
  ),
};

export const CareLogJustSaved: Story = {
  name: "Care log · just saved",
  render: () => (
    <Box maxW="380px">
      <ChoresCareLog
        thisMonth={{ records: 21, sessions: 3 }}
        entries={[justSaved, ...careLogFixture]}
        timeZone="America/Los_Angeles"
        justSavedSessionId={63}
        onUndo={() => {}}
      />
    </Box>
  ),
};

export const CareLogUndoBlocked: Story = {
  name: "Care log · undo blocked by an open stack",
  render: () => (
    <Box maxW="380px">
      <ChoresCareLog
        thisMonth={{ records: 21, sessions: 3 }}
        entries={[justSaved, ...careLogFixture]}
        timeZone="America/Los_Angeles"
        justSavedSessionId={63}
        onUndo={() => {}}
        undoError="Another stack is open. Log or clear it, then undo this one."
      />
    </Box>
  ),
};

export const CareLogPhone: Story = {
  name: "Care log · phone",
  parameters: phone,
  render: () => (
    <ChoresCareLog
      thisMonth={{ records: 11, sessions: 2 }}
      entries={careLogFixture}
      timeZone="America/Los_Angeles"
      justSavedSessionId={null}
      onUndo={() => {}}
    />
  ),
};

export const CareLogEmpty: Story = {
  name: "Care log · empty",
  render: () => (
    <Box maxW="380px">
      <ChoresCareLog
        thisMonth={null}
        entries={[]}
        timeZone="America/Los_Angeles"
        justSavedSessionId={null}
        onUndo={() => {}}
      />
    </Box>
  ),
};

export const HistoryEntries: Story = {
  name: "Care history entries · voided",
  render: () => (
    <Stack maxW="640px" gap="14px">
      {[
        logEntryFixture({ session_id: 64, stack_no: 3, source: "web" }),
        logEntryFixture({ session_id: 65, stack_no: 2, voided: true }),
        logEntryFixture({
          kind: "action",
          session_id: null,
          action_id: 900,
          stack_no: null,
          source: "api",
          record_count: 1,
          action_types: ["repaired"],
          notes: "Flattened a slight warp.",
        }),
      ].map((entry) => (
        <CareLogEntryCard
          key={careLogEntryKey(entry)}
          entry={entry}
          timeZone="America/Los_Angeles"
          action={entry.voided ? undefined : { label: "VOID", onClick: () => {} }}
        />
      ))}
    </Stack>
  ),
};
