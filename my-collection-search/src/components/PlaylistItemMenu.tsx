"use client";

import React, { useState } from "react";
import NextLink from "next/link";
import { Box, Button, Menu } from "@chakra-ui/react";
import {
  FiArrowDown,
  FiArrowUp,
  FiDownload,
  FiEdit,
  FiMoreVertical,
  FiPlus,
  FiTrash,
  FiZap,
} from "react-icons/fi";
import type { Track } from "@/types/track";
import { menuDivider } from "@/components/ui/action-menu-primitives";
import PlaylistTrackActionsModal from "@/components/PlaylistTrackActionsModal";
import { useAddToPlaylistDialog } from "@/hooks/useAddToPlaylistDialog";
import { analyzeTrackAsync } from "@/services/internalApi/tracks";
import { cleanSoundcloudUrl } from "@/lib/url";
import { toaster } from "@/components/ui/toaster";

export interface PlaylistItemMenuProps {
  idx: number;
  total: number;
  track: Track;
  moveTrack: (fromIdx: number, toIdx: number) => void;
  /** Opens the Suggestions panel seeded with this track. */
  onSuggestAfter?: (track: Track) => void;
  removeFromPlaylist: (indexToRemove: number) => void;
  size?: "xs" | "sm" | "md" | "lg";
}

export const PlaylistItemMenu: React.FC<PlaylistItemMenuProps> = ({
  idx,
  total,
  track,
  moveTrack,
  onSuggestAfter,
  removeFromPlaylist,
  size = "xs",
}) => {
  const { openForTrack, playlistDialog } = useAddToPlaylistDialog();
  const isFirst = idx === 0;
  const isLast = idx === total - 1;

  const [modalOpen, setModalOpen] = useState(false);
  const [fetchAudioLoading, setFetchAudioLoading] = useState(false);

  const canFetchAudio =
    !track.local_audio_url &&
    Boolean(track.apple_music_url || track.youtube_url || track.soundcloud_url);

  const editHref = `/tracks/${encodeURIComponent(track.track_id)}/edit?friend_id=${track.friend_id}`;

  const suggestAfter = onSuggestAfter ? () => onSuggestAfter(track) : undefined;

  const handleFetchAudio = async () => {
    if (!track.friend_id) {
      toaster.create({ title: "Track missing friend_id", type: "error" });
      return;
    }
    setFetchAudioLoading(true);
    try {
      const response = await analyzeTrackAsync({
        track_id: track.track_id,
        friend_id: track.friend_id,
        apple_music_url: track.apple_music_url,
        youtube_url: track.youtube_url,
        soundcloud_url: cleanSoundcloudUrl(track.soundcloud_url),
        title: track.title,
        artist: track.artist,
      });
      toaster.create({
        title: "Audio Fetch Queued",
        description: `Job ID: ${response.jobId}`,
        type: "success",
      });
    } catch (err) {
      toaster.create({
        title: "Failed to queue audio fetch",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setFetchAudioLoading(false);
    }
  };

  return (
    <>
      {/* Phone: centred modal (#751) */}
      <Box display={{ base: "block", md: "none" }}>
        <Button
          variant="plain"
          size={size}
          boxSize="44px"
          minW="44px"
          aria-label="Track actions"
          onClick={() => setModalOpen(true)}
        >
          <FiMoreVertical size={16} />
        </Button>
        <PlaylistTrackActionsModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          track={track}
          index={idx}
          total={total}
          onMove={(to) => moveTrack(idx, to)}
          trackActions={[
            { label: "Edit", href: editHref },
            { label: "Add to playlist", onClick: () => openForTrack(track) },
            ...(canFetchAudio
              ? [
                  {
                    label: fetchAudioLoading ? "Fetching audio..." : "Fetch audio",
                    disabled: fetchAudioLoading,
                    onClick: () => void handleFetchAudio(),
                  },
                ]
              : []),
          ]}
          discover={
            suggestAfter ? [{ label: "Suggest after this track", onClick: suggestAfter }] : []
          }
          danger={[{ label: "Remove from playlist", onClick: () => removeFromPlaylist(idx) }]}
        />
      </Box>

      {/* Desktop: dropdown menu */}
      <Box display={{ base: "none", md: "block" }}>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button variant="plain" size={size} aria-label="Track actions">
              <FiMoreVertical size={16} />
            </Button>
          </Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content>
              <Menu.Item onSelect={() => moveTrack(idx, idx - 1)} value="up" disabled={isFirst}>
                <FiArrowUp /> Move Up
              </Menu.Item>
              <Menu.Item onSelect={() => moveTrack(idx, idx + 1)} value="down" disabled={isLast}>
                <FiArrowDown /> Move Down
              </Menu.Item>
              <Menu.Item value="edit" asChild>
                <NextLink href={editHref}>
                  <FiEdit /> Edit
                </NextLink>
              </Menu.Item>
              <Menu.Item onSelect={() => openForTrack(track)} value="add">
                <FiPlus /> Add to Playlist
              </Menu.Item>
              {canFetchAudio && (
                <Menu.Item
                  onSelect={handleFetchAudio}
                  value="fetch-audio"
                  disabled={fetchAudioLoading}
                >
                  <FiDownload /> {fetchAudioLoading ? "Fetching Audio..." : "Fetch Audio"}
                </Menu.Item>
              )}
              {suggestAfter && (
                <Menu.Item onSelect={suggestAfter} value="suggest-after">
                  <FiZap /> Suggest after this track
                </Menu.Item>
              )}
              {menuDivider}
              <Menu.Item
                onSelect={() => removeFromPlaylist(idx)}
                value="delete"
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <FiTrash /> Remove
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>
      </Box>

      {playlistDialog}
    </>
  );
};

export default PlaylistItemMenu;
