"use client";

import React from "react";
import { Box } from "@chakra-ui/react";

import PlaylistViewer from "@/components/PlaylistViewer";
import PageContainer from "@/components/layout/PageContainer";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";

interface PlaylistPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// This is a server component by default. Add 'use client' at the top if you need client-side interactivity.
const PlaylistPage = ({ params }: PlaylistPageProps) => {
  const { id } = React.use(params);
  const { playlistLength } = usePlaybackPlayer();

  return (
    <PageContainer size="standard">
      <Box mb={playlistLength > 0 ? "120px" : "0"}>
        <PlaylistViewer playlistId={Number(id)} />
        {/* Future ideas:
            - Show playlist name, track count, total duration
            - Actions: play all, shuffle, export, edit name
            - Track list with drag reorder
         */}
      </Box>
    </PageContainer>
  );
};
export default PlaylistPage;
