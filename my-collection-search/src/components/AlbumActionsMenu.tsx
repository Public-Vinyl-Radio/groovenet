"use client";

import React, { useState } from "react";
import {
  Button,
  Menu,
  Box,
  Image,
  Link,
  Icon,
  Text,
} from "@chakra-ui/react";
import { FiDownload, FiDroplet, FiEdit, FiFileText, FiImage, FiMoreVertical, FiPlay, FiTrash2, FiZap } from "react-icons/fi";
import { SiDiscogs } from "react-icons/si";
import NextLink from "next/link";
import { menuDivider } from "@/components/ui/action-menu-primitives";
import RetroDialog, { RetroDialogTitle } from "@/components/ui/RetroDialog";
import { Group, TileRow, overline, type ModalAction, type ModalTile } from "@/components/ui/RetroModalParts";

export interface AlbumActionsMenuProps {
  albumTitle?: string;
  albumArtist?: string;
  onPlayAlbum?: () => void;
  onDownloadMissing?: () => void;
  isDownloading?: boolean;
  onEnrichAlbum?: () => void;
  isEnriching?: boolean;
  /** Log a cleaning, sleeve change, inspection or repair (#262). */
  onLogCare?: () => void;
  /** Preview, restore or upload the album's cover art (#494). */
  onChangeArtwork?: () => void;
  discogsUrl?: string;
  onViewRawDiscogs?: () => void;
  editAlbumHref?: string;
  /** Permanently delete the album and its tracks (#511). */
  onDeleteAlbum?: () => void;
  /** Thumbnail in the phone modal's label strip. */
  coverUrl?: string;
  /** Mono line above the title in the phone modal, e.g. `Album · Vinyl · LP-349`. */
  catalogue?: string;
  /** Under the title in the phone modal; defaults to the artist. */
  subtitle?: string;
  /** A 44px outline trigger, for the phone's top bar. */
  prominent?: boolean;
}


export default function AlbumActionsMenu({
  albumTitle,
  albumArtist,
  onPlayAlbum,
  onDownloadMissing,
  isDownloading,
  onEnrichAlbum,
  isEnriching,
  onLogCare,
  onChangeArtwork,
  discogsUrl,
  onViewRawDiscogs,
  editAlbumHref,
  onDeleteAlbum,
  prominent = false,
  coverUrl,
  catalogue,
  subtitle,
}: AlbumActionsMenuProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const close = () => setDrawerOpen(false);

  const tiles: ModalTile[] = [
    ...(onPlayAlbum
      ? [{ label: "Play", icon: <FiPlay fill="currentColor" />, solid: true, onClick: onPlayAlbum }]
      : []),
    ...(onLogCare ? [{ label: "Log care", icon: <FiDroplet />, onClick: onLogCare }] : []),
    ...(editAlbumHref ? [{ label: "Edit", icon: <FiEdit />, href: editAlbumHref }] : []),
  ];
  const library: ModalAction[] = [
    ...(onEnrichAlbum
      ? [{ label: isEnriching ? "Opening enrichment..." : "Enrich album", onClick: onEnrichAlbum, disabled: isEnriching }]
      : []),
    ...(onChangeArtwork ? [{ label: "Cover art", onClick: onChangeArtwork }] : []),
    ...(onDownloadMissing
      ? [{ label: isDownloading ? "Downloading..." : "Download missing audio", onClick: onDownloadMissing, disabled: isDownloading }]
      : []),
  ];
  const discogs: ModalAction[] = [
    ...(discogsUrl ? [{ label: "View on Discogs", href: discogsUrl, external: true }] : []),
    ...(onViewRawDiscogs ? [{ label: "View raw Discogs file", onClick: onViewRawDiscogs }] : []),
  ];
  const danger: ModalAction[] = onDeleteAlbum ? [{ label: "Delete album", onClick: onDeleteAlbum }] : [];

  const hasAlbumActions =
    !!onPlayAlbum || !!onDownloadMissing || !!onEnrichAlbum || !!onLogCare || !!onChangeArtwork;
  const hasDiscogs = !!discogsUrl || !!onViewRawDiscogs;
  const hasEdit = !!editAlbumHref;
  const hasDelete = !!onDeleteAlbum;

  return (
    <>
      {/* Mobile: centred retro modal (#751) */}
      <Box display={{ base: "block", md: "none" }}>
        <Button
          size="sm"
          variant={prominent ? "outline" : "ghost"}
          aria-label="Album actions"
          px={2}
          {...(prominent ? { boxSize: "44px" } : {})}
          onClick={() => setDrawerOpen(true)}
        >
          <FiMoreVertical />
        </Button>
        <RetroDialog
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          header={
            <>
              <Box
                boxSize="52px"
                flexShrink={0}
                borderWidth="outline"
                borderColor="bg"
                bg="fg.muted"
                overflow="hidden"
              >
                {coverUrl && <Image src={coverUrl} alt="" boxSize="full" objectFit="cover" />}
              </Box>
              <Box flex="1" minW={0}>
                <Text {...overline} fontSize="11px" lineHeight="14px" opacity={0.8} lineClamp={1}>
                  {catalogue ?? "Album"}
                </Text>
                <RetroDialogTitle fontSize="16px" lineHeight="22px" fontWeight="semibold" lineClamp={1}>
                  {albumTitle ?? "Album actions"}
                </RetroDialogTitle>
                {(subtitle ?? albumArtist) && (
                  <Text fontSize="13px" lineHeight="18px" opacity={0.8} lineClamp={1}>
                    {subtitle ?? albumArtist}
                  </Text>
                )}
              </Box>
            </>
          }
        >
          {tiles.length > 0 && <TileRow tiles={tiles} onDone={close} />}
          <Group label="Library" actions={library} onDone={close} />
          <Group label="Discogs" actions={discogs} onDone={close} />
          <Group label="Danger" actions={danger} danger onDone={close} />
        </RetroDialog>
      </Box>

      {/* Desktop: dropdown menu */}
      <Box display={{ base: "none", md: "block" }}>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button size="sm" variant="outline" aria-label="Album actions" px={2}>
              <FiMoreVertical />
            </Button>
          </Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content>
              {onPlayAlbum && (
                <Menu.Item value="play" onSelect={onPlayAlbum}>
                  <FiPlay /> Play Album
                </Menu.Item>
              )}
              {onDownloadMissing && (
                <Menu.Item value="download" onSelect={onDownloadMissing} disabled={isDownloading}>
                  <FiDownload /> {isDownloading ? "Downloading..." : "Download Missing"}
                </Menu.Item>
              )}
              {onEnrichAlbum && (
                <Menu.Item value="enrich-album" onSelect={onEnrichAlbum} disabled={isEnriching}>
                  <FiZap /> {isEnriching ? "Opening Enrichment..." : "Enrich Album"}
                </Menu.Item>
              )}
              {onLogCare && (
                <Menu.Item value="log-care" onSelect={onLogCare}>
                  <FiDroplet /> Log Care...
                </Menu.Item>
              )}
              {onChangeArtwork && (
                <Menu.Item value="cover-art" onSelect={onChangeArtwork}>
                  <FiImage /> Cover Art...
                </Menu.Item>
              )}
              {hasAlbumActions && (hasDiscogs || hasEdit) && menuDivider}
              {discogsUrl && (
                <Menu.Item value="discogs" asChild>
                  <Link href={discogsUrl} target="_blank" rel="noopener noreferrer">
                    <Icon as={SiDiscogs} /> View on Discogs
                  </Link>
                </Menu.Item>
              )}
              {onViewRawDiscogs && (
                <Menu.Item value="discogs-raw" onSelect={onViewRawDiscogs}>
                  <FiFileText /> View Raw Discogs File
                </Menu.Item>
              )}
              {hasDiscogs && hasEdit && menuDivider}
              {editAlbumHref && (
                <Menu.Item value="edit-album" asChild>
                  <Link as={NextLink} href={editAlbumHref}>
                    <FiEdit /> Edit Album & Tracks
                  </Link>
                </Menu.Item>
              )}
              {(hasAlbumActions || hasDiscogs || hasEdit) && hasDelete && menuDivider}
              {onDeleteAlbum && (
                <Menu.Item
                  value="delete-album"
                  onSelect={onDeleteAlbum}
                  color="fg.error"
                  _hover={{ bg: "bg.error", color: "fg.error" }}
                >
                  <FiTrash2 /> Delete Album...
                </Menu.Item>
              )}
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>
      </Box>
    </>
  );
}
