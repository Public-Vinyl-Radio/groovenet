"use client";

import PlaylistsProvider from "@/providers/PlaylistsProvider";
import PlaylistManager from "@/components/PlaylistManager";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";

const PlaylistsPage = () => {
  return (
    <PageContainer size="standard">
      <PageHeader title="Playlists" />
      <PlaylistManager />
    </PageContainer>
  );
};

const SearchPageWrapper = () => {
  return (
    <PlaylistsProvider>
      <PlaylistsPage />
    </PlaylistsProvider>
  );
};
export default SearchPageWrapper;
