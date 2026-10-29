"use client";

import React, { useState } from "react";
import { Button, Stack, Flex } from "@chakra-ui/react";
import { FiCheck } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { toaster } from "@/components/ui/toaster";
import { useCreateAlbumMutation } from "@/hooks/useCreateAlbumMutation";
import { useUsername } from "@/providers/UsernameProvider";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import AlbumForm, { AlbumFormData } from "@/components/AlbumForm";
import CoverArtUpload from "@/components/CoverArtUpload";
import TrackListBuilder, { TrackFormData } from "@/components/TrackListBuilder";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import HeaderCancelButton from "@/components/layout/HeaderCancelButton";

export default function AddAlbumPage() {
  const router = useRouter();
  const createAlbumMutation = useCreateAlbumMutation();
  const { friend: currentUserFriend } = useUsername();
  const { playlistLength } = usePlaybackPlayer();

  const [albumForm, setAlbumForm] = useState<AlbumFormData>({
    title: "",
    artist: "",
    year: "",
    genres: [],
    styles: [],
    album_notes: "",
    album_rating: 0,
    purchase_price: "",
    condition: "",
    label: "",
    catalog_number: "",
    country: "",
    format: "",
    library_identifier: "",
  });

  const [coverArt, setCoverArt] = useState<File | null>(null);

  const [tracks, setTracks] = useState<TrackFormData[]>([{ title: "", artist: "", position: "1" }]);

  // Update track artists when album artist changes
  React.useEffect(() => {
    if (albumForm.artist) {
      setTracks((prev) =>
        prev.map((track) => ({
          ...track,
          artist: track.artist || albumForm.artist,
        })),
      );
    }
  }, [albumForm.artist]);

  const handleSave = async () => {
    // Validate required fields
    if (!albumForm.title.trim()) {
      toaster.create({
        title: "Album title required",
        description: "Please enter an album title",
        type: "error",
      });
      return;
    }

    if (!albumForm.artist.trim()) {
      toaster.create({
        title: "Artist required",
        description: "Please enter an artist name",
        type: "error",
      });
      return;
    }

    // Validate at least one track
    if (tracks.length === 0) {
      toaster.create({
        title: "No tracks",
        description: "Please add at least one track",
        type: "error",
      });
      return;
    }

    // Validate all tracks have title and artist
    for (let i = 0; i < tracks.length; i++) {
      if (!tracks[i].title.trim()) {
        toaster.create({
          title: `Track ${i + 1} missing title`,
          description: "All tracks must have a title",
          type: "error",
        });
        return;
      }
      if (!tracks[i].artist.trim()) {
        toaster.create({
          title: `Track ${i + 1} missing artist`,
          description: "All tracks must have an artist",
          type: "error",
        });
        return;
      }
    }

    // Check if we have a current user
    if (!currentUserFriend) {
      toaster.create({
        title: "No library selected",
        description: "Please select a library from the friend selector",
        type: "error",
      });
      return;
    }

    try {
      await createAlbumMutation.mutateAsync({
        album: {
          title: albumForm.title,
          artist: albumForm.artist,
          year: albumForm.year || undefined,
          genres: albumForm.genres.length > 0 ? albumForm.genres : undefined,
          styles: albumForm.styles.length > 0 ? albumForm.styles : undefined,
          album_rating: albumForm.album_rating || undefined,
          purchase_price: albumForm.purchase_price
            ? parseFloat(albumForm.purchase_price)
            : undefined,
          condition: albumForm.condition || undefined,
          label: albumForm.label || undefined,
          catalog_number: albumForm.catalog_number || undefined,
          country: albumForm.country || undefined,
          format: albumForm.format || undefined,
          library_identifier: albumForm.library_identifier || undefined,
        },
        tracks: tracks.map((track, index) => ({
          title: track.title,
          artist: track.artist || albumForm.artist, // Fall back to album artist
          position: track.position || `${index + 1}`,
          duration_seconds: track.duration_seconds,
          bpm: track.bpm,
          key: track.key,
          notes: track.notes,
          local_tags: track.local_tags,
          star_rating: track.star_rating,
          apple_music_url: track.apple_music_url,
          youtube_url: track.youtube_url,
          soundcloud_url: track.soundcloud_url,
        })),
        friend_id: currentUserFriend.id,
        coverArt: coverArt,
      });

      toaster.create({
        title: "Album created",
        description: `Successfully created "${albumForm.title}" with ${tracks.length} tracks`,
        type: "success",
      });

      // Navigate to albums list
      router.push("/albums");
    } catch (error) {
      toaster.create({
        title: "Failed to create album",
        description: error instanceof Error ? error.message : "An error occurred",
        type: "error",
      });
    }
  };

  const handleCancel = () => {
    router.push("/");
  };

  return (
    <PageContainer size="standard" py={{ base: 0, md: 4 }} mb={playlistLength > 0 ? "120px" : "0"}>
      <PageHeader
        title="Add Album"
        leading={
          <HeaderCancelButton onClick={handleCancel} disabled={createAlbumMutation.isPending} />
        }
        actions={[
          {
            label: "Save Album",
            icon: <FiCheck />,
            onClick: handleSave,
            disabled: createAlbumMutation.isPending,
          },
        ]}
      />
      <Stack gap={6}>
        <AlbumForm value={albumForm} onChange={setAlbumForm} />

        <CoverArtUpload value={coverArt} onChange={setCoverArt} />

        <TrackListBuilder
          tracks={tracks}
          onChange={setTracks}
          defaultArtist={albumForm.artist}
          defaultAlbum={albumForm.title}
        />

        <Flex gap={3} justify="flex-end" pt={4} display={{ base: "none", md: "flex" }}>
          <Button onClick={handleCancel} variant="outline" disabled={createAlbumMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            colorPalette="accent"
            loading={createAlbumMutation.isPending}
          >
            Save Album
          </Button>
        </Flex>
      </Stack>
    </PageContainer>
  );
}
