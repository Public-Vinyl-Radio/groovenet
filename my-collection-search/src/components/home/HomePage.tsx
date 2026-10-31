"use client";

import React from "react";
import PageContainer from "@/components/layout/PageContainer";
import { useHomeQuery } from "@/hooks/useHomeQuery";
import { useCommandPalette } from "@/providers/CommandPaletteProvider";
import { useUsername } from "@/providers/UsernameProvider";
import HomeHeader from "./HomeHeader";
import HomeLayout from "./HomeLayout";
import HomeMonthCard from "./MonthCard";
import HomeNowPlaying from "./HomeNowPlaying";
import NeedsAttention from "./NeedsAttention";

/**
 * The Home page at `/` (#881, epic #878). The summary is fetched once here and
 * each section gets its slice; every section loads and fails on its own, so
 * one failing never blanks the others.
 */
export default function HomePage() {
  const { friend, isHydrated } = useUsername();
  const friendId = friend?.id ?? 0;
  const enabled = isHydrated && friendId > 0;
  const { home, error } = useHomeQuery({ friend_id: friendId }, { enabled });
  const { setPaletteOpen } = useCommandPalette();

  return (
    <PageContainer>
      <HomeLayout
        header={<HomeHeader counts={home?.counts ?? null} onSearch={() => setPaletteOpen(true)} />}
        nowPlaying={<HomeNowPlaying />}
        // TODO(#882): newArrivals from home.new_arrivals.
        month={<HomeMonthCard friendId={friendId} enabled={enabled} />}
        attention={<NeedsAttention attention={home?.attention ?? null} error={error?.message} />}
        // TODO(#884): playlists from home.playlists.
      />
    </PageContainer>
  );
}
