import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Button, SegmentGroup, Stack } from "@chakra-ui/react";
import SavedStatus from "@/components/settings/SavedStatus";
import SettingsRow from "@/components/settings/SettingsRow";
import { SettingsDrillList, SettingsRail } from "@/components/settings/SettingsNav";

// The Settings shell's pieces (#968), and the row and status the section
// issues build on (#969–#971). Toggle the theme and palette in the toolbar to
// check Mono and Sleeve, light and dark.

const meta: Meta = {
  title: "Settings",
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj;

const phone = { viewport: { defaultViewport: "mobile1" } };

export const Rail: Story = {
  render: () => <SettingsRail current="libraries" />,
};

export const DrillInList: Story = {
  name: "Drill-in list · phone",
  parameters: phone,
  render: () => (
    <Box maxW="390px">
      <SettingsDrillList
        summaries={{
          appearance: "Mono · light on this device",
          libraries: "4 libraries · default collector-2",
          "apple-music": "No cookie file",
          "ai-metadata": "Custom prompt",
          about: "Version 0.3.15",
          "disaster-recovery": "Backups and restore",
        }}
      />
    </Box>
  ),
};

function ScopeControl() {
  const [value, setValue] = React.useState("library");
  return (
    <SegmentGroup.Root
      size="sm"
      value={value}
      aria-label="Suggestion scope"
      onValueChange={(details) => setValue(details.value ?? "library")}
    >
      <SegmentGroup.Indicator />
      <SegmentGroup.Items
        items={[
          { value: "library", label: "This library" },
          { value: "all", label: "All libraries" },
        ]}
      />
    </SegmentGroup.Root>
  );
}

export const Rows: Story = {
  render: () => (
    <Box maxW="920px">
      <SettingsRow
        label="Suggestions"
        help="Where related tracks, similar tracks and playlist suggestions come from for collector-2."
      >
        <ScopeControl />
      </SettingsRow>
      <SettingsRow label="Remote backups" help="Snapshots to restic on a schedule." divider>
        <Button size="sm" variant="outline">
          Run backup now
        </Button>
      </SettingsRow>
    </Box>
  ),
};

export const RowsOnAPhone: Story = {
  name: "Rows · phone",
  parameters: phone,
  render: Rows.render,
};

function UndoableDefault() {
  const [current, setCurrent] = React.useState("collector-2");
  const [previous, setPrevious] = React.useState<string | null>(null);
  const choose = (name: string) => {
    setPrevious(current);
    setCurrent(name);
  };
  return (
    <Stack gap={3} align="start">
      <Stack direction="row" gap={2}>
        {["collector-2", "collector-3", "collector-4"].map((name) => (
          <Button
            key={name}
            size="sm"
            variant="outline"
            disabled={name === current}
            onClick={() => choose(name)}
          >
            Make {name} default
          </Button>
        ))}
      </Stack>
      <SavedStatus
        saved={previous !== null}
        subject={`Default set to ${current}`}
        onUndo={() => {
          setCurrent(previous ?? current);
          setPrevious(null);
        }}
      />
    </Stack>
  );
}

export const Saved: Story = {
  name: "Saved status · undo",
  render: () => <UndoableDefault />,
};

export const SavedWithTime: Story = {
  name: "Saved status · time",
  render: () => <SavedStatus saved detail="14:02" />,
};
