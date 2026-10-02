"use client";

import React, { useState } from "react";
import {
  Button,
  Menu,
  Portal,
  Drawer,
  Box,
  Stack,
  CloseButton,
  Link,
  Icon,
  Text,
} from "@chakra-ui/react";
import { FiDownload, FiDroplet, FiEdit, FiFileText, FiMoreVertical, FiPlay, FiZap } from "react-icons/fi";
import { SiDiscogs } from "react-icons/si";
import NextLink from "next/link";
import { menuDivider, drawerDivider, DrawerItem } from "@/components/ui/action-menu-primitives";

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
  discogsUrl?: string;
  onViewRawDiscogs?: () => void;
  editAlbumHref?: string;
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
  discogsUrl,
  onViewRawDiscogs,
  editAlbumHref,
}: AlbumActionsMenuProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const close = () => setDrawerOpen(false);

  const hasAlbumActions = !!onPlayAlbum || !!onDownloadMissing || !!onEnrichAlbum || !!onLogCare;
  const hasDiscogs = !!discogsUrl || !!onViewRawDiscogs;
  const hasEdit = !!editAlbumHref;

  return (
    <>
      {/* Mobile: bottom sheet */}
      <Box display={{ base: "block", md: "none" }}>
        <Button size="sm" variant="ghost" aria-label="Album actions" px={2} onClick={() => setDrawerOpen(true)}>
          <FiMoreVertical />
        </Button>
        <Drawer.Root placement="bottom" open={drawerOpen} onOpenChange={(d) => setDrawerOpen(d.open)}>
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content borderTopRadius="xl" maxH="85vh">
                <Drawer.Header borderBottomWidth="1px" py={3} px={5} position="relative">
                  <Box pr={8}>
                    {albumArtist && <Text fontSize="xs" color="fg.muted">{albumArtist}</Text>}
                    <Text fontWeight="semibold" fontSize="sm" lineClamp={1}>
                      {albumTitle ?? "Album Actions"}
                    </Text>
                  </Box>
                  <Drawer.CloseTrigger asChild>
                    <CloseButton size="sm" position="absolute" right={3} top="50%" transform="translateY(-50%)" />
                  </Drawer.CloseTrigger>
                </Drawer.Header>
                <Drawer.Body p={0} overflowY="auto">
                  <Stack gap={0}>
                    {hasAlbumActions && (
                      <>
                        {onPlayAlbum && (
                          <DrawerItem icon={<FiPlay />} label="Play Album" onClick={() => { onPlayAlbum(); close(); }} />
                        )}
                        {onDownloadMissing && (
                          <DrawerItem
                            icon={<FiDownload />}
                            label={isDownloading ? "Downloading..." : "Download Missing"}
                            disabled={isDownloading}
                            onClick={() => { onDownloadMissing(); close(); }}
                          />
                        )}
                        {onEnrichAlbum && (
                          <DrawerItem
                            icon={<FiZap />}
                            label={isEnriching ? "Opening Enrichment..." : "Enrich Album"}
                            disabled={isEnriching}
                            onClick={() => { onEnrichAlbum(); close(); }}
                          />
                        )}
                        {onLogCare && (
                          <DrawerItem icon={<FiDroplet />} label="Log Care..." onClick={() => { onLogCare(); close(); }} />
                        )}
                        {(hasDiscogs || hasEdit) && drawerDivider}
                      </>
                    )}
                    {hasDiscogs && (
                      <>
                        {discogsUrl && (
                          <DrawerItem icon={<Icon as={SiDiscogs} />} label="View on Discogs" href={discogsUrl} external />
                        )}
                        {onViewRawDiscogs && (
                          <DrawerItem icon={<FiFileText />} label="View Raw Discogs File" onClick={() => { onViewRawDiscogs(); close(); }} />
                        )}
                        {hasEdit && drawerDivider}
                      </>
                    )}
                    {editAlbumHref && (
                      <DrawerItem icon={<FiEdit />} label="Edit Album & Tracks" href={editAlbumHref} />
                    )}
                  </Stack>
                </Drawer.Body>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
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
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>
      </Box>
    </>
  );
}
