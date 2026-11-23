"use client";

import React from "react";
import PageContainer from "@/components/layout/PageContainer";
import { useHomeQuery } from "@/hooks/useHomeQuery";
import { useCommandPalette } from "@/providers/CommandPaletteProvider";
import { useUsername } from "@/providers/UsernameProvider";
import EmptyLibrary from "@/components/onboarding/EmptyLibrary";
import FirstImportChecklist from "@/components/onboarding/FirstImportChecklist";
import { useLibraryEmpty } from "@/hooks/useLibraryEmpty";
import HomeHeader from "./HomeHeader";
import HomeLayout from "./HomeLayout";
import HomeMonthCard from "./MonthCard";
import HomeNowPlaying from "./HomeNowPlaying";
import NeedsAttention from "./NeedsAttention";
import { NewArrivals } from "./NewArrivals";
import { PlaylistsSection } from "./PlaylistsSection";

/**
 * The Home page at `/` (#881, epic #878). The summary is fetched once here and
 * each section gets its slice; every section loads and fails on its own, so
 * one failing never blanks the others.
 */
export default function HomePage() {
  const { friend, isHydrated } = useUsername();
  const friendId = friend?.id ?? 0;
  const emptiness = useLibraryEmpty();
  const enabled = isHydrated && friendId > 0 && emptiness !== "empty";
  const { home, isPending, error } = useHomeQuery({ friend_id: friendId }, { enabled });
  const { setPaletteOpen } = useCommandPalette();

  // No library yet, or one with nothing in it (#1246): the header and one way forward, no
  // grey placeholders, dashes or sections that would never fill.
  if (emptiness === "empty") {
    return (
      <PageContainer>
        <HomeHeader counts={null} onSearch={() => setPaletteOpen(true)} />
        <EmptyLibrary />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <HomeLayout
        checklist={<FirstImportChecklist />}
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
        attention={<NeedsAttention attention={home?.attention ?? null} error={error?.message} />}
        playlists={
          <PlaylistsSection
            playlists={home?.playlists ?? null}
            loading={isPending}
            error={error?.message ?? null}
          />
        }
      />
    </PageContainer>
  );
}
