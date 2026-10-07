"use client";

import React from "react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import {
  Badge,
  Box,
  Breadcrumb,
  Button,
  Flex,
  Grid,
  Heading,
  Skeleton,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import AlbumResult from "@/components/AlbumResult";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import TrackResultStore from "@/components/TrackResultStore";
import GenreLinkList from "@/components/genres/GenreLinkList";
import PageContainer from "@/components/layout/PageContainer";
import { useGenrePageQuery } from "@/hooks/useGenrePageQuery";
import { genreSearchHref } from "@/lib/genres/links";
import { useUsername } from "@/providers/UsernameProvider";
import type { Album, Track } from "@/types/track";

function Stat({ value, label, detail }: { value: number; label: string; detail: string }) {
  return (
    <Box borderWidth="1px" borderRadius="md" px={4} py={3} minW="160px">
      <Text fontSize="2xl" fontWeight="semibold" lineHeight="short">
        {value.toLocaleString()}
      </Text>
      <Text fontSize="sm">{label}</Text>
      <Text fontSize="xs" color="fg.muted">
        {detail}
      </Text>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box as="section" aria-label={title}>
      <Heading size="sm" mb={3}>
        {title}
      </Heading>
      {children}
    </Box>
  );
}

/** `/genres/<slug>` (#376): a genre's place in the taxonomy and in the collection. */
export default function GenrePage() {
  const slug = decodeURIComponent(useParams<{ slug: string }>().slug);
  const { friend } = useUsername();
  const query = useGenrePageQuery(slug, friend?.id);
  const page = query.data;

  if (query.error) {
    return (
      <PageContainer size="standard">
        <Box borderWidth="1px" borderRadius="md" p={4}>
          <Text fontWeight="medium">Couldn&apos;t load this genre</Text>
          <Text color="fg.muted" mt={1}>
            {query.error.message}
          </Text>
          <Button asChild size="sm" variant="outline" mt={3}>
            <NextLink href="/genres">All genres</NextLink>
          </Button>
        </Box>
      </PageContainer>
    );
  }

  if (!page) {
    return (
      <PageContainer size="standard">
        <VStack align="stretch" gap={3} data-testid="genre-page-loading">
          <Skeleton height="20px" width="200px" />
          <Skeleton height="36px" width="320px" />
          <Skeleton height="80px" />
        </VStack>
      </PageContainer>
    );
  }

  const { genre, counts } = page;

  return (
    <PageContainer size="standard">
      <Stack gap={6}>
        <Box>
          <Breadcrumb.Root size="sm" mb={2}>
            <Breadcrumb.List>
              <Breadcrumb.Item>
                <Breadcrumb.Link asChild>
                  <NextLink href="/genres">Genres</NextLink>
                </Breadcrumb.Link>
              </Breadcrumb.Item>
              {page.ancestors.map((ancestor) => (
                <React.Fragment key={ancestor.id}>
                  <Breadcrumb.Separator />
                  <Breadcrumb.Item>
                    <Breadcrumb.Link asChild>
                      <NextLink href={`/genres/${encodeURIComponent(ancestor.slug)}`}>{ancestor.name}</NextLink>
                    </Breadcrumb.Link>
                  </Breadcrumb.Item>
                </React.Fragment>
              ))}
              <Breadcrumb.Separator />
              <Breadcrumb.Item>
                <Breadcrumb.CurrentLink>{genre.name}</Breadcrumb.CurrentLink>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb.Root>

          <Flex align="center" gap={3} flexWrap="wrap">
            <Heading size="2xl">{genre.name}</Heading>
            {genre.source === "custom" && (
              <Badge variant="outline" title="Added to the taxonomy; not a Discogs genre or style">
                Custom
              </Badge>
            )}
          </Flex>
          {genre.aliases.length > 0 && (
            <Text fontSize="sm" color="fg.muted" mt={1}>
              Also matches {genre.aliases.join(", ")}
            </Text>
          )}

          <Flex gap={2} mt={4} flexWrap="wrap">
            <Button asChild size="sm">
              <NextLink href={genreSearchHref(genre.slug, "tracks")}>Search tracks</NextLink>
            </Button>
            <Button asChild size="sm" variant="outline">
              <NextLink href={genreSearchHref(genre.slug, "albums")}>Search albums</NextLink>
            </Button>
          </Flex>
        </Box>

        <Flex gap={3} flexWrap="wrap">
          <Stat
            value={counts.tracks_total}
            label="Tracks"
            detail={`${counts.tracks.toLocaleString()} tagged ${genre.name} directly`}
          />
          <Stat
            value={counts.albums_total}
            label="Albums"
            detail={`${counts.albums.toLocaleString()} with ${genre.name} on Discogs`}
          />
        </Flex>

        {page.children.length > 0 && (
          <Section title="Subgenres">
            <GenreLinkList genres={page.children} />
          </Section>
        )}

        <Section title="Related genres">
          <GenreLinkList genres={page.related} empty="No related genres in the collection yet." />
        </Section>

        <Section title="Top tracks">
          {page.top_tracks.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              No tracks in this genre yet.
            </Text>
          ) : (
            <Stack gap={0}>
              {page.top_tracks.map((track, index) => (
                <TrackResultStore
                  key={`${track.track_id}:${track.friend_id}`}
                  trackId={track.track_id}
                  friendId={track.friend_id}
                  fallbackTrack={track as unknown as Track}
                  playlistMode={true}
                  showUsername={false}
                  buttons={<TrackActionsMenu track={track as unknown as Track} />}
                  footer={
                    <Flex gap={1} align="center">
                      <Badge colorPalette="blue" size="sm">
                        #{index + 1}
                      </Badge>
                      {track.play_count > 0 && (
                        <Badge variant="outline" size="sm">
                          {track.play_count}× played
                        </Badge>
                      )}
                    </Flex>
                  }
                />
              ))}
            </Stack>
          )}
        </Section>

        <Section title="Top albums">
          {page.top_albums.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              No albums in this genre yet.
            </Text>
          ) : (
            <Grid templateColumns="1fr" gap={2}>
              {page.top_albums.map((album) => (
                <AlbumResult key={`${album.release_id}:${album.friend_id}`} album={album as unknown as Album} compact />
              ))}
            </Grid>
          )}
        </Section>
      </Stack>
    </PageContainer>
  );
}
