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
import { NewArrivals } from "./NewArrivals";

/**
 * The Home page at `/` (#881, epic #878). The summary is fetched once here and
 * each section gets its slice; every section loads and fails on its own, so
 * one failing never blanks the others.
 */
export default function HomePage() {
  const { friend, isHydrated } = useUsername();
  const friendId = friend?.id ?? 0;
  const enabled = isHydrated && friendId > 0;
  const { home, isPending, error } = useHomeQuery({ friend_id: friendId }, { enabled });
  const { setPaletteOpen } = useCommandPalette();

  return (
    <PageContainer>
      <HomeLayout
        header={<HomeHeader counts={home?.counts ?? null} onSearch={() => setPaletteOpen(true)} />}
        nowPlaying={<HomeNowPlaying />}
        newArrivals={
          <NewArrivals
            arrivals={home?.new_arrivals ?? null}
            friendId={friendId}
            loading={isPending}
            error={error?.message ?? null}
          />
        }
        month={<HomeMonthCard friendId={friendId} enabled={enabled} />}
        // TODO(#883): attention from home.attention.
        // TODO(#884): playlists from home.playlists.
      />
    </PageContainer>
  );
}
