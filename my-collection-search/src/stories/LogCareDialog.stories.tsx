import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@chakra-ui/react";
import LogCareDialog, { type LogCareRecord } from "@/components/chores/LogCareDialog";

// The Chores log care modal (#944). Toggle the theme and palette in the
// toolbar to check Mono and Sleeve, light and dark.

const meta: Meta<typeof LogCareDialog> = {
  title: "Chores/Log care modal",
  component: LogCareDialog,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof LogCareDialog>;

const TITLES = [
  "Innerspeaker",
  "Cumbia Cumbia Cumbia!!! Vol. 1",
  "Magnetismo Animal",
  "Boleros Psicodélicos",
  "Jaguar Sound",
  "Trio Asesino",
  "Jazz Is Dead 22",
  "Boleros Psicodélicos II",
  "La Danza de Los Mirlos",
  "ATF",
  "MTV Unplugged",
  "Allah-Las",
];

const records = (n: number): LogCareRecord[] =>
  TITLES.slice(0, n).map((title, i) => ({ key: `release:${i}`, title, thumbnail: null }));

function Harness(props: Partial<React.ComponentProps<typeof LogCareDialog>>) {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <Button variant="solid" onClick={() => setOpen(true)}>
        LOG CARE →
      </Button>
      <LogCareDialog
        open={open}
        onOpenChange={setOpen}
        stackNo={2}
        target={{ stack_id: 50 }}
        records={records(10)}
        count={10}
        defaultSleeve="poly-rice-paper-poly"
        onSave={async () => {}}
        {...props}
      />
    </>
  );
}

export const Stack: Story = { name: "Pulled stack", render: () => <Harness /> };

export const AdHoc: Story = {
  name: "Ad-hoc selection, more than ten",
  render: () => (
    <Harness
      stackNo={null}
      target={{ copies: records(12).map((r) => ({ release_id: r.key })) }}
      records={records(12)}
      count={12}
    />
  ),
};

export const ApiError: Story = {
  name: "API error",
  render: () => (
    <Harness
      onSave={async () => {
        throw new Error("The stack is not open");
      }}
    />
  ),
};

export const Phone: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <Harness />,
};
