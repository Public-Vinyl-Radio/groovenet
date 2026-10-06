"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  Flex,
  Portal,
  Dialog,
  CloseButton,
} from "@chakra-ui/react";
import type { Track } from "@/types/track";
import { cleanSoundcloudUrl } from "@/lib/url";
import TrackEditFormSkeleton from "@/components/TrackEditFormSkeleton";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { useTrackEditAudioActions } from "@/components/track-edit/useTrackEditAudioActions";
import TrackEditFormFields from "@/components/track-edit/TrackEditFormFields";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { getMobileBottomOverlayOffset } from "@/lib/mobileLayout";
import {
  toTrackEditFormState,
  genreChanges,
  type TrackEditFormProps,
} from "@/components/track-edit/types";

export type { TrackEditFormProps } from "@/components/track-edit/types";

export default function TrackEditForm({
  track,
  menuTrack,
  onSave,
  dialogOpen,
  setDialogOpen,
  initialFocusRef,
}: {
  track: TrackEditFormProps | null;
  menuTrack?: Track | null;
  onSave: (data: TrackEditFormProps) => void;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  initialFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [form, setForm] = useState(() => toTrackEditFormState(track));

  React.useEffect(() => {
    setForm(toTrackEditFormState(track));
  }, [track]);

  const [loading, setLoading] = useState(false);
  const { playlistLength } = usePlaylistPlayer();
  const mobileBottomOverlayOffset = getMobileBottomOverlayOffset(playlistLength);
  const {
    analyzeLoading,
    analyzeDisabled,
    uploadLoading,
    handleAnalyzeAudio,
    handleFileUpload,
    handleRemoveAudio,
    removeAudioLoading,
  } = useTrackEditAudioActions({ form, setForm, onSave });

  const handleStarRating = (rating: number) => {
    setForm((prev) => ({ ...prev, star_rating: rating }));
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!form.friend_id) {
        throw new Error("Track is missing friend_id");
      }
      // Strip query params from soundcloud_url if present
      const cleanForm = {
        ...form,
        soundcloud_url: cleanSoundcloudUrl(form.soundcloud_url),
        bpm: Number(form.bpm) || null,
        key: form.key || null,
        danceability: Number(form.danceability) || null,
        duration_seconds: Number(form.duration_seconds) || null,
        friend_id: form.friend_id,
        ...genreChanges(track?.track_genres, form.track_genres),
      };
      await Promise.resolve(onSave(cleanForm));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={(details) => setDialogOpen(details.open)}
      initialFocusEl={() => initialFocusRef.current}
      role="dialog"
      size={["full", "lg", "lg"]}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header p={[4, 6, 6]}>
              <Flex justify="space-between" align="center" width="100%">
                <Flex align="center" gap={3}>
                  <Dialog.Title>Edit Track</Dialog.Title>
                  {track && menuTrack && (
                    <TrackActionsMenu
                      track={menuTrack}
                      hideEdit
                      audioActions={{
                        onFetchAudio: handleAnalyzeAudio,
                        fetchAudioLoading: analyzeLoading,
                        fetchAudioDisabled: analyzeDisabled,
                        onUploadFile: handleFileUpload,
                        uploadLoading,
                        onRemoveAudio: handleRemoveAudio,
                        removeAudioLoading,
                      }}
                    />
                  )}
                </Flex>
                <Dialog.CloseTrigger asChild>
                  <CloseButton ref={initialFocusRef} size="sm" />
                </Dialog.CloseTrigger>
              </Flex>
            </Dialog.Header>
            <Dialog.Body px={{ base: 2, md: 6 }} py={{ base: 2, md: 6 }}>
              {!track ? (
                <TrackEditFormSkeleton />
              ) : (
                <Box as="form" onSubmit={handleSubmit}>
                  <TrackEditFormFields
                    values={form}
                    loading={loading}
                    onChange={handleChange}
                    onStarRatingChange={handleStarRating}
                    onGenresChange={(track_genres) =>
                      setForm((prev) => ({ ...prev, track_genres }))
                    }
                    submitButtonDisplay={{ base: "none", md: "inline-flex" }}
                  />

                  <Box display={{ base: "block", md: "none" }} h="104px" />

                  <Box
                    display={{ base: "block", md: "none" }}
                    position="sticky"
                    bottom={mobileBottomOverlayOffset}
                    mt={4}
                    mx={-2}
                    px={2}
                    pb="calc(env(safe-area-inset-bottom, 0px) + 12px)"
                    pt={3}
                    bg="linear-gradient(to top, var(--chakra-colors-bg), color-mix(in srgb, var(--chakra-colors-bg) 88%, transparent))"
                    zIndex={2}
                  >
                    <Flex
                      gap={2}
                      p="10px"
                      borderWidth="1px"
                      borderColor="rgba(255, 255, 255, 0.45)"
                      borderRadius="28px"
                      bg="transparent"
                      _light={{ bg: "rgba(255, 255, 255, 0.58)" }}
                      _dark={{ bg: "rgba(18, 18, 24, 0.58)" }}
                      boxShadow="0 18px 40px rgba(15, 23, 42, 0.16)"
                      style={{ backdropFilter: "blur(24px) saturate(200%)" }}
                    >
                      <Button
                        variant="outline"
                        bg="bg"
                        borderColor="blackAlpha.200"
                        onClick={() => setDialogOpen(false)}
                        disabled={loading}
                        flex={1}
                        fontWeight="semibold"
                        borderRadius="xl"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        loading={loading}
                        disabled={loading}
                        flex={1}
                        colorPalette="blue"
                        fontWeight="semibold"
                        borderRadius="xl"
                      >
                        Save
                      </Button>
                    </Flex>
                  </Box>
                </Box>
              )}
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
