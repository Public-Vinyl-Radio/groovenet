"use client";

import React from "react";
import { Box, Button, Stack, Grid, Text, Flex } from "@chakra-ui/react";
import { RatingGroup } from "@chakra-ui/react";
import LabeledInput from "@/components/form/LabeledInput";
import LabeledTextarea from "@/components/form/LabeledTextarea";

export interface TrackFormData {
  track_id?: string; // Optional - present when editing existing tracks
  title: string;
  artist: string;
  position?: string;
  duration_seconds?: number;
  bpm?: number;
  key?: string;
  notes?: string;
  local_tags?: string;
  star_rating?: number;
  apple_music_url?: string;
  youtube_url?: string;
  soundcloud_url?: string;
}

interface TrackListBuilderProps {
  tracks: TrackFormData[];
  onChange: (tracks: TrackFormData[]) => void;
  defaultAlbum?: string;
  defaultArtist?: string;
}

export default function TrackListBuilder({
  tracks,
  onChange,
  defaultArtist,
}: TrackListBuilderProps) {
  const addTrack = () => {
    onChange([
      ...tracks,
      {
        title: '',
        artist: defaultArtist || '',
        position: `${tracks.length + 1}`,
      },
    ]);
  };

  const removeTrack = (index: number) => {
    const updated = tracks.filter((_, i) => i !== index);
    // Re-assign positions only if they were numeric and sequential
    const allNumeric = updated.every((t) => t.position && /^\d+$/.test(t.position));
    if (allNumeric) {
      updated.forEach((t, i) => {
        t.position = `${i + 1}`;
      });
    }
    onChange(updated);
  };

  const updateTrack = (index: number, field: keyof TrackFormData, value: string | number | undefined) => {
    const updated = [...tracks];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <Stack gap={4}>
      <Flex justify="space-between" align="center">
        <Text fontSize="lg" fontWeight="semibold">
          Tracks
        </Text>
        <Button onClick={addTrack} size="sm" colorPalette="blue">
          + Add Track
        </Button>
      </Flex>

      {tracks.length === 0 && (
        <Box
          p={4}
          border="1px dashed"
          borderColor="border.subtle"
          borderRadius="md"
          textAlign="center"
          color="fg.muted"
        >
          No tracks added yet. Click &quot;Add Track&quot; to get started.
        </Box>
      )}

      {tracks.map((track, index) => (
        <Box
          key={index}
          p={4}
          border="1px solid"
          borderColor="border.subtle"
          borderRadius="md"
          bg="bg.subtle"
        >
          <Flex justify="space-between" align="center" mb={3}>
            <Text fontWeight="semibold" fontSize="sm">
              Track {index + 1}
            </Text>
            {tracks.length > 1 && (
              <Button
                size="xs"
                onClick={() => removeTrack(index)}
                variant="ghost"
                colorPalette="red"
              >
                Remove
              </Button>
            )}
          </Flex>

          <Stack gap={3}>
            <Grid templateColumns={{ base: "1fr", md: "2fr 2fr 1fr" }} gap={3}>
              <LabeledInput
                label="Title *"
                value={track.title}
                onChange={(e) => updateTrack(index, 'title', e.target.value)}
                placeholder="Track title"
              />
              <LabeledInput
                label="Artist *"
                value={track.artist}
                onChange={(e) => updateTrack(index, 'artist', e.target.value)}
                placeholder="Artist name"
              />
              <LabeledInput
                label="Position"
                value={track.position || ''}
                onChange={(e) => updateTrack(index, 'position', e.target.value)}
                placeholder={`${index + 1}`}
              />
            </Grid>

            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr 1fr" }} gap={3}>
              <LabeledInput
                label="Duration (seconds)"
                value={track.duration_seconds || ''}
                onChange={(e) => updateTrack(index, 'duration_seconds', e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="180"
                type="number"
              />
              <LabeledInput
                label="BPM"
                value={track.bpm || ''}
                onChange={(e) => updateTrack(index, 'bpm', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="120"
                type="number"
              />
              <LabeledInput
                label="Key"
                value={track.key || ''}
                onChange={(e) => updateTrack(index, 'key', e.target.value)}
                placeholder="C major"
              />
            </Grid>

            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={3}>
              <Box>
                <Text mb={1} fontSize="sm">
                  Rating
                </Text>
                <RatingGroup.Root
                  value={track.star_rating || 0}
                  onValueChange={(e) => updateTrack(index, 'star_rating', e.value)}
                  count={5}
                  size="md"
                >
                  <RatingGroup.HiddenInput />
                  <RatingGroup.Control />
                </RatingGroup.Root>
              </Box>
              <LabeledInput
                label="Tags"
                value={track.local_tags || ''}
                onChange={(e) => updateTrack(index, 'local_tags', e.target.value)}
                placeholder="house, deep"
              />
            </Grid>

            {/* Platform URLs */}
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={2}>
                Platform URLs (Optional)
              </Text>
              <Stack gap={2}>
                <LabeledInput
                  label="Apple Music URL"
                  value={track.apple_music_url || ''}
                  onChange={(e) => updateTrack(index, 'apple_music_url', e.target.value)}
                  placeholder="https://music.apple.com/..."
                  size="sm"
                />
                <LabeledInput
                  label="YouTube URL"
                  value={track.youtube_url || ''}
                  onChange={(e) => updateTrack(index, 'youtube_url', e.target.value)}
                  placeholder="https://youtube.com/..."
                  size="sm"
                />
                <LabeledInput
                  label="SoundCloud URL"
                  value={track.soundcloud_url || ''}
                  onChange={(e) => updateTrack(index, 'soundcloud_url', e.target.value)}
                  placeholder="https://soundcloud.com/..."
                  size="sm"
                />
              </Stack>
            </Box>

            <LabeledTextarea
              label="Notes"
              value={track.notes || ''}
              onChange={(e) => updateTrack(index, 'notes', e.target.value)}
              placeholder="Notes about this track..."
              rows={2}
            />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
