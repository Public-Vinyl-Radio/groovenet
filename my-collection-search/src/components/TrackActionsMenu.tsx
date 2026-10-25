"use client";

import React, { useContext, useRef, useState } from "react";
import {
  Button,
  Menu,
  Portal,
  Dialog,
  Drawer,
  Box,
  Icon,
  Link,
  Stack,
  CloseButton,
  Text,
} from "@chakra-ui/react";
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
import { RatingStars } from "@/components/TrackResult";
import { useTracksQuery } from "@/hooks/useTracksQuery";
import { SiApplemusic, SiYoutube, SiSoundcloud } from "react-icons/si";
import NextLink from "next/link";

import type { Track } from "@/types/track";
import { menuDivider, drawerDivider, DrawerItem } from "@/components/ui/action-menu-primitives";
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
  /** A full-size outlined trigger on phones too (the track page header), not the compact ghost one. */
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
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      return;
    }
    setDeleteLoading(true);
    try {
      await softDeleteTrack({ track_id: track.track_id, friend_id: track.friend_id });
      setDeleteConfirmOpen(false);
      toaster.create({ title: "Track deleted", type: "success" });
      queryClient.invalidateQueries({ queryKey: ["tracks"] });
    } catch (err) {
      toaster.create({
        title: "Failed to delete track",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
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
        typeof result.local_audio_url === "string"
          ? result.local_audio_url
          : track.local_audio_url;
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

  const handleRemoveAudioConfirm = async () => {
    try {
      await Promise.resolve(removeAudio());
      setRemoveAudioConfirmOpen(false);
    } catch {
      // errors are surfaced via toaster in the handler
    }
  };

  return (
    <>
      {/* Mobile: bottom sheet */}
      <Box display={{ base: "block", md: "none" }}>
        <Button
          variant={prominent ? "outline" : "ghost"}
          size="sm"
          px={2}
          {...(prominent ? { boxSize: "44px" } : {})}
          {...(compact ? { boxSize: "44px", minW: "44px", px: 0 } : {})}
          onClick={() => setDrawerOpen(true)}
          aria-label="Track actions"
        >
          <FiMoreVertical />
        </Button>
        <Drawer.Root placement="bottom" open={drawerOpen} onOpenChange={(d) => setDrawerOpen(d.open)}>
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content borderTopRadius="xl" maxH="80vh">
                <Drawer.Header borderBottomWidth="1px" py={3} px={5} position="relative">
                  <Box pr={8}>
                    <Text fontSize="xs" color="fg.muted">{track.artist}</Text>
                    <Text fontWeight="semibold" fontSize="sm" lineClamp={1}>{track.title}</Text>
                  </Box>
                  <Drawer.CloseTrigger asChild>
                    <CloseButton size="sm" position="absolute" right={3} top="50%" transform="translateY(-50%)" />
                  </Drawer.CloseTrigger>
                </Drawer.Header>
                <Drawer.Body p={0} overflowY="auto">
                  <Stack gap={0}>
                    {/* Primary */}
                    {hasAudio && (
                      <DrawerItem
                        icon={<FiPlay />}
                        label="Play"
                        onClick={() => { playTrack(); setDrawerOpen(false); }}
                      />
                    )}
                    <DrawerItem
                      icon={<FiPlusSquare />}
                      label="Add to Queue"
                      onClick={() => { queueTrack(); setDrawerOpen(false); }}
                    />
                    <DrawerItem
                      icon={<FiPlus />}
                      label="Add to Playlist"
                      onClick={() => { openForTrack(track); setDrawerOpen(false); }}
                    />
                    {compact && (
                      <Box
                        px={5}
                        py={3}
                        display="flex"
                        alignItems="center"
                        justifyContent="space-between"
                        css={{ "& .track-result-rating": { opacity: 1 } }}
                      >
                        <Text fontSize="sm">Rating</Text>
                        <RatingStars
                          size="sm"
                          value={rating}
                          onChange={(value) => {
                            setRating(value);
                            void saveTrackRating({
                              track_id: track.track_id,
                              friend_id: track.friend_id,
                              star_rating: value,
                            });
                          }}
                        />
                      </Box>
                    )}
                    {!hideEdit && (
                      <DrawerItem icon={<FiEdit />} label="Edit Track" href={editHref} />
                    )}
                    <DrawerItem
                      icon={<FiZap />}
                      label="Enrich Track"
                      onClick={() => { handleEnrich(); setDrawerOpen(false); }}
                    />
                    {onChangeArtwork && (
                      <DrawerItem
                        icon={<FiImage />}
                        label="Cover Art..."
                        onClick={() => {
                          onChangeArtwork();
                          setDrawerOpen(false);
                        }}
                      />
                    )}
                    {onOpenTrackDebug && (
                      <DrawerItem
                        icon={<FiCode />}
                        label="Track Debug"
                        onClick={() => {
                          onOpenTrackDebug();
                          setDrawerOpen(false);
                        }}
                      />
                    )}
                    {/* Audio management */}
                    {drawerDivider}
                    {hasStreamingLinks && (
                      <DrawerItem
                        icon={<FiDownload />}
                        label={fetchAudioLoading ? "Fetching Audio..." : "Fetch Audio"}
                        disabled={fetchAudioLoading || fetchAudioDisabled}
                        onClick={() => { void fetchAudio(); setDrawerOpen(false); }}
                      />
                    )}
                    <DrawerItem
                      icon={<FiUpload />}
                      label={uploadLoading ? "Uploading..." : "Upload Audio"}
                      disabled={uploadLoading}
                      onClick={() => { handleUploadClick(); setDrawerOpen(false); }}
                    />
                    {/* Destructive: kept adjacent */}
                    {drawerDivider}
                    {hasAudio && (
                      <DrawerItem
                        icon={<FiTrash2 />}
                        label={removeAudioLoading ? "Removing..." : "Remove Audio"}
                        color="fg.error"
                        disabled={removeAudioLoading}
                        onClick={() => { setRemoveAudioConfirmOpen(true); setDrawerOpen(false); }}
                      />
                    )}
                    <DrawerItem
                      icon={<FiTrash2 />}
                      label="Delete Track"
                      color="fg.error"
                      onClick={() => { setDeleteConfirmOpen(true); setDrawerOpen(false); }}
                    />
                    {/* External links */}
                    {hasStreamingLinks && (
                      <>
                        {drawerDivider}
                        {track.apple_music_url && (
                          <DrawerItem icon={<Icon as={SiApplemusic} />} label="Apple Music" href={track.apple_music_url} external />
                        )}
                        {track.youtube_url && (
                          <DrawerItem icon={<Icon as={SiYoutube} />} label="YouTube" href={track.youtube_url} external />
                        )}
                        {track.soundcloud_url && (
                          <DrawerItem icon={<Icon as={SiSoundcloud} />} label="SoundCloud" href={track.soundcloud_url} external />
                        )}
                      </>
                    )}
                  </Stack>
                </Drawer.Body>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
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
                    onSelect={() => { void fetchAudio(); }}
                    value="fetch-audio"
                    disabled={fetchAudioLoading || fetchAudioDisabled}
                  >
                    <FiDownload />
                    {fetchAudioLoading ? "Fetching Audio..." : "Fetch Audio"}
                  </Menu.Item>
                )}
                <Menu.Item onSelect={handleUploadClick} value="upload-audio" disabled={uploadLoading}>
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
                <Menu.Item onSelect={() => setDeleteConfirmOpen(true)} value="delete" color="fg.error">
                  <FiTrash2 /> Delete Track
                </Menu.Item>
                {/* External links */}
                {hasStreamingLinks && (
                  <>
                    {menuDivider}
                    {track.apple_music_url && (
                      <Menu.Item value="apple" asChild>
                        <Link href={track.apple_music_url} target="_blank" rel="noopener noreferrer">
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

      <Dialog.Root
        open={deleteConfirmOpen}
        onOpenChange={(e) => !deleteLoading && setDeleteConfirmOpen(e.open)}
        size="sm"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Delete track?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <strong>{track.title}</strong> by {track.artist} will be soft-deleted and won&apos;t be re-imported from Discogs.
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleteLoading}>
                  Cancel
                </Button>
                <Button colorPalette="danger" onClick={handleDeleteConfirm} loading={deleteLoading}>
                  Delete
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <Dialog.Root
        open={removeAudioConfirmOpen}
        onOpenChange={(e) => !removeAudioLoading && setRemoveAudioConfirmOpen(e.open)}
        size="sm"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Remove Audio</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text>
                  Are you sure you want to remove the local audio file? This action cannot be undone.
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" onClick={() => setRemoveAudioConfirmOpen(false)} disabled={removeAudioLoading}>
                  Cancel
                </Button>
                <Button colorPalette="danger" onClick={handleRemoveAudioConfirm} loading={removeAudioLoading}>
                  Remove
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
