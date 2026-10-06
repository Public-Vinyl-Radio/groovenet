"use client";
import React, { useEffect, useState } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
  Textarea,
  Input,
  Spinner,
  Badge,
  Image,
  Separator,
  TagsInput,
} from "@chakra-ui/react";
import { Checkbox } from "@chakra-ui/react";
import type { Track, TrackGenre, YoutubeVideo } from "@/types/track";
import type { AppleMusicResult } from "@/types/apple";
import type { DiscogsLookupVideo } from "@/types/discogs";
import type { EnrichmentTypes } from "@/stores/enrichmentStore";
import { genreChanges, type TrackEditFormProps } from "@/components/track-edit/types";
import GenrePicker from "@/components/GenrePicker";
import { buildTrackMetadataPrompt } from "@/lib/prompts";
import { useTrackMetadataMutation } from "@/hooks/useTrackMetadataMutation";
import { useYouTubeMusicSearchMutation } from "@/hooks/useYouTubeMusicSearchMutation";
import { fetchAppleMusicAISearch } from "@/services/aiService";
import { lookupDiscogsVideos, extractDiscogsVideos } from "@/services/internalApi/discogs";

interface Props {
  track: Track;
  enrichmentTypes: EnrichmentTypes;
  aiPrompt: string;
  onSave: (changes: Partial<TrackEditFormProps>) => Promise<void>;
  onSkip: () => void;
}

export default function EnrichmentTrackStep({
  track,
  enrichmentTypes,
  aiPrompt,
  onSave,
  onSkip,
}: Props) {
  const { mutateAsync: fetchMetadata } = useTrackMetadataMutation();
  const { mutateAsync: searchYouTube } = useYouTubeMusicSearchMutation();

  // LLM state. Genres are taxonomy links and descriptors free text (#374);
  // the AI's suggestion replaces whatever the track had, for review.
  const [llmGenres, setLlmGenres] = useState<TrackGenre[]>(track.track_genres ?? []);
  const [llmDescriptors, setLlmDescriptors] = useState<string[]>(track.descriptors ?? []);
  const [llmNotes, setLlmNotes] = useState(track.notes ?? "");
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmFetched, setLlmFetched] = useState(false);
  const [llmInclude, setLlmInclude] = useState(true);

  // Apple Music state
  const [appleMusicResults, setAppleMusicResults] = useState<AppleMusicResult[]>([]);
  const [selectedAppleUrl, setSelectedAppleUrl] = useState(track.apple_music_url ?? "");
  const [appleMusicLoading, setAppleMusicLoading] = useState(false);
  const [appleMusicError, setAppleMusicError] = useState<string | null>(null);
  const [appleMusicSearchQuery, setAppleMusicSearchQuery] = useState("");
  const [appleMusicInclude, setAppleMusicInclude] = useState(true);

  // YouTube state
  const [youtubeResults, setYoutubeResults] = useState<YoutubeVideo[]>([]);
  const [selectedYoutubeUrl, setSelectedYoutubeUrl] = useState(track.youtube_url ?? "");
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeInclude, setYoutubeInclude] = useState(true);

  // Discogs videos state (shown inside the YouTube section)
  const [discogsVideos, setDiscogsVideos] = useState<DiscogsLookupVideo[]>([]);
  const [discogsLoading, setDiscogsLoading] = useState(false);
  const [discogsLoaded, setDiscogsLoaded] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  // Fire LLM on mount
  useEffect(() => {
    if (!enrichmentTypes.llm || !aiPrompt || llmFetched) return;
    const run = async () => {
      setLlmLoading(true);
      setLlmError(null);
      try {
        const prompt = buildTrackMetadataPrompt(
          {
            title: track.title,
            artist: track.artist,
            album: track.album,
            year: track.year,
            duration: track.duration,
            duration_seconds: track.duration_seconds ?? null,
            isrc: track.isrc ?? null,
            release_id: track.release_id ?? null,
            discogs_url: track.discogs_url ?? null,
            apple_music_url: track.apple_music_url ?? null,
            youtube_url: track.youtube_url ?? null,
            soundcloud_url: track.soundcloud_url ?? null,
          },
          aiPrompt
        );
        const data = await fetchMetadata({
          prompt,
          friend_id: track.friend_id,
          track_id: track.track_id,
        });
        if (data.genres.length > 0) setLlmGenres(data.genres);
        if (data.descriptors.length > 0) setLlmDescriptors(data.descriptors);
        if (data.notes) setLlmNotes(data.notes);
        setLlmFetched(true);
      } catch {
        setLlmError("Failed to fetch AI metadata");
      } finally {
        setLlmLoading(false);
      }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire Apple Music on mount
  useEffect(() => {
    if (!enrichmentTypes.appleMusic) return;
    runAppleMusicSearch(track.title, track.artist, track.album);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire YouTube on mount
  useEffect(() => {
    if (!enrichmentTypes.youtube) return;
    const run = async () => {
      setYoutubeLoading(true);
      setYoutubeError(null);
      try {
        const data = await searchYouTube({ title: track.title, artist: track.artist });
        setYoutubeResults(data.results ?? []);
        if (!selectedYoutubeUrl && data.results?.[0]) {
          setSelectedYoutubeUrl(data.results[0].url ?? "");
        }
      } catch {
        setYoutubeError("Failed to search YouTube");
      } finally {
        setYoutubeLoading(false);
      }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAppleMusicSearch = async (title?: string, artist?: string, album?: string) => {
    setAppleMusicLoading(true);
    setAppleMusicError(null);
    try {
      const data = await fetchAppleMusicAISearch({ title, artist, album });
      setAppleMusicResults(data.results ?? []);
      if (!selectedAppleUrl && data.results?.[0]) {
        setSelectedAppleUrl(data.results[0].url ?? "");
      }
    } catch {
      setAppleMusicError("Failed to search Apple Music");
    } finally {
      setAppleMusicLoading(false);
    }
  };

  const loadDiscogsVideos = async () => {
    setDiscogsLoading(true);
    try {
      const data = await lookupDiscogsVideos(track.track_id);
      const vids = extractDiscogsVideos(data);
      setDiscogsVideos(vids);
      setDiscogsLoaded(true);
      if (!selectedYoutubeUrl && vids[0]) {
        setSelectedYoutubeUrl((vids[0].uri || vids[0].url) ?? "");
      }
    } catch {
      // silent — no Discogs data available
    } finally {
      setDiscogsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const changes: Partial<TrackEditFormProps> = {};
      if (enrichmentTypes.llm && llmInclude) {
        // local_tags is no longer written: it stays the raw original that
        // reconciliation (#372) maps onto the taxonomy.
        const genreUpdate = genreChanges(track.track_genres, llmGenres);
        if (genreUpdate.genres) {
          changes.genres = genreUpdate.genres;
          changes.genre_source = "enrichment";
        }
        if (descriptorsChanged(track.descriptors ?? [], llmDescriptors)) {
          changes.descriptors = llmDescriptors;
        }
        if (llmNotes) changes.notes = llmNotes;
      }
      if (enrichmentTypes.appleMusic && appleMusicInclude && selectedAppleUrl) {
        changes.apple_music_url = selectedAppleUrl;
      }
      if (enrichmentTypes.youtube && youtubeInclude && selectedYoutubeUrl) {
        changes.youtube_url = selectedYoutubeUrl;
      }
      await onSave(changes);
    } finally {
      setIsSaving(false);
    }
  };

  const placeholderSrc =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23374151' width='100' height='100'/%3E%3Ctext fill='%23ffffff' font-family='Arial' font-size='14' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E";
  const artworkSrc =
    track.audio_file_album_art_url || track.album_thumbnail || placeholderSrc;

  return (
    <Flex direction="column" gap={6}>
      {/* Track Identity */}
      <Flex gap={4} align="flex-start">
        <Image
          src={artworkSrc}
          alt={track.title}
          width="72px"
          height="72px"
          objectFit="cover"
          borderRadius="md"
          flexShrink={0}
        />
        <Box>
          <Text fontWeight="bold" fontSize="lg" lineClamp={1}>
            {track.title}
          </Text>
          <Text color="fg.muted" fontSize="sm">
            {track.artist}
          </Text>
          <Text color="fg.subtle" fontSize="sm">
            {track.album}
            {track.year ? ` (${track.year})` : ""}
          </Text>
        </Box>
      </Flex>

      {/* LLM Section */}
      {enrichmentTypes.llm && (
        <Box>
          <Separator mb={4} />
          <Flex align="center" justify="space-between" mb={3}>
            <Flex align="center" gap={2}>
              <Text fontWeight="semibold" fontSize="sm">
                AI Metadata
              </Text>
              {llmLoading && <Spinner size="xs" />}
              {llmError && (
                <Badge colorPalette="red" size="xs">
                  failed
                </Badge>
              )}
            </Flex>
            <Checkbox.Root
              size="sm"
              checked={llmInclude}
              onChange={() => setLlmInclude((v) => !v)}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>
                <Text fontSize="xs">Include</Text>
              </Checkbox.Label>
            </Checkbox.Root>
          </Flex>
          {llmError ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setLlmFetched(false);
                setLlmError(null);
              }}
            >
              Retry
            </Button>
          ) : (
            <Flex direction="column" gap={3} opacity={llmInclude ? 1 : 0.4}>
              <GenrePicker
                value={llmGenres}
                onChange={setLlmGenres}
                legacyTags={track.local_tags}
                disabled={!llmInclude}
              />
              <TagsInput.Root
                size="sm"
                value={llmDescriptors}
                onValueChange={(details) => setLlmDescriptors(details.value)}
                disabled={!llmInclude}
                addOnPaste
              >
                <TagsInput.Label fontSize="xs" color="fg.muted" fontWeight="normal">
                  Descriptors
                </TagsInput.Label>
                <TagsInput.Control>
                  <TagsInput.Items />
                  <TagsInput.Input placeholder="Mood or description, e.g. uplifting" />
                </TagsInput.Control>
                <TagsInput.HiddenInput />
              </TagsInput.Root>
              <Box>
                <Text fontSize="xs" color="fg.muted" mb={1}>
                  Notes
                </Text>
                <Textarea
                  size="sm"
                  value={llmNotes}
                  onChange={(e) => setLlmNotes(e.target.value)}
                  rows={3}
                  disabled={!llmInclude}
                  placeholder="Track notes..."
                />
              </Box>
            </Flex>
          )}
        </Box>
      )}

      {/* Apple Music Section */}
      {enrichmentTypes.appleMusic && (
        <Box>
          <Separator mb={4} />
          <Flex align="center" justify="space-between" mb={3}>
            <Flex align="center" gap={2}>
              <Text fontWeight="semibold" fontSize="sm">
                Apple Music
              </Text>
              {appleMusicLoading && <Spinner size="xs" />}
              {appleMusicError && (
                <Badge colorPalette="red" size="xs">
                  failed
                </Badge>
              )}
            </Flex>
            <Checkbox.Root
              size="sm"
              checked={appleMusicInclude}
              onChange={() => setAppleMusicInclude((v) => !v)}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>
                <Text fontSize="xs">Include</Text>
              </Checkbox.Label>
            </Checkbox.Root>
          </Flex>
          {!appleMusicLoading && (
            <Flex direction="column" gap={2} opacity={appleMusicInclude ? 1 : 0.4}>
              {appleMusicResults.map((result) => (
                <Flex
                  key={result.id}
                  align="center"
                  gap={3}
                  p={2}
                  borderRadius="md"
                  borderWidth="1px"
                  borderColor={
                    selectedAppleUrl === result.url ? "blue.500" : "border"
                  }
                  cursor={appleMusicInclude ? "pointer" : "default"}
                  onClick={() => appleMusicInclude && setSelectedAppleUrl(result.url)}
                  bg={selectedAppleUrl === result.url ? "blue.subtle" : undefined}
                >
                  {result.artwork && (
                    <Image
                      src={result.artwork.replace("{w}", "40").replace("{h}", "40")}
                      alt={result.title}
                      width="40px"
                      height="40px"
                      borderRadius="sm"
                      flexShrink={0}
                    />
                  )}
                  <Box flex={1} minW={0}>
                    <Text fontSize="sm" fontWeight="medium" lineClamp={1}>
                      {result.title}
                    </Text>
                    <Text fontSize="xs" color="fg.muted" lineClamp={1}>
                      {result.artist} — {result.album}
                      {result.duration
                        ? ` • ${Math.floor(result.duration / 60000)}:${String(
                            Math.floor((result.duration % 60000) / 1000)
                          ).padStart(2, "0")}`
                        : ""}
                    </Text>
                  </Box>
                </Flex>
              ))}
              {appleMusicResults.length === 0 && !appleMusicLoading && !appleMusicError && (
                <Text fontSize="sm" color="fg.muted">
                  No results found
                </Text>
              )}
              {/* Manual search override */}
              <Flex gap={2} mt={1}>
                <Input
                  size="xs"
                  placeholder="Search override..."
                  value={appleMusicSearchQuery}
                  onChange={(e) => setAppleMusicSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && appleMusicSearchQuery.trim()) {
                      runAppleMusicSearch(appleMusicSearchQuery);
                    }
                  }}
                />
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => runAppleMusicSearch(appleMusicSearchQuery || track.title, track.artist)}
                  loading={appleMusicLoading}
                >
                  Search
                </Button>
              </Flex>
            </Flex>
          )}
        </Box>
      )}

      {/* YouTube Section */}
      {enrichmentTypes.youtube && (
        <Box>
          <Separator mb={4} />
          <Flex align="center" justify="space-between" mb={3}>
            <Flex align="center" gap={2}>
              <Text fontWeight="semibold" fontSize="sm">
                YouTube
              </Text>
              {youtubeLoading && <Spinner size="xs" />}
              {youtubeError && (
                <Badge colorPalette="red" size="xs">
                  failed
                </Badge>
              )}
            </Flex>
            <Checkbox.Root
              size="sm"
              checked={youtubeInclude}
              onChange={() => setYoutubeInclude((v) => !v)}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>
                <Text fontSize="xs">Include</Text>
              </Checkbox.Label>
            </Checkbox.Root>
          </Flex>
          {!youtubeLoading && (
            <Flex direction="column" gap={2} opacity={youtubeInclude ? 1 : 0.4}>
              {youtubeResults.map((result) => (
                <Flex
                  key={result.id}
                  align="center"
                  gap={3}
                  p={2}
                  borderRadius="md"
                  borderWidth="1px"
                  borderColor={
                    selectedYoutubeUrl === result.url ? "blue.500" : "border"
                  }
                  cursor={youtubeInclude ? "pointer" : "default"}
                  onClick={() => youtubeInclude && setSelectedYoutubeUrl(result.url ?? "")}
                  bg={selectedYoutubeUrl === result.url ? "blue.subtle" : undefined}
                >
                  {result.thumbnail && (
                    <Image
                      src={result.thumbnail}
                      alt={result.title ?? ""}
                      width="60px"
                      height="40px"
                      objectFit="cover"
                      borderRadius="sm"
                      flexShrink={0}
                    />
                  )}
                  <Box flex={1} minW={0}>
                    <Text fontSize="sm" fontWeight="medium" lineClamp={2}>
                      {result.title}
                    </Text>
                    {result.channel && (
                      <Text fontSize="xs" color="fg.muted">
                        {result.channel}
                      </Text>
                    )}
                  </Box>
                </Flex>
              ))}
              {youtubeResults.length === 0 && !youtubeLoading && !youtubeError && (
                <Text fontSize="sm" color="fg.muted">
                  No results found
                </Text>
              )}

              {/* Discogs videos */}
              {(discogsVideos.length > 0 || !discogsLoaded) && (
                <Box mt={3}>
                  {!discogsLoaded ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      loading={discogsLoading}
                      onClick={loadDiscogsVideos}
                    >
                      Load from Discogs
                    </Button>
                  ) : discogsVideos.length > 0 ? (
                    <>
                      <Text fontSize="xs" color="fg.muted" mb={2}>
                        From Discogs
                      </Text>
                      {discogsVideos.map((v, i) => {
                        const url = (v.uri || v.url) ?? "";
                        return (
                          <Flex
                            key={i}
                            align="center"
                            gap={3}
                            p={2}
                            borderRadius="md"
                            borderWidth="1px"
                            borderColor={selectedYoutubeUrl === url ? "blue.500" : "border"}
                            cursor={youtubeInclude ? "pointer" : "default"}
                            onClick={() => youtubeInclude && setSelectedYoutubeUrl(url)}
                            bg={selectedYoutubeUrl === url ? "blue.subtle" : undefined}
                          >
                            <Box flex={1} minW={0}>
                              <Text fontSize="sm" fontWeight="medium" lineClamp={2}>
                                {v.title || track.title}
                              </Text>
                              <Text fontSize="xs" color="fg.muted" lineClamp={1}>
                                {url}
                              </Text>
                            </Box>
                          </Flex>
                        );
                      })}
                    </>
                  ) : null}
                </Box>
              )}
            </Flex>
          )}
        </Box>
      )}

      {/* Actions */}
      <Separator />
      <Flex justify="flex-end" gap={3} pb={6}>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip
        </Button>
        <Button
          colorPalette="blue"
          size="sm"
          onClick={handleSave}
          loading={isSaving}
        >
          Save & Next
        </Button>
      </Flex>
    </Flex>
  );
}

function descriptorsChanged(before: string[], after: string[]): boolean {
  return before.length !== after.length || before.some((value, i) => value !== after[i]);
}
