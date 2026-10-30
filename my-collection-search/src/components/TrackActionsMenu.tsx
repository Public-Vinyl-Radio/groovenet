"use client";

import React, { useContext, useRef, useState } from "react";
import { Button, Menu, Portal, Box, Icon, Link } from "@chakra-ui/react";
import {
  FiCode,
  FiDownload,
  FiEdit,
  FiImage,
  FiMoreVertical,
  FiPlay,
  FiPlus,
  FiPlusSquare,
  FiTrash2,
  FiUpload,
  FiZap,
} from "react-icons/fi";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { TrackCardContext } from "@/components/trackCardContext";
import { useTracksQuery } from "@/hooks/useTracksQuery";
import { SiApplemusic, SiYoutube, SiSoundcloud } from "react-icons/si";
import NextLink from "next/link";

import type { Track } from "@/types/track";
import { menuDivider } from "@/components/ui/action-menu-primitives";
import ConfirmDialog from "@/components/records/ConfirmDialog";
import TrackActionsModal, { openInActions } from "@/components/TrackActionsModal";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import { useAddToPlaylistDialog } from "@/hooks/useAddToPlaylistDialog";
import { useEnrichmentStore } from "@/stores/enrichmentStore";
import { useUploadTrackAudioMutation } from "@/hooks/useUploadTrackAudioMutation";
import { analyzeTrackAsync, saveTrack, softDeleteTrack } from "@/services/internalApi/tracks";
import { queryKeys } from "@/lib/queryKeys";
import { useTrackStore } from "@/stores/trackStore";
import { cleanSoundcloudUrl } from "@/lib/url";
import { toaster } from "@/components/ui/toaster";
import { resolveTrackMenuState, type TrackAudioActions } from "@/components/trackActionsMenuState";
import { analytics } from "@/lib/analytics/client";
import type { TrackMenuAction } from "@/lib/analytics/events";

export type { TrackAudioActions };

type Props = {
  track: Track;
  onOpenTrackDebug?: () => void;
  /** Preview, restore or upload the cover art of the track's album (#494). */
  onChangeArtwork?: () => void;
  /** Hide the "Edit Track" item (e.g. when already on the edit page). */
  hideEdit?: boolean;
  /** Override the audio actions (used by the edit form). */
  audioActions?: TrackAudioActions;
  /** Told when the track is played, queued or added to a playlist. */
  onAction?: (action: TrackMenuAction) => void;
  /** A full 44px borderless trigger on phones too (the track page header), not the compact one. */
  prominent?: boolean;
  /**
   * The menu on a track card: a 32px outline trigger on desktop and a bare 44px
   * touch target on phones, whose sheet also holds the star rating (the card
   * has no hover to reveal it there). Defaults to true inside a card's action slot.
   */
  compact?: boolean;
};

export default function TrackActionsMenu({
  track,
  onOpenTrackDebug,
  onChangeArtwork,
  hideEdit,
  audioActions,
  onAction,
  prominent = false,
  compact: compactProp,
}: Props) {
  const inCard = useContext(TrackCardContext);
  const compact = compactProp ?? inCard;
  const { saveTrack: saveTrackRating } = useTracksQuery();
  const [rating, setRating] = useState(track.star_rating ?? 0);
  React.useEffect(() => setRating(track.star_rating ?? 0), [track.star_rating]);
  const { appendToQueue, replacePlaylist } = usePlaybackPlayer();
  const playTrack = () => {
    replacePlaylist([track], { autoplay: true, startIndex: 0 });
    onAction?.("played");
  };
  const queueTrack = () => {
    appendToQueue(track);
    onAction?.("queued");
  };
  const editHref = `/tracks/${encodeURIComponent(track.track_id)}/edit?friend_id=${track.friend_id}`;
  const { openForTrack, playlistDialog, nameDialog } = useAddToPlaylistDialog({
    onAdded: () => onAction?.("added_to_playlist"),
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const setEnrichmentQueue = useEnrichmentStore((s) => s.setQueue);
  const uploadMutation = useUploadTrackAudioMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [removeAudioConfirmOpen, setRemoveAudioConfirmOpen] = useState(false);
  const [defaultFetchLoading, setDefaultFetchLoading] = useState(false);
  const [defaultUploadLoading, setDefaultUploadLoading] = useState(false);
  const [defaultRemoveLoading, setDefaultRemoveLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const refreshTrack = () => {
    if (track.friend_id != null) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.trackById(track.track_id, track.friend_id),
      });
    }
    queryClient.invalidateQueries({ queryKey: ["tracks"] });
  };

  const handleEnrich = () => {
    if (track.friend_id == null) {
      toaster.create({ title: "Track missing friend_id", type: "error" });
      return;
    }
    setEnrichmentQueue([{ trackId: track.track_id, friendId: track.friend_id }]);
    router.push("/enrich");
  };

  const handleDeleteConfirm = async () => {
    if (!track.friend_id) {
      toaster.create({ title: "Track missing friend_id", type: "error" });
      throw new Error("Track missing friend_id");
    }
    setDeleteLoading(true);
    try {
      await softDeleteTrack({ track_id: track.track_id, friend_id: track.friend_id });
      toaster.create({ title: "Track deleted", type: "success" });
      queryClient.invalidateQueries({ queryKey: ["tracks"] });
    } catch (err) {
      toaster.create({
        title: "Failed to delete track",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
      throw err;
    } finally {
      setDeleteLoading(false);
    }
  };

  // --- Default audio handlers (used when no `audioActions` override) ---

  const defaultFetchAudio = async () => {
    if (!track.friend_id) {
      toaster.create({ title: "Track missing friend_id", type: "error" });
      return;
    }
    setDefaultFetchLoading(true);
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
      analytics.track("audio_fetch_queued", {
        track_id: track.track_id,
        has_apple_music: !!track.apple_music_url,
        has_youtube: !!track.youtube_url,
        has_soundcloud: !!track.soundcloud_url,
      });
    } catch (err) {
      toaster.create({
        title: "Failed to queue audio fetch",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setDefaultFetchLoading(false);
    }
  };

  const defaultUploadFile = async (file: File) => {
    setDefaultUploadLoading(true);
    try {
      const result = await uploadMutation.mutateAsync({
        file,
        track_id: track.track_id,
        friend_id: track.friend_id,
      });
      const analysis = result.analysis;
      const uploadedUrl =
        typeof result.local_audio_url === "string" ? result.local_audio_url : track.local_audio_url;
      if (track.friend_id != null) {
        useTrackStore.getState().updateTrack(track.track_id, track.friend_id, {
          local_audio_url: uploadedUrl,
          bpm:
            typeof analysis.rhythm?.bpm === "number"
              ? String(Math.round(analysis.rhythm.bpm))
              : track.bpm,
          key:
            analysis.tonal?.key_edma?.key && analysis.tonal?.key_edma?.scale
              ? `${analysis.tonal.key_edma.key} ${analysis.tonal.key_edma.scale}`
              : track.key,
        });
      }
      refreshTrack();
      toaster.create({
        title: "Upload Successful",
        description: "Audio file uploaded and analyzed",
        type: "success",
      });
    } catch (err) {
      toaster.create({
        title: "Upload Failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setDefaultUploadLoading(false);
    }
  };

  const defaultRemoveAudio = async () => {
    if (!track.friend_id) {
      toaster.create({ title: "Track missing friend_id", type: "error" });
      return;
    }
    setDefaultRemoveLoading(true);
    try {
      await saveTrack({
        track_id: track.track_id,
        friend_id: track.friend_id,
        local_audio_url: null,
      });
      useTrackStore.getState().updateTrack(track.track_id, track.friend_id, {
        local_audio_url: undefined,
      });
      refreshTrack();
      toaster.create({
        title: "Audio Removed",
        description: "Local audio file has been removed",
        type: "success",
      });
    } catch (err) {
      toaster.create({
        title: "Remove Audio Failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
      throw err;
    } finally {
      setDefaultRemoveLoading(false);
    }
  };

  // --- Resolved menu state + audio actions (override or default) ---

  const {
    hasAudio,
    hasStreamingLinks,
    fetchAudioLoading,
    fetchAudioDisabled,
    uploadLoading,
    removeAudioLoading,
  } = resolveTrackMenuState(track, {
    hideEdit,
    hasTrackDebug: Boolean(onOpenTrackDebug),
    audioActions,
    defaultFetchLoading,
    defaultUploadLoading,
    defaultRemoveLoading,
  });

  const fetchAudio = audioActions?.onFetchAudio ?? defaultFetchAudio;
  const uploadFile = audioActions?.onUploadFile ?? defaultUploadFile;
  const removeAudio = audioActions?.onRemoveAudio ?? defaultRemoveAudio;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      {/* Phone: centred modal (#735) */}
      <Box display={{ base: "block", md: "none" }}>
        <Button
          variant="ghost"
          size="sm"
          px={2}
          {...(prominent ? { boxSize: "44px" } : {})}
          {...(compact ? { boxSize: "44px", minW: "44px", px: 0 } : {})}
          onClick={() => setModalOpen(true)}
          aria-label="Track actions"
        >
          <FiMoreVertical />
        </Button>
        <TrackActionsModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          track={track}
          onPlay={hasAudio ? playTrack : undefined}
          onQueue={queueTrack}
          onPlaylist={() => openForTrack(track)}
          rating={
            compact
              ? {
                  value: rating,
                  onChange: (value) => {
                    setRating(value);
                    void saveTrackRating({
                      track_id: track.track_id,
                      friend_id: track.friend_id,
                      star_rating: value,
                    });
                  },
                }
              : undefined
          }
          library={[
            ...(hideEdit ? [] : [{ label: "Edit track", href: editHref }]),
            { label: "Enrich track", onClick: handleEnrich },
            ...(onChangeArtwork ? [{ label: "Cover art...", onClick: onChangeArtwork }] : []),
            ...(onOpenTrackDebug ? [{ label: "Track debug", onClick: onOpenTrackDebug }] : []),
          ]}
          audio={[
            ...(hasStreamingLinks
              ? [
                  {
                    label: fetchAudioLoading ? "Fetching audio..." : "Fetch audio",
                    disabled: fetchAudioLoading || fetchAudioDisabled,
                    onClick: () => void fetchAudio(),
                  },
                ]
              : []),
            {
              label: uploadLoading ? "Uploading..." : "Upload audio",
              disabled: uploadLoading,
              onClick: handleUploadClick,
            },
          ]}
          openIn={openInActions(track)}
          danger={[
            ...(hasAudio
              ? [
                  {
                    label: removeAudioLoading ? "Removing..." : "Remove audio",
                    disabled: removeAudioLoading,
                    onClick: () => setRemoveAudioConfirmOpen(true),
                  },
                ]
              : []),
            { label: "Delete track", onClick: () => setDeleteConfirmOpen(true) },
          ]}
        />
      </Box>

      {/* Desktop: dropdown menu */}
      <Box display={{ base: "none", md: "block" }}>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button
              variant="outline"
              size={compact ? "xs" : "sm"}
              px={2}
              aria-label="Track actions"
              {...(compact ? { boxSize: "32px", minW: "32px", px: 0 } : {})}
            >
              <FiMoreVertical />
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                {/* Primary */}
                {hasAudio && (
                  <Menu.Item onSelect={playTrack} value="play">
                    <FiPlay /> Play
                  </Menu.Item>
                )}
                <Menu.Item onSelect={queueTrack} value="queue">
                  <FiPlusSquare /> Add to Queue
                </Menu.Item>
                <Menu.Item onSelect={() => openForTrack(track)} value="add">
                  <FiPlus /> Add to Playlist
                </Menu.Item>
                {!hideEdit && (
                  <Menu.Item value="edit" asChild>
                    <NextLink href={editHref}>
                      <FiEdit /> Edit Track
                    </NextLink>
                  </Menu.Item>
                )}
                <Menu.Item onSelect={handleEnrich} value="enrich">
                  <FiZap /> Enrich Track
                </Menu.Item>
                {onChangeArtwork && (
                  <Menu.Item onSelect={onChangeArtwork} value="cover-art">
                    <FiImage /> Cover Art...
                  </Menu.Item>
                )}
                {onOpenTrackDebug && (
                  <Menu.Item onSelect={onOpenTrackDebug} value="track-debug">
                    <FiCode /> Track Debug
                  </Menu.Item>
                )}
                {/* Audio management */}
                {menuDivider}
                {hasStreamingLinks && (
                  <Menu.Item
                    onSelect={() => {
                      void fetchAudio();
                    }}
                    value="fetch-audio"
                    disabled={fetchAudioLoading || fetchAudioDisabled}
                  >
                    <FiDownload />
                    {fetchAudioLoading ? "Fetching Audio..." : "Fetch Audio"}
                  </Menu.Item>
                )}
                <Menu.Item
                  onSelect={handleUploadClick}
                  value="upload-audio"
                  disabled={uploadLoading}
                >
                  <FiUpload />
                  {uploadLoading ? "Uploading..." : "Upload Audio"}
                </Menu.Item>
                {/* Destructive: kept adjacent */}
                {menuDivider}
                {hasAudio && (
                  <Menu.Item
                    onSelect={() => setRemoveAudioConfirmOpen(true)}
                    value="remove-audio"
                    color="fg.error"
                    disabled={removeAudioLoading}
                  >
                    <FiTrash2 />
                    {removeAudioLoading ? "Removing..." : "Remove Audio"}
                  </Menu.Item>
                )}
                <Menu.Item
                  onSelect={() => setDeleteConfirmOpen(true)}
                  value="delete"
                  color="fg.error"
                >
                  <FiTrash2 /> Delete Track
                </Menu.Item>
                {/* External links */}
                {hasStreamingLinks && (
                  <>
                    {menuDivider}
                    {track.apple_music_url && (
                      <Menu.Item value="apple" asChild>
                        <Link
                          href={track.apple_music_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon as={SiApplemusic} /> Apple Music
                        </Link>
                      </Menu.Item>
                    )}
                    {track.youtube_url && (
                      <Menu.Item value="youtube" asChild>
                        <Link href={track.youtube_url} target="_blank" rel="noopener noreferrer">
                          <Icon as={SiYoutube} /> YouTube
                        </Link>
                      </Menu.Item>
                    )}
                    {track.soundcloud_url && (
                      <Menu.Item value="soundcloud" asChild>
                        <Link href={track.soundcloud_url} target="_blank" rel="noopener noreferrer">
                          <Icon as={SiSoundcloud} /> SoundCloud
                        </Link>
                      </Menu.Item>
                    )}
                  </>
                )}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Box>

      {/* Hidden file input for Upload Audio */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
          e.target.value = "";
        }}
        disabled={uploadLoading}
      />

      {playlistDialog}
      {nameDialog}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete track"
        body={
          <>
            Delete <strong>{track.title}</strong> by {track.artist}? It is soft-deleted and
            won&apos;t be re-imported from Discogs.
          </>
        }
        confirmLabel="Delete track"
        onConfirm={handleDeleteConfirm}
        pending={deleteLoading}
      />

      <ConfirmDialog
        open={removeAudioConfirmOpen}
        onOpenChange={setRemoveAudioConfirmOpen}
        title="Remove audio"
        body="Remove the local audio file? This can't be undone."
        confirmLabel="Remove audio"
        onConfirm={async () => {
          await Promise.resolve(removeAudio());
        }}
        pending={removeAudioLoading}
      />
    </>
  );
}
