import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box } from "@chakra-ui/react";
import {
  RecapBpmSpread,
  RecapGenreMix,
  RecapHeatmap,
  RecapSplit,
  RecapTopLists,
} from "@/components/spins/SpinRecapCharts";
import { SpinRecapEmpty, SpinRecapHeader, SpinRecapView } from "@/components/spins/SpinRecapPage";
import { EMPTY_RECAP, OCTOBER_RECAP } from "./fixtures/spinRecap";

const meta: Meta<typeof SpinRecapView> = {
  title: "Spins/Recap",
  component: SpinRecapView,
  parameters: { layout: "padded" },
  args: { month: "2026-10", recap: OCTOBER_RECAP, friendId: 7, topColumns: true },
};

export default meta;
type Story = StoryObj<typeof SpinRecapView>;

const noop = () => {};

export const Page: Story = {
  name: "Page, populated",
  parameters: { viewport: { defaultViewport: "desktop" } },
  render: (args) => (
    <>
      <SpinRecapHeader month={args.month} latest="2026-10" onMonthChange={noop} />
      <SpinRecapView {...args} />
    </>
  ),
};

export const PagePhone: Story = {
  name: "Page, phone",
  args: { topColumns: false },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: Page.render,
};

export const PageEarlierMonth: Story = {
  name: "Page, an earlier month",
  args: { month: "2026-09" },
  render: (args) => (
    <>
      <SpinRecapHeader month={args.month} latest="2026-10" onMonthChange={noop} />
      <SpinRecapView {...args} />
    </>
  ),
};

export const PageEmpty: Story = {
  name: "Page, empty month",
  render: (args) => (
    <>
      <SpinRecapHeader month={args.month} latest="2026-10" onMonthChange={noop} />
      <SpinRecapEmpty month={args.month} current />
    </>
  ),
};

const chart = (node: React.ReactNode) => <Box maxW="640px">{node}</Box>;

export const Split: Story = {
  name: "Vinyl / digital",
  render: (args) => chart(<RecapSplit month={args.month} recap={args.recap} />),
};

export const GenreMix: Story = {
  name: "Genre mix",
  render: (args) =>
    chart(<RecapGenreMix month={args.month} previousMonth="2026-09" recap={args.recap} />),
};

export const GenreMixNoPrevious: Story = {
  name: "Genre mix, nothing last month",
  args: {
    recap: { ...OCTOBER_RECAP, genre_mix: { ...OCTOBER_RECAP.genre_mix, previous: [] } },
  },
  render: GenreMix.render,
};

export const TopListsTabs: Story = {
  name: "Top lists, tabs",
  render: (args) =>
    chart(<RecapTopLists recap={args.recap} friendId={args.friendId} columns={false} />),
};

export const TopListsColumns: Story = {
  name: "Top lists, columns",
  render: (args) => <RecapTopLists recap={args.recap} friendId={args.friendId} columns />,
};

export const Heatmap: Story = {
  name: "When you listen",
  render: (args) => chart(<RecapHeatmap recap={args.recap} />),
};

export const HeatmapEmpty: Story = {
  name: "When you listen, no spins",
  args: { recap: EMPTY_RECAP },
  render: Heatmap.render,
};

export const BpmSpread: Story = {
  name: "BPM spread",
  render: (args) => chart(<RecapBpmSpread recap={args.recap} />),
};

export const BpmSpreadNoTempos: Story = {
  name: "BPM spread, no tempos",
  args: { recap: { ...OCTOBER_RECAP, bpm: EMPTY_RECAP.bpm } },
  render: BpmSpread.render,
};
