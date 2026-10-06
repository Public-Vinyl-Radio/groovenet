"use client";
import React, { useEffect, useState } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
  Progress,
  Separator,
  Badge,
} from "@chakra-ui/react";
import { Checkbox } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useEnrichmentStore, type EnrichmentTypes } from "@/stores/enrichmentStore";
import { useTrackStore } from "@/stores/trackStore";
import { useTrack } from "@/hooks/useTrack";
import { saveTrack, analyzeTrackAsync } from "@/services/internalApi/tracks";
import { fetchAiPromptSettings } from "@/services/internalApi/settings";
import type { TrackEditFormProps } from "@/components/track-edit/types";
import EnrichmentTrackStep from "./EnrichmentTrackStep";
import { analytics } from "@/lib/analytics/client";
import { useEnrichSessionEnd, type Phase } from "./useEnrichSessionEnd";

function CurrentTrackStep({
  trackId,
  friendId,
  enrichmentTypes,
  aiPrompt,
  onSave,
  onSkip,
}: {
  trackId: string;
  friendId: number;
  enrichmentTypes: EnrichmentTypes;
  aiPrompt: string;
  onSave: (changes: Partial<TrackEditFormProps>) => Promise<void>;
  onSkip: () => void;
}) {
  const track = useTrack(trackId, friendId);
  if (!track) return <Text color="fg.muted">Loading track...</Text>;
  return (
    <EnrichmentTrackStep
      key={`${trackId}:${friendId}`}
      track={track}
      enrichmentTypes={enrichmentTypes}
      aiPrompt={aiPrompt}
      onSave={onSave}
      onSkip={onSkip}
    />
  );
}

export default function EnrichmentWizard() {
  const router = useRouter();
  const { queue, enrichmentTypes, results, setEnrichmentTypes, markResult } =
    useEnrichmentStore();
  const { setTrack } = useTrackStore();

  const [phase, setPhase] = useState<Phase>("setup");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [aiPrompt, setAiPrompt] = useState("");

  const friendId = queue[0]?.friendId;

  useEffect(() => {
    if (!friendId) return;
    fetchAiPromptSettings({ friend_id: friendId })
      .then((data) => {
        if (typeof data.prompt === "string") setAiPrompt(data.prompt);
      })
      .catch(() => {});
  }, [friendId]);

  // Keyboard shortcuts
  useEffect(() => {
    if (phase !== "enriching") return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase]);

  const current = queue[currentIndex];
  const isLast = currentIndex >= queue.length - 1;
  const isDone = currentIndex >= queue.length;

  useEffect(() => {
    if (phase === "enriching" && isDone) {
      setPhase("done");
    }
  }, [isDone, phase]);

  const handleSave = async (changes: Partial<TrackEditFormProps>) => {
    if (!current) return;
    const track = useTrackStore.getState().getTrack(current.trackId, current.friendId);
    if (!track) return;
    const updated = await saveTrack({
      track_id: track.track_id,
      friend_id: track.friend_id,
      ...changes,
    });
    setTrack(updated);

    if (enrichmentTypes.fetchAudio && !updated.local_audio_url) {
      const appleUrl = updated.apple_music_url ?? null;
      const youtubeUrl = updated.youtube_url ?? null;
      const soundcloudUrl = updated.soundcloud_url ?? null;
      if (appleUrl || youtubeUrl || soundcloudUrl) {
        analyzeTrackAsync({
          track_id: updated.track_id,
          friend_id: updated.friend_id,
          apple_music_url: appleUrl,
          youtube_url: youtubeUrl,
          soundcloud_url: soundcloudUrl,
        }).catch(() => {});
      }
    }

    markResult(`${current.trackId}:${current.friendId}`, { saved: true });
    setCurrentIndex((i) => i + 1);
  };

  const handleSkip = () => {
    if (!current) return;
    markResult(`${current.trackId}:${current.friendId}`, { skipped: true });
    setCurrentIndex((i) => i + 1);
  };

  const savedCount = Object.values(results).filter((r) => r.saved).length;
  const skippedCount = Object.values(results).filter((r) => r.skipped).length;
  useEnrichSessionEnd(phase, queue.length, savedCount, skippedCount);

  const startEnrichment = () => {
    analytics.track("enrich_session_started", {
      track_count: queue.length,
      llm: enrichmentTypes.llm,
      apple_music: enrichmentTypes.appleMusic,
      youtube: enrichmentTypes.youtube,
      fetch_audio: enrichmentTypes.fetchAudio,
    });
    setPhase("enriching");
  };

  if (phase === "setup") {
    return (
      <Flex direction="column" gap={6} maxW="lg" mx="auto" pt={8} px={4}>
        <Box>
          <Text fontSize="2xl" fontWeight="bold" mb={1}>
            Enrich {queue.length} Track{queue.length !== 1 ? "s" : ""}
          </Text>
          <Text color="fg.muted" fontSize="sm">
            Choose what data to fetch for each track. You can review and edit
            each result before saving.
          </Text>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={5}>
          <Text fontWeight="semibold" mb={4} fontSize="sm">
            Data sources
          </Text>
          <Flex direction="column" gap={4}>
            <Flex justify="space-between" align="center">
              <Box>
                <Text fontSize="sm" fontWeight="medium">
                  AI Metadata
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Genres from your taxonomy, descriptors and notes, from a web search per track (about $0.02 each). Off by default.
                </Text>
              </Box>
              <Checkbox.Root
                checked={enrichmentTypes.llm}
                onChange={() =>
                  setEnrichmentTypes({ llm: !enrichmentTypes.llm })
                }
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
              </Checkbox.Root>
            </Flex>
            <Separator />
            <Flex justify="space-between" align="center">
              <Box>
                <Text fontSize="sm" fontWeight="medium">
                  Apple Music
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Match to Apple Music for streaming URL and duration
                </Text>
              </Box>
              <Checkbox.Root
                checked={enrichmentTypes.appleMusic}
                onChange={() =>
                  setEnrichmentTypes({ appleMusic: !enrichmentTypes.appleMusic })
                }
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
              </Checkbox.Root>
            </Flex>
            <Separator />
            <Flex justify="space-between" align="center">
              <Box>
                <Text fontSize="sm" fontWeight="medium">
                  YouTube
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Match to a YouTube video for audio download
                </Text>
              </Box>
              <Checkbox.Root
                checked={enrichmentTypes.youtube}
                onChange={() =>
                  setEnrichmentTypes({ youtube: !enrichmentTypes.youtube })
                }
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
              </Checkbox.Root>
            </Flex>
            <Separator />
            <Flex justify="space-between" align="center">
              <Box>
                <Text fontSize="sm" fontWeight="medium">
                  Fetch audio
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Enqueue each saved track for audio download immediately
                </Text>
              </Box>
              <Checkbox.Root
                checked={enrichmentTypes.fetchAudio}
                onChange={() =>
                  setEnrichmentTypes({ fetchAudio: !enrichmentTypes.fetchAudio })
                }
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
              </Checkbox.Root>
            </Flex>
          </Flex>
        </Box>

        <Flex justify="space-between">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            colorPalette="blue"
            onClick={startEnrichment}
            disabled={
              !enrichmentTypes.llm &&
              !enrichmentTypes.appleMusic &&
              !enrichmentTypes.youtube
            }
          >
            Start Enrichment →
          </Button>
        </Flex>
      </Flex>
    );
  }

  if (phase === "done") {
    return (
      <Flex direction="column" gap={6} maxW="lg" mx="auto" pt={8} px={4} align="center">
        <Text fontSize="2xl" fontWeight="bold">
          Done!
        </Text>
        <Flex gap={6}>
          <Box textAlign="center">
            <Text fontSize="3xl" fontWeight="bold" color="green.500">
              {savedCount}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              saved
            </Text>
          </Box>
          <Box textAlign="center">
            <Text fontSize="3xl" fontWeight="bold" color="gray.400">
              {skippedCount}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              skipped
            </Text>
          </Box>
        </Flex>
        <Button colorPalette="blue" onClick={() => router.push("/")}>
          Back to tracks
        </Button>
      </Flex>
    );
  }

  // Enriching phase
  const progress = queue.length > 0 ? (currentIndex / queue.length) * 100 : 0;

  return (
    <Flex direction="column" maxW="2xl" mx="auto" pt={6} px={4}>
      {/* Header */}
      <Flex align="center" justify="space-between" mb={2}>
        <Flex align="center" gap={3}>
          <Text fontSize="sm" color="fg.muted">
            Track {Math.min(currentIndex + 1, queue.length)} of {queue.length}
          </Text>
          <Badge size="sm" colorPalette="blue">
            {savedCount} saved
          </Badge>
          {skippedCount > 0 && (
            <Badge size="sm" variant="outline">
              {skippedCount} skipped
            </Badge>
          )}
        </Flex>
        <Button size="xs" variant="ghost" onClick={() => router.push("/")}>
          Exit
        </Button>
      </Flex>

      <Progress.Root value={progress} mb={6} size="sm">
        <Progress.Track>
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>

      {/* Navigation arrows */}
      <Flex justify="space-between" mb={4}>
        <Button
          size="xs"
          variant="ghost"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        >
          ← Prev
        </Button>
        <Text fontSize="xs" color="fg.subtle">
          {isLast ? "Last track" : `${queue.length - currentIndex - 1} remaining`}
        </Text>
      </Flex>

      {current && (
        <CurrentTrackStep
          key={`${current.trackId}:${current.friendId}`}
          trackId={current.trackId}
          friendId={current.friendId}
          enrichmentTypes={enrichmentTypes}
          aiPrompt={aiPrompt}
          onSave={handleSave}
          onSkip={handleSkip}
        />
      )}
    </Flex>
  );
}
