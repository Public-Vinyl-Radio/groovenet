"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Button, Flex, Menu, Text } from "@chakra-ui/react";
import { SourceTag } from "@/components/ui/RoleTags";
import TrackResultStore from "@/components/TrackResultStore";
import type { Track } from "@/types/track";
import { FiEdit, FiMoreVertical, FiPlus, FiPlusSquare } from "react-icons/fi";
import { useRecommendationsQuery, type RecommendedTrack } from "@/hooks/useRecommendations";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import { useSuggestionScope } from "@/hooks/useSuggestionScope";
import SuggestionScopeToggle from "@/components/SuggestionScopeToggle";

export interface PlaylistRecommendationsProps {
  playlist: Track[];
  limit?: number;
  onAddToPlaylist: (track: Track) => void;
}

export default function PlaylistRecommendations({
  playlist,
  limit = 50,
  onAddToPlaylist,
}: PlaylistRecommendationsProps) {
  const { scope, libraryFriendId, ready, setScope } = useSuggestionScope();
  const { data: recs = [], isLoading } = useRecommendationsQuery(playlist, limit, {
    scope,
    libraryFriendId,
    enabled: ready,
  });
  const { appendToQueue } = usePlaybackPlayer();

  return (
    <Box mt={0}>
      <Flex justify="flex-end" mb={3}>
        <SuggestionScopeToggle value={scope} onChange={setScope} />
      </Flex>
      {!ready || isLoading ? null : recs.length === 0 ? (
        <Text color="fg.muted" fontSize="sm">
          {scope === "library"
            ? "No suggestions in this library. Try All libraries."
            : "No suggestions found."}
        </Text>
      ) : null}
      <Box display="flex" flexDirection="column" gap={2}>
        {recs.map((rec: RecommendedTrack, i: number) => (
          <TrackResultStore
            key={`recommendation-${rec.track_id}-${i}`}
            trackId={rec.track_id}
            friendId={rec.friend_id}
            fallbackTrack={rec}
            buttons={[
              <Flex key="badges-menu" align="center" gap={1} wrap="wrap">
                {rec._simIdentity != null && rec._simAudio != null && (
                  <SourceTag stroke="double" size="sm">
                    Identity + Vibe
                  </SourceTag>
                )}
                {rec._simIdentity != null && rec._simAudio == null && (
                  <SourceTag stroke="solid" size="sm">
                    Identity
                  </SourceTag>
                )}
                {rec._simAudio != null && rec._simIdentity == null && (
                  <SourceTag stroke="dashed" size="sm">
                    Vibe
                  </SourceTag>
                )}
                <Menu.Root>
                  <Menu.Trigger asChild>
                    <Button variant="plain" size={["xs", "sm", "sm"]}>
                      <FiMoreVertical />
                    </Button>
                  </Menu.Trigger>
                  <Menu.Positioner>
                    <Menu.Content>
                      <Menu.Item onSelect={() => onAddToPlaylist(rec)} value="add">
                        <FiPlus /> Add to Playlist
                      </Menu.Item>
                      <Menu.Item value="edit" asChild>
                        <NextLink
                          href={`/tracks/${encodeURIComponent(rec.track_id)}/edit?friend_id=${rec.friend_id}`}
                        >
                          <FiEdit /> Edit Track
                        </NextLink>
                      </Menu.Item>
                      <Menu.Item onSelect={() => appendToQueue(rec)} value="queue">
                        <FiPlusSquare /> Add to Queue
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Positioner>
                </Menu.Root>
              </Flex>,
            ]}
          />
        ))}
      </Box>
    </Box>
  );
}
