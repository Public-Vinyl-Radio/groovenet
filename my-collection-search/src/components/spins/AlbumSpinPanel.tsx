"use client";

import React from "react";
import { Box, Button, Flex, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { MetaTag } from "@/components/ui/RoleTags";
import { FiClock, FiPlus } from "react-icons/fi";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ALBUM_SPINS_PAGE, useAlbumSpins } from "@/hooks/useAlbumSpins";
import { formatSpinCount, summarizeSpinStats } from "@/lib/albumStats";
import SpinFormDialog from "@/components/spins/SpinFormDialog";
import SpinRow from "@/components/spins/SpinRow";
import { formatTrackLine } from "@/components/spins/spinSummary";
import { useSpinTopTracksQuery } from "@/hooks/useSpinsQuery";

type Props = {
  releaseId: string;
  friendId: number;
  albumTitle: string;
};

export default function AlbumSpinPanel({ releaseId, friendId, albumTitle }: Props) {
  const [open, setOpen] = React.useState(false);

  const spinsQuery = useAlbumSpins(releaseId, friendId);
  const topTracksQuery = useSpinTopTracksQuery(
    { friend_id: friendId, release_id: releaseId, limit: 3, offset: 0 },
    { enabled: !!releaseId && !!friendId },
  );
  // Only worth a line once some track has been played more than once.
  const mostPlayed = topTracksQuery.topTracks.some((track) => track.play_count > 1)
    ? topTracksQuery.topTracks
    : [];

  return (
    <Stack gap={3}>
      <Box>
        <SectionHeading
          minH="36px"
          meta={
            spinsQuery.isLoading
              ? undefined
              : formatSpinCount(summarizeSpinStats(spinsQuery.spins, ALBUM_SPINS_PAGE))
          }
          actions={
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <FiPlus /> Log spin
            </Button>
          }
        >
          Vinyl spins
        </SectionHeading>
        <Text fontSize="sm" color="fg.muted" mt={1}>
          Detected automatically or logged by hand.
        </Text>
      </Box>

      {mostPlayed.length > 0 && (
        <HStack gap={1.5} wrap="wrap" fontSize="xs">
          <Text color="fg.muted">Most played:</Text>
          {mostPlayed.map((track) => (
            <MetaTag key={track.track_id} size="sm">
              {formatTrackLine({
                position: track.position_snapshot ?? null,
                title: track.title_snapshot,
              })}{" "}
              ×{track.play_count}
            </MetaTag>
          ))}
        </HStack>
      )}

      <Box borderWidth="outline" borderColor="border.ink" boxShadow="md" borderRadius="md">
        {spinsQuery.isLoading ? (
          <Flex justify="center" py={4}>
            <Spinner size="sm" />
          </Flex>
        ) : spinsQuery.spins.length === 0 ? (
          <Flex align="center" gap={2} px={3} py={2.5}>
            <FiClock size={13} />
            <Text fontSize="xs" color="fg.muted">
              No spins logged yet
            </Text>
          </Flex>
        ) : (
          <Stack gap={0}>
            {spinsQuery.spins.map((item) => (
              <SpinRow key={item.session.id} item={item} />
            ))}
          </Stack>
        )}
      </Box>

      <SpinFormDialog
        open={open}
        onOpenChange={setOpen}
        releaseId={releaseId}
        friendId={friendId}
        albumTitle={albumTitle}
      />
    </Stack>
  );
}
