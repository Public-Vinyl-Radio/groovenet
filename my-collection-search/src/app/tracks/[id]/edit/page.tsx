"use client";

import React, { useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  RatingGroup,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";

import PageContainer from "@/components/layout/PageContainer";
import LabeledInput from "@/components/form/LabeledInput";
import LabeledTextarea from "@/components/form/LabeledTextarea";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { useTrackEditAudioActions } from "@/components/track-edit/useTrackEditAudioActions";
import {
  genreChanges,
  toTrackEditFormState,
  type TrackEditFormProps,
} from "@/components/track-edit/types";
import GenrePicker from "@/components/GenrePicker";
import { useTrackByIdQuery } from "@/hooks/useTrackByIdQuery";
import { useTracksQuery } from "@/hooks/useTracksQuery";
import { cleanSoundcloudUrl } from "@/lib/url";
import { toaster } from "@/components/ui/toaster";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box borderWidth="1px" borderRadius="md" p={4}>
      <Text fontWeight="semibold" fontSize="sm" color="gray.500" mb={3} textTransform="uppercase" letterSpacing="wide">
        {title}
      </Text>
      {children}
    </Box>
  );
}

export default function TrackEditPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const trackId = params?.id ?? "";
  const friendId = Number(searchParams?.get("friend_id") ?? "");
  const hasValidFriendId = Number.isFinite(friendId) && friendId > 0;

  const trackQuery = useTrackByIdQuery(trackId, friendId, hasValidFriendId);
  const track = trackQuery.data ?? null;
  const trackAsFormProps = track as unknown as TrackEditFormProps | null;

  const [form, setForm] = useState(() => toTrackEditFormState(trackAsFormProps));
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (track) setForm(toTrackEditFormState(track as unknown as TrackEditFormProps));
  }, [track]);

  const { saveTrack } = useTracksQuery();

  const handleSave = async (data: TrackEditFormProps) => {
    await saveTrack(data);
    toaster.create({ title: "Track saved", type: "success" });
    router.back();
  };

  const {
    analyzeLoading, analyzeDisabled, uploadLoading, handleAnalyzeAudio, handleFileUpload,
    handleRemoveAudio, removeAudioLoading,
  } = useTrackEditAudioActions({ form, setForm, onSave: handleSave });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.friend_id) {
      toaster.create({ title: "Track missing friend_id", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const cleanForm: TrackEditFormProps = {
        ...form,
        soundcloud_url: cleanSoundcloudUrl(form.soundcloud_url),
        bpm: Number(form.bpm) || null,
        key: form.key || null,
        danceability: Number(form.danceability) || null,
        duration_seconds: Number(form.duration_seconds) || null,
        friend_id: form.friend_id,
        ...genreChanges(track?.track_genres, form.track_genres),
      };
      await handleSave(cleanForm);
    } finally {
      setSaving(false);
    }
  };
  return (
    <PageContainer size="standard">
      <Flex
        justify="space-between"
        align={{ base: "flex-start", md: "center" }}
        mb={6}
        gap={3}
      >
        <Stack gap={1} minW={0} flex={1}>
          <Heading size={{ base: "lg", md: "xl" }} lineHeight="1.15">
            Edit Track
          </Heading>
          {track && (
            <Text color="fg.muted" fontSize={{ base: "sm", md: "md" }} lineClamp={1}>
              {form.title || track.title}
              {(form.artist || track.artist) ? ` · ${form.artist || track.artist}` : ""}
            </Text>
          )}
        </Stack>
        {track && (
          <TrackActionsMenu
            track={track}
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

      {!hasValidFriendId && (
        <Box borderWidth="1px" borderRadius="md" p={4}>
          <Text>Missing <code>friend_id</code> query param.</Text>
        </Box>
      )}

      {hasValidFriendId && trackQuery.isLoading && (
        <Stack gap={4}>
          <Skeleton height="120px" borderRadius="md" />
          <Skeleton height="100px" borderRadius="md" />
          <Skeleton height="120px" borderRadius="md" />
          <Skeleton height="120px" borderRadius="md" />
        </Stack>
      )}

      {hasValidFriendId && !trackQuery.isLoading && !track && (
        <Text>Track not found.</Text>
      )}

      {hasValidFriendId && track && (
        <Box as="form" onSubmit={handleSubmit}>
          <Stack gap={4}>
            {/* Core Info */}
            <SectionCard title="Core Info">
              <Stack gap={3}>
                <LabeledInput
                  label="Title"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                />
                <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={3}>
                  <LabeledInput
                    label="Artist"
                    name="artist"
                    value={form.artist}
                    onChange={handleChange}
                  />
                  <LabeledInput
                    label="Album"
                    name="album"
                    value={form.album}
                    onChange={handleChange}
                  />
                </Grid>
                <Box>
                  <Text mb={1} fontSize="sm">Rating</Text>
                  <RatingGroup.Root
                    value={form.star_rating}
                    onValueChange={({ value }) => setForm((prev) => ({ ...prev, star_rating: value }))}
                    size="md"
                    count={5}
                  >
                    <RatingGroup.HiddenInput />
                    <RatingGroup.Control />
                  </RatingGroup.Root>
                </Box>
              </Stack>
            </SectionCard>

            {/* Audio Metadata */}
            <SectionCard title="Audio Metadata">
              <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(4, 1fr)" }} gap={3}>
                <LabeledInput
                  label="BPM"
                  name="bpm"
                  value={form.bpm}
                  onChange={handleChange}
                  type="number"
                />
                <LabeledInput
                  label="Key"
                  name="key"
                  value={form.key}
                  onChange={handleChange}
                />
                <LabeledInput
                  label="Danceability"
                  name="danceability"
                  value={form.danceability ?? ""}
                  onChange={handleChange}
                  type="number"
                />
                <LabeledInput
                  label="Duration (s)"
                  name="duration_seconds"
                  value={form.duration_seconds ?? ""}
                  onChange={handleChange}
                  type="number"
                />
              </Grid>
            </SectionCard>

            {/* Notes & Tags */}
            <SectionCard title="Notes & Tags">
              <Stack gap={3}>
                <LabeledTextarea
                  label="Notes"
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={5}
                />
                <GenrePicker
                  value={form.track_genres}
                  onChange={(track_genres) => setForm((prev) => ({ ...prev, track_genres }))}
                  legacyTags={form.local_tags}
                  disabled={saving}
                />
              </Stack>
            </SectionCard>

            {/* Links */}
            <SectionCard title="Links">
              <Stack gap={3}>
                <LabeledInput
                  label="Apple Music URL"
                  name="apple_music_url"
                  value={form.apple_music_url || ""}
                  onChange={handleChange}
                />
                <LabeledInput
                  label="YouTube URL"
                  name="youtube_url"
                  value={form.youtube_url || ""}
                  onChange={handleChange}
                />
                <LabeledInput
                  label="SoundCloud URL"
                  name="soundcloud_url"
                  value={form.soundcloud_url || ""}
                  onChange={handleChange}
                />
              </Stack>
            </SectionCard>
          </Stack>

          <Flex gap={3} mt={6} display={{ base: "none", md: "flex" }}>
            <Button type="submit" loading={saving} disabled={saving}>
              Save
            </Button>
            <Button variant="outline" onClick={() => router.back()} disabled={saving}>
              Cancel
            </Button>
          </Flex>

          <Box
            display={{ base: "block", md: "none" }}
            h="108px"
          />

          <Box
            display={{ base: "block", md: "none" }}
            position="fixed"
            left="0"
            right="0"
            bottom="0"
            px={4}
            pb="calc(env(safe-area-inset-bottom, 0px) + 12px)"
            pt={3}
            bg="linear-gradient(to top, var(--chakra-colors-bg), color-mix(in srgb, var(--chakra-colors-bg) 88%, transparent))"
            zIndex={20}
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
                onClick={() => router.back()}
                disabled={saving}
                flex={1}
                fontWeight="semibold"
                borderRadius="xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={saving}
                disabled={saving}
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
    </PageContainer>
  );
}
