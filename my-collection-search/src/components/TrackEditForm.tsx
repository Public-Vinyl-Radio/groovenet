"use client";

import React, { useState } from "react";
import { Box, Button, Flex } from "@chakra-ui/react";
import RetroDialog, { RetroDialogTitle } from "@/components/ui/RetroDialog";
import type { Track } from "@/types/track";
import { cleanSoundcloudUrl } from "@/lib/url";
import TrackEditFormSkeleton from "@/components/TrackEditFormSkeleton";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { useTrackEditAudioActions } from "@/components/track-edit/useTrackEditAudioActions";
import TrackEditFormFields from "@/components/track-edit/TrackEditFormFields";
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
  const formId = React.useId();
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
    <RetroDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      initialFocusEl={() => initialFocusRef.current}
      closeButtonRef={initialFocusRef}
      dismissible={!loading}
      maxW="lg"
      fullScreenOnMobile
      header={
        <Flex
          flex="1"
          minW={0}
          align="center"
          gap={3}
          css={{
            '& button[aria-label="Track actions"]': {
              color: "bg",
              borderColor: "bg",
              _hover: { bg: "transparent", opacity: 0.75 },
            },
          }}
        >
          <RetroDialogTitle flex="1" fontFamily="label" fontSize="13px" textTransform="uppercase">
            Edit Track
          </RetroDialogTitle>
          {track && menuTrack && (
            <TrackActionsMenu
              track={menuTrack}
              hideEdit
              prominent
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
      }
      footer={
        track && (
          <Flex gap={2} p={4}>
            <Button
              minH="44px"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={loading}
              flex={1}
            >
              Cancel
            </Button>
            <Button
              minH="44px"
              type="submit"
              form={formId}
              loading={loading}
              disabled={loading}
              flex={1}
              colorPalette="accent"
            >
              Save
            </Button>
          </Flex>
        )
      }
    >
      <Box p={{ base: 4, md: 6 }}>
        {!track ? (
          <TrackEditFormSkeleton />
        ) : (
          <Box as="form" id={formId} onSubmit={handleSubmit}>
            <TrackEditFormFields
              values={form}
              loading={loading}
              onChange={handleChange}
              onStarRatingChange={handleStarRating}
              onGenresChange={(track_genres) => setForm((prev) => ({ ...prev, track_genres }))}
              showSubmitButton={false}
            />
          </Box>
        )}
      </Box>
    </RetroDialog>
  );
}
