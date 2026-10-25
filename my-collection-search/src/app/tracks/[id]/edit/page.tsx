"use client";

import React, { useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  RatingGroup,
  Skeleton,
  Stack,
  Text,
} from "@chakra-ui/react";

import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import HeaderCancelButton from "@/components/layout/HeaderCancelButton";
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
import { formatBpmConfidencePercent, isBpmConfidenceLow } from "@/lib/essentiaBpm";
import { formatKeyConfidencePercent, isKeyConfidenceLow } from "@/lib/essentiaKey";
import { toaster } from "@/components/ui/toaster";
import { FiCheck } from "react-icons/fi";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box borderWidth="outline" borderColor="border.ink" boxShadow="sm" p={4}>
      <Text fontWeight="semibold" fontSize="sm" color="fg.muted" mb={3} fontFamily="label" textTransform="uppercase" letterSpacing="wide">
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
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
      <PageHeader
        title="Edit Track"
        leading={<HeaderCancelButton onClick={() => router.back()} disabled={saving} />}
        actions={
          hasValidFriendId && track
            ? [{ label: "Save", icon: <FiCheck />, onClick: () => void handleSubmit(), disabled: saving }]
            : []
        }
      />
      <Flex
        justify="space-between"
        align={{ base: "flex-start", md: "center" }}
        mb={6}
        gap={3}
      >
        <Stack gap={1} minW={0} flex={1}>
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
        <Box borderWidth="outline" borderColor="border.ink" boxShadow="sm" p={4}>
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
                <Box>
                  <LabeledInput
                    label="BPM"
                    name="bpm"
                    value={form.bpm}
                    onChange={handleChange}
                    type="number"
                  />
                  {formatBpmConfidencePercent(form.bpm_confidence) !== null &&
                    (isBpmConfidenceLow(form.bpm_confidence) ? (
                      <Badge colorPalette="status.analysis" variant="subtle" size="sm" mt={1}>
                        Uncertain BPM — {formatBpmConfidencePercent(form.bpm_confidence)}% confident
                      </Badge>
                    ) : (
                      <Text fontSize="xs" color="fg.muted" mt={1}>
                        {formatBpmConfidencePercent(form.bpm_confidence)}% confident
                      </Text>
                    ))}
                </Box>
                <Box>
                  <LabeledInput
                    label="Key"
                    name="key"
                    value={form.key}
                    onChange={handleChange}
                  />
                  {formatKeyConfidencePercent(form.key_confidence) !== null &&
                    (isKeyConfidenceLow(form.key_confidence) ? (
                      <Badge colorPalette="status.analysis" variant="subtle" size="sm" mt={1}>
                        Uncertain key — {formatKeyConfidencePercent(form.key_confidence)}% confident
                      </Badge>
                    ) : (
                      <Text fontSize="xs" color="fg.muted" mt={1}>
                        {formatKeyConfidencePercent(form.key_confidence)}% confident
                      </Text>
                    ))}
                </Box>
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
        </Box>
      )}
    </PageContainer>
  );
}
