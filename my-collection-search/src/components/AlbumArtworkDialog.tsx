"use client";

import React from "react";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  Flex,
  Image,
  Portal,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { FiImage, FiRotateCcw, FiUpload } from "react-icons/fi";
import { SiApplemusic } from "react-icons/si";

import CoverArtUpload from "@/components/CoverArtUpload";
import { toaster } from "@/components/ui/toaster";
import { useAlbumArtwork } from "@/hooks/useAlbumArtwork";
import type { AlbumAppleMusicArtPreview } from "@/services/internalApi/albumArtwork";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releaseId: string;
  friendId: number;
  albumTitle?: string;
};

type View =
  | { kind: "overview" }
  | { kind: "apple"; preview: AlbumAppleMusicArtPreview }
  | { kind: "upload" };

export const ART_SOURCE_LABELS: Record<string, string> = {
  discogs: "Discogs",
  apple_music: "Apple Music",
  upload: "Uploaded",
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ArtworkFrame({ src, alt, caption }: { src: string | null; alt: string; caption?: string }) {
  return (
    <Stack gap={1} flex="1" minW={0}>
      <Box
        aspectRatio={1}
        width="100%"
        maxW="360px"
        borderRadius="md"
        overflow="hidden"
        borderWidth="1px"
        bg="bg.subtle"
      >
        {src ? (
          <Image src={src} alt={alt} width="100%" height="100%" objectFit="contain" />
        ) : (
          <Flex align="center" justify="center" height="100%" color="fg.muted">
            <FiImage size={32} />
          </Flex>
        )}
      </Box>
      {caption && (
        <Text fontSize="xs" color="fg.muted">
          {caption}
        </Text>
      )}
    </Stack>
  );
}

/**
 * Change an album's cover (#494): preview the Apple Music art full size before
 * using it, restore the Discogs art, or upload an image. Reachable from the
 * album and track detail views.
 */
export default function AlbumArtworkDialog({
  open,
  onOpenChange,
  releaseId,
  friendId,
  albumTitle,
}: Props) {
  const { artworkQuery, previewMutation, applyMutation, uploadMutation } = useAlbumArtwork(
    releaseId,
    friendId,
    open
  );
  const [view, setView] = React.useState<View>({ kind: "overview" });
  const [file, setFile] = React.useState<File | null>(null);

  // Nothing inside opens the dialog, so a change of open state is always a close.
  const close = () => {
    setView({ kind: "overview" });
    setFile(null);
    onOpenChange(false);
  };

  const state = artworkQuery.data;
  const busy = previewMutation.isPending || applyMutation.isPending || uploadMutation.isPending;

  const done = (title: string) => {
    toaster.create({ title, type: "success" });
    close();
  };
  const failed = (title: string) => (error: unknown) =>
    toaster.create({ title, description: errorText(error), type: "error" });

  const handlePreview = () => {
    previewMutation.mutate(undefined, {
      onSuccess: (preview) => setView({ kind: "apple", preview }),
      onError: failed("No Apple Music artwork"),
    });
  };

  const handleUseApple = () =>
    applyMutation.mutate("apple_music", {
      onSuccess: () => done("Apple Music artwork applied"),
      onError: failed("Could not apply Apple Music artwork"),
    });

  const handleRestoreDiscogs = () =>
    applyMutation.mutate("discogs", {
      onSuccess: () => done("Discogs artwork restored"),
      onError: failed("Could not restore Discogs artwork"),
    });

  const handleUpload = (selected: File) => {
    uploadMutation.mutate(selected, {
      onSuccess: () => done("Cover art uploaded"),
      onError: failed("Upload failed"),
    });
  };

  const sourceLabel = state?.source ? ART_SOURCE_LABELS[state.source] : "Discogs (default)";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={close}
      size={{ base: "full", md: "lg" }}
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Cover Art{albumTitle ? ` — ${albumTitle}` : ""}</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body pb={6}>
              {!state ? (
                artworkQuery.error ? (
                  <Text color="fg.error">{errorText(artworkQuery.error)}</Text>
                ) : (
                  <Flex justify="center" py={8}>
                    <Spinner />
                  </Flex>
                )
              ) : view.kind === "apple" ? (
                <Stack gap={4}>
                  <Text fontSize="sm" color="fg.muted">
                    Apple Music art comes from the digital release, which is not always the
                    pressing you own. Check it is the same cover before using it.
                  </Text>
                  <Flex gap={4} direction={{ base: "column", sm: "row" }}>
                    <ArtworkFrame src={state.current_url} alt="Current cover" caption={`Current · ${sourceLabel}`} />
                    <ArtworkFrame
                      src={view.preview.url}
                      alt="Apple Music cover"
                      caption={`Apple Music · ${view.preview.width}×${view.preview.height}`}
                    />
                  </Flex>
                </Stack>
              ) : view.kind === "upload" ? (
                <CoverArtUpload value={file} onChange={setFile} label="Upload a cover image" />
              ) : (
                <Stack gap={4}>
                  <Flex gap={4} direction={{ base: "column", sm: "row" }} align={{ sm: "flex-start" }}>
                    <ArtworkFrame src={state.current_url} alt="Current cover" />
                    <Stack gap={3} flex="1">
                      <Flex gap={2} align="center" flexWrap="wrap">
                        <Text fontSize="sm" fontWeight="medium">Source</Text>
                        <Badge variant="subtle">{sourceLabel}</Badge>
                      </Flex>
                      {state.art_match_status === "mismatch" && (
                        <Text fontSize="xs" color="fg.warning">
                          Bulk matching found Apple Music art that looks different from the
                          Discogs cover — possibly another pressing. Preview it to decide.
                        </Text>
                      )}
                      <Button
                        variant="outline"
                        justifyContent="flex-start"
                        onClick={handlePreview}
                        loading={previewMutation.isPending}
                        disabled={busy || !state.has_local_audio}
                      >
                        <SiApplemusic /> Preview Apple Music art
                      </Button>
                      {!state.has_local_audio && (
                        <Text fontSize="xs" color="fg.muted" mt={-2}>
                          Needs a downloaded track with embedded artwork.
                        </Text>
                      )}
                      {state.discogs_art_url && (
                        <Button
                          variant="outline"
                          justifyContent="flex-start"
                          onClick={handleRestoreDiscogs}
                          loading={applyMutation.isPending}
                          disabled={busy || state.source === "discogs"}
                        >
                          <FiRotateCcw /> Restore Discogs art
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        justifyContent="flex-start"
                        onClick={() => setView({ kind: "upload" })}
                        disabled={busy}
                      >
                        <FiUpload /> Upload image…
                      </Button>
                    </Stack>
                  </Flex>
                </Stack>
              )}
            </Dialog.Body>
            {view.kind !== "overview" && (
              <Dialog.Footer>
                <Button variant="outline" onClick={() => setView({ kind: "overview" })} disabled={busy}>
                  Back
                </Button>
                {view.kind === "apple" ? (
                  <Button onClick={handleUseApple} loading={applyMutation.isPending}>
                    Use Apple Music art
                  </Button>
                ) : (
                  file && (
                    <Button onClick={() => handleUpload(file)} loading={uploadMutation.isPending}>
                      Use this image
                    </Button>
                  )
                )}
              </Dialog.Footer>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
