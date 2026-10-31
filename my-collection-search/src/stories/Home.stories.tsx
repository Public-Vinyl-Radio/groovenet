import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import HomeHeader from "@/components/home/HomeHeader";
import HomeLayout from "@/components/home/HomeLayout";
import { MonthCard } from "@/components/home/MonthCard";
import { NowPlayingCard, type NowPlayingCardProps } from "@/components/home/NowPlayingCard";
import { HOME_COUNTS } from "./fixtures/home";
import { OCTOBER_RECAP } from "./fixtures/spinRecap";

const noop = () => {};

const SERVER: NowPlayingCardProps = {
  medium: "digital",
  outputName: "Lounge",
  title: "Flaca",
  artist: "Andrés Calamaro",
  album: "Alta Suciedad",
  coverUrl: null,
  progress: { elapsed: 94, duration: 245 },
  transport: {
    isPlaying: true,
    canPrev: true,
    canNext: true,
    canPlay: true,
    onPrev: noop,
    onPlay: noop,
    onPause: noop,
    onNext: noop,
  },
  onOpen: noop,
};

const VINYL: NowPlayingCardProps = {
  medium: "vinyl",
  title: "Flaca",
  artist: "Andrés Calamaro",
  album: "Alta Suciedad",
  coverUrl: null,
  href: "/tracks/t1?friend_id=1",
};

const meta: Meta<typeof HomeLayout> = {
  title: "Home/Page",
  component: HomeLayout,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof HomeLayout>;

const page = (nowPlaying: React.ReactNode) => (
  <HomeLayout
    header={<HomeHeader counts={HOME_COUNTS} onSearch={noop} />}
    nowPlaying={nowPlaying}
    month={<MonthCard month="2026-10" recap={OCTOBER_RECAP} />}
  />
);

export const WithNowPlaying: Story = {
  name: "Page, a server player playing",
  parameters: { viewport: { defaultViewport: "desktop" } },
  render: () => page(<NowPlayingCard {...SERVER} />),
};

export const WithoutNowPlaying: Story = {
  name: "Page, nothing playing",
  render: () => page(null),
};

export const Phone: Story = {
  name: "Page, phone",
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => page(<NowPlayingCard {...SERVER} />),
};

export const NowPlayingServer: Story = {
  name: "Now playing, server player",
  render: () => <NowPlayingCard {...SERVER} />,
};

export const NowPlayingServerPaused: Story = {
  name: "Now playing, server player paused",
  render: () => (
    <NowPlayingCard {...SERVER} transport={{ ...SERVER.transport!, isPlaying: false }} />
  ),
};

export const NowPlayingVinyl: Story = {
  name: "Now playing, vinyl fallback",
  render: () => <NowPlayingCard {...VINYL} />,
};

export const Month: Story = {
  name: "Month card",
  render: () => <MonthCard month="2026-10" recap={OCTOBER_RECAP} />,
};

export const MonthLoading: Story = {
  name: "Month card, loading",
  render: () => <MonthCard month="2026-10" recap={null} />,
};

export const MonthError: Story = {
  name: "Month card, error",
  render: () => <MonthCard month="2026-10" recap={null} error="HTTP 500" />,
};
