import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import HomeHeader from "@/components/home/HomeHeader";
import HomeLayout from "@/components/home/HomeLayout";
import { NewArrivals } from "@/components/home/NewArrivals";
import { PlaylistsSection } from "@/components/home/PlaylistsSection";
import { MonthCard } from "@/components/home/MonthCard";
import { NowPlayingCard, type NowPlayingCardProps } from "@/components/home/NowPlayingCard";
import { FIXTURE_NOW, HOME_ARRIVALS, HOME_COUNTS, HOME_PLAYLISTS } from "./fixtures/home";
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
    newArrivals={<NewArrivals arrivals={HOME_ARRIVALS} friendId={1} now={new Date(FIXTURE_NOW)} />}
    month={<MonthCard month="2026-10" recap={OCTOBER_RECAP} />}
    playlists={<PlaylistsSection playlists={HOME_PLAYLISTS} now={new Date(FIXTURE_NOW)} />}
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

const NOW = new Date(FIXTURE_NOW);

export const Arrivals: Story = {
  name: "New arrivals, mixed rated and unrated",
  render: () => (
    <NewArrivals
      friendId={1}
      now={NOW}
      arrivals={{
        ...HOME_ARRIVALS,
        // One cover missing, as for an album Discogs has no image for.
        items: HOME_ARRIVALS.items.map((item, i) =>
          i === 0 ? { ...item, thumbnail: null } : { ...item, thumbnail: "/apple-touch-icon.png" },
        ),
      }}
    />
  ),
};

export const ArrivalsPhone: Story = {
  name: "New arrivals, phone",
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <NewArrivals friendId={1} now={NOW} arrivals={HOME_ARRIVALS} />,
};

export const ArrivalsEmpty: Story = {
  name: "New arrivals, empty",
  render: () => (
    <NewArrivals friendId={1} arrivals={{ window_days: 30, unrated_count: 0, items: [] }} />
  ),
};

export const ArrivalsLoading: Story = {
  name: "New arrivals, loading",
  render: () => <NewArrivals friendId={1} arrivals={null} loading />,
};

export const ArrivalsError: Story = {
  name: "New arrivals, error",
  render: () => <NewArrivals friendId={1} arrivals={null} error="HTTP 500" />,
};

export const Playlists: Story = {
  name: "Playlists & sets",
  render: () => <PlaylistsSection now={NOW} playlists={HOME_PLAYLISTS} />,
};

export const PlaylistsPhone: Story = {
  name: "Playlists & sets, phone",
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <PlaylistsSection now={NOW} playlists={HOME_PLAYLISTS} />,
};

export const PlaylistsNoVenue: Story = {
  name: "Playlists & sets, draft without a venue",
  render: () => (
    <PlaylistsSection
      now={NOW}
      playlists={{
        ...HOME_PLAYLISTS,
        draft_set: { ...HOME_PLAYLISTS.draft_set!, location_name: null },
      }}
    />
  ),
};

export const PlaylistsNoDraft: Story = {
  name: "Playlists & sets, no draft",
  render: () => <PlaylistsSection now={NOW} playlists={{ ...HOME_PLAYLISTS, draft_set: null }} />,
};

export const PlaylistsEmpty: Story = {
  name: "Playlists & sets, empty",
  render: () => <PlaylistsSection playlists={{ draft_set: null, recent: [] }} />,
};

export const PlaylistsLoading: Story = {
  name: "Playlists & sets, loading",
  render: () => <PlaylistsSection playlists={null} loading />,
};

export const PlaylistsError: Story = {
  name: "Playlists & sets, error",
  render: () => <PlaylistsSection playlists={null} error="HTTP 500" />,
};
