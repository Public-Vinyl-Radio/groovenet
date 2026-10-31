"use client";

import React, { Suspense, useMemo, useState } from "react";
import NextLink from "next/link";
import {
  Box,
  Flex,
  HStack,
  Link,
  Text,
  IconButton,
  VStack,
  Drawer,
  Icon,
  Portal,
  Button,
  Stack,
  CloseButton,
} from "@chakra-ui/react";
import { Tooltip } from "@/components/ui/tooltip";
import {
  FiChevronLeft,
  FiChevronRight,
  FiSearch,
  FiSpeaker,
  FiDisc,
  FiMoreHorizontal,
  FiCode,
  FiDroplet,
  FiHome,
} from "react-icons/fi";
import { TbPlaylist } from "react-icons/tb";
import { LuCloudDownload, LuTags } from "react-icons/lu";
import { IoBookSharp, IoMusicalNotes, IoSettings, IoAlbums } from "react-icons/io5";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCommandPalette } from "@/providers/CommandPaletteProvider";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import CommandPalette from "@/components/CommandPalette";
import { useRootFlag } from "@/hooks/useRootFlag";
import { usePlaybackTargetLabel } from "@/components/player/PlaybackOutput";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";

const baseMenuItems = [
  { href: "/", label: "Home" },
  { href: "/tracks", label: "Tracks" },
  { href: "/albums", label: "Albums" },
  { href: "/genres", label: "Genres" },
  { href: "/spins", label: "Spins" },
  { href: "/playlists", label: "Playlists" },
  { href: "/jobs", label: "Jobs" },
  { href: "/chore", label: "Chores" },
  { href: "/settings", label: "Settings" },
];

function getItemIcon(href: string) {
  if (href === "/") return FiHome;
  if (href === "/tracks") return IoMusicalNotes;
  if (href === "/albums") return IoAlbums;
  if (href === "/genres") return LuTags;
  if (href === "/spins") return FiDisc;
  if (href === "/settings") return IoSettings;
  if (href === "/playlists") return TbPlaylist;
  if (href === "/jobs") return LuCloudDownload;
  if (href === "/chore") return FiDroplet;
  if (href === "/developer") return FiCode;
  return IoBookSharp;
}

function isActiveRoute(currentPath: string, href: string) {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

function isMobileFullscreenEditRoute(pathname: string) {
  return (
    (pathname.startsWith("/tracks/") || pathname.startsWith("/albums/")) &&
    pathname.endsWith("/edit")
  );
}

export default function AppShell({
  children,
  developerToolsEnabled,
}: {
  children: React.ReactNode;
  developerToolsEnabled: boolean;
}) {
  const CONTENT_MAX_W = "1360px";
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const standalone = useStandaloneMode();
  const { distance, refreshing } = usePullToRefresh(standalone);
  const current = useMemo(() => {
    if (!pathname) return "";
    if (pathname === "/") return "/";
    return pathname.split("?")[0];
  }, [pathname]);
  const isFullscreenEditMobile = isMobileFullscreenEditRoute(current);
  // Feeds --tabbar-h / --chrome-bottom (houseStyle globalCss).
  useRootFlag("data-tabbar-hidden", isFullscreenEditMobile);
  const menuItems = useMemo(
    () =>
      developerToolsEnabled
        ? [...baseMenuItems, { href: "/developer", label: "Developer" }]
        : baseMenuItems,
    [developerToolsEnabled],
  );
  const primaryMobileMenuItems = menuItems.slice(0, 5);
  const secondaryMobileMenuItems = menuItems.slice(5);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const playbackLabel = usePlaybackTargetLabel();
  const openPlaybackDialog = usePlaybackTargetDialog((s) => s.setOpen);
  const { setPaletteOpen } = useCommandPalette();

  React.useEffect(() => {
    if (!standalone) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void queryClient.invalidateQueries();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [queryClient, standalone]);

  // Keep initial render deterministic across SSR/CSR; hydrate from storage after mount.
  const [isExpanded, setIsExpanded] = useState(false);
  const sidebarWidth = isExpanded ? "220px" : "64px";

  React.useEffect(() => {
    const saved = localStorage.getItem("sidebar-expanded");
    if (!saved) return;
    try {
      setIsExpanded(Boolean(JSON.parse(saved)));
    } catch {
      // ignore invalid stored value
    }
  }, []);

  // Save sidebar state to localStorage when it changes
  React.useEffect(() => {
    localStorage.setItem("sidebar-expanded", JSON.stringify(isExpanded));
  }, [isExpanded]);

  return (
    <Flex minH="100vh" bg="bg">
      {/* Opaque cap under the translucent iOS status bar (black-translucent), so
          scrolling content never blurs behind it. No backdrop-filter, on purpose. */}
      <Box
        aria-hidden
        data-testid="status-bar-strip"
        position="fixed"
        top={0}
        left={0}
        right={0}
        h="var(--safe-top)"
        bg="bg"
        zIndex={95}
        pointerEvents="none"
      />
      <PullToRefreshIndicator distance={distance} refreshing={refreshing} />
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
      {/* Desktop sidebar */}
      <Box
        display={{ base: "none", md: "block" }}
        position="fixed"
        top={0}
        // Ends on the docked player bar, which runs the full width under it.
        bottom="var(--player-h)"
        left={0}
        w={sidebarWidth}
        transition="width 0.18s ease"
        borderRightWidth="outline"
        borderColor="border.ink"
        bg="bg"
      >
        <Flex direction="column" h="100%" py={3} gap={2}>
          <Flex
            px={isExpanded ? 3 : 2}
            // justify="space-between"
            gap={2}
          >
            <HStack>
              {isExpanded && (
                <Text fontFamily="heading" fontWeight="bold" fontSize="xl" letterSpacing="0.01em">
                  GrooveNet
                </Text>
              )}
            </HStack>

            <Tooltip
              content={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
              disabled={false}
              openDelay={250}
            >
              <IconButton
                aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
                size="xs"
                variant="outline"
                minW="auto"
                px={1}
                onClick={() => setIsExpanded((v: boolean) => !v)}
              >
                {isExpanded ? <FiChevronLeft /> : <FiChevronRight />}
              </IconButton>
            </Tooltip>
          </Flex>

          <VStack align="stretch" gap={1} mt={2} px={isExpanded ? 2 : 1}>
            {isExpanded ? (
              <Box
                as="button"
                onClick={() => setPaletteOpen(true)}
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                px={3}
                py="7px"
                w="100%"
                borderRadius="md"
                bg="bg.subtle"
                border="1px solid"
                borderColor="border"
                cursor="pointer"
                color="fg.muted"
                fontSize="sm"
                mb={1}
                _hover={{ bg: "bg.muted" }}
              >
                <HStack gap={2}>
                  <Icon as={FiSearch} boxSize={4} />
                  <Text fontSize="xs" color="fg.muted">
                    Search…
                  </Text>
                </HStack>
                <HStack gap={1}>
                  <Box
                    as="span"
                    fontSize="10px"
                    px="4px"
                    py="1px"
                    borderRadius="md"
                    bg="bg"
                    border="1px solid"
                    borderColor="border"
                    color="fg.muted"
                    fontWeight="500"
                    lineHeight="1.4"
                  >
                    ⌘K
                  </Box>
                </HStack>
              </Box>
            ) : (
              <Tooltip content="Search  ⌘K" openDelay={250}>
                <IconButton
                  aria-label="Open command palette"
                  size="sm"
                  variant="ghost"
                  mb={1}
                  onClick={() => setPaletteOpen(true)}
                >
                  <Icon as={FiSearch} boxSize={5} color="fg.muted" />
                </IconButton>
              </Tooltip>
            )}
            {menuItems.map((item) => {
              const active = isActiveRoute(current, item.href);
              const ItemIcon = getItemIcon(item.href);
              return (
                <Tooltip key={item.href} content={item.label} disabled={isExpanded} openDelay={250}>
                  <Link
                    as={NextLink}
                    href={item.href}
                    _hover={{ textDecoration: "none", bg: "bg.subtle" }}
                    px={isExpanded ? 3 : 2}
                    py={2}
                    borderWidth="outline"
                    borderColor={active ? "border.ink" : "transparent"}
                    bg={active ? "bg.subtle" : undefined}
                    title={item.label}
                    display="flex"
                    alignItems="center"
                    justifyContent={isExpanded ? "flex-start" : "center"}
                  >
                    <HStack
                      gap={isExpanded ? 3 : 0}
                      align="center"
                      w="100%"
                      justify={isExpanded ? "flex-start" : "center"}
                    >
                      <Icon as={ItemIcon} boxSize={5} color={active ? "accent.fg" : "fg.muted"} />
                      {isExpanded && (
                        <Text
                          fontFamily="label"
                          fontWeight={active ? "semibold" : "normal"}
                          fontSize="xs"
                          letterSpacing="0.06em"
                          textTransform="uppercase"
                        >
                          {item.label}
                        </Text>
                      )}
                    </HStack>
                  </Link>
                </Tooltip>
              );
            })}
          </VStack>

          <Box mt="auto" px={isExpanded ? 2 : 1} pb={2}>
            {playbackLabel !== null && (
              <Tooltip content={`Playback: ${playbackLabel}`} disabled={isExpanded} openDelay={250}>
                <Button
                  variant="ghost"
                  size="sm"
                  w="100%"
                  minW={0}
                  px={isExpanded ? 3 : 2}
                  justifyContent={isExpanded ? "flex-start" : "center"}
                  aria-label={`Playback: ${playbackLabel}`}
                  onClick={() => openPlaybackDialog(true)}
                >
                  <Icon as={FiSpeaker} boxSize={5} color="fg.muted" />
                  {isExpanded && (
                    <Text
                      truncate
                      fontFamily="label"
                      fontSize="xs"
                      letterSpacing="0.06em"
                      textTransform="uppercase"
                    >
                      {playbackLabel}
                    </Text>
                  )}
                </Button>
              </Tooltip>
            )}
          </Box>
        </Flex>
      </Box>

      {/* Mobile More sheet */}
      <Portal>
        <Drawer.Root
          open={drawerOpen}
          onOpenChange={(e) => setDrawerOpen(e.open)}
          placement="bottom"
        >
          <Drawer.Backdrop bg="overlay.backdrop" />
          <Drawer.Positioner paddingTop={0} paddingBottom="calc(var(--tabbar-h) + 16px)">
            <Drawer.Content mx={4} borderWidth="outline" borderColor="border.ink" boxShadow="md">
              <Drawer.Header borderBottomWidth="1px" py={3} px={5} position="relative">
                <Box
                  position="absolute"
                  top={2}
                  left="50%"
                  transform="translateX(-50%)"
                  w="40px"
                  h="4px"
                  borderRadius="full"
                  bg="overlay.backdrop"
                />
                <Box pr={8}>
                  <Text fontWeight="semibold" fontSize="sm">
                    More
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    Navigation and tools
                  </Text>
                </Box>
                <Drawer.CloseTrigger asChild>
                  <CloseButton
                    size="sm"
                    position="absolute"
                    right={3}
                    top="50%"
                    transform="translateY(-50%)"
                  />
                </Drawer.CloseTrigger>
              </Drawer.Header>
              <Drawer.Body p={0}>
                <Stack gap={0} py={2}>
                  {secondaryMobileMenuItems.map((item) => {
                    const active = isActiveRoute(current, item.href);
                    const ItemIcon = getItemIcon(item.href);
                    return (
                      <Link
                        key={item.href}
                        as={NextLink}
                        href={item.href}
                        onClick={() => setDrawerOpen(false)}
                        _hover={{ textDecoration: "none", bg: "bg.subtle" }}
                        px={5}
                        py={3.5}
                        bg={active ? "bg.subtle" : undefined}
                      >
                        <HStack gap={3} align="center">
                          <Icon
                            as={ItemIcon}
                            boxSize={5}
                            color={active ? "accent.fg" : "fg.muted"}
                          />
                          <Text fontWeight={active ? "bold" : "normal"}>{item.label}</Text>
                        </HStack>
                      </Link>
                    );
                  })}
                  {playbackLabel !== null && (
                    <Box
                      as="button"
                      onClick={() => {
                        openPlaybackDialog(true);
                        setDrawerOpen(false);
                      }}
                      textAlign="left"
                      px={5}
                      py={3.5}
                      _hover={{ bg: "bg.subtle" }}
                    >
                      <HStack gap={3} align="center">
                        <Icon as={FiSpeaker} boxSize={5} color="fg.muted" />
                        <Text>Playback: {playbackLabel}</Text>
                      </HStack>
                    </Box>
                  )}
                  <Box
                    as="button"
                    onClick={() => {
                      setPaletteOpen(true);
                      setDrawerOpen(false);
                    }}
                    textAlign="left"
                    px={5}
                    py={3.5}
                    _hover={{ bg: "bg.subtle" }}
                  >
                    <HStack gap={3} align="center">
                      <Icon as={FiSearch} boxSize={5} color="fg.muted" />
                      <Text>Search</Text>
                    </HStack>
                  </Box>
                </Stack>
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Positioner>
        </Drawer.Root>
      </Portal>

      {/* Mobile bottom navigation */}
      <Box
        display={
          isFullscreenEditMobile ? { base: "none", md: "none" } : { base: "block", md: "none" }
        }
        position="fixed"
        left={0}
        right={0}
        bottom={0}
        zIndex={90}
        opacity={drawerOpen ? 0 : 1}
        transform={drawerOpen ? "translateY(12px)" : "translateY(0)"}
        transition="opacity 0.18s ease, transform 0.18s ease"
        pointerEvents={drawerOpen ? "none" : "auto"}
      >
        <Flex
          data-testid="mobile-tab-bar"
          align="center"
          justify="space-between"
          gap={1}
          // Edge to edge: a 2px ink rule on top, no box or shadow. The 56px row
          // keeps clear of the rounded corners (side inset) and the home
          // indicator (bottom inset) without shrinking the touch targets.
          h="var(--tabbar-h)"
          paddingBottom="var(--safe-bottom)"
          pl="max(16px, env(safe-area-inset-left, 0px))"
          pr="max(16px, env(safe-area-inset-right, 0px))"
          boxSizing="border-box"
          borderTopWidth="outline"
          borderColor="border.ink"
          bg="bg"
        >
          {primaryMobileMenuItems.map((item) => {
            const active = isActiveRoute(current, item.href);
            const ItemIcon = getItemIcon(item.href);
            return (
              <Link
                key={item.href}
                as={NextLink}
                href={item.href}
                flex="1 1 0"
                _hover={{ textDecoration: "none" }}
              >
                <VStack
                  gap={1}
                  py={1.5}
                  px={1}
                  borderWidth="outline"
                  borderColor={active ? "border.ink" : "transparent"}
                  bg={active ? "bg.subtle" : "transparent"}
                >
                  <Icon as={ItemIcon} boxSize={5} color={active ? "accent.fg" : "fg.muted"} />
                  <Text
                    fontFamily="label"
                    fontSize="xs"
                    fontWeight={active ? "semibold" : "medium"}
                    color={active ? "fg" : "fg.muted"}
                    lineHeight="1"
                  >
                    {item.label}
                  </Text>
                </VStack>
              </Link>
            );
          })}

          <Button
            variant="ghost"
            onClick={() => setDrawerOpen(true)}
            flex="1 1 0"
            h="auto"
            py={1.5}
            px={1}
            borderWidth="outline"
            borderColor="transparent"
          >
            <VStack gap={1}>
              <Icon as={FiMoreHorizontal} boxSize={5} color="fg.muted" />
              <Text
                fontFamily="label"
                fontSize="xs"
                fontWeight="medium"
                color="fg.muted"
                lineHeight="1"
              >
                More
              </Text>
            </VStack>
          </Button>
        </Flex>
      </Box>

      {/* Main content */}
      <Box
        flex="1"
        minW={0}
        // The sidebar is fixed, out of flow, so the content makes room for it.
        ml={{ base: 0, md: sidebarWidth }}
        transition="margin-left 0.18s ease"
        px={{ base: 4, md: 6 }}
        // Room for the desktop queue panel while it is open (--queue-w is 0 otherwise).
        pr={{ md: "calc(var(--chakra-spacing-6) + var(--queue-w))" }}
        // The last rows scroll clear of both bars: the status-bar strip above and
        // the bottom chrome (tab bar + player) below.
        pt={{ base: "var(--content-pt)", md: 6 }}
        pb={{ base: "calc(var(--chrome-bottom) + 16px)", md: "calc(var(--chrome-bottom) + 24px)" }}
      >
        <Box w="full" maxW={CONTENT_MAX_W} mx="auto">
          {children}
        </Box>
      </Box>
    </Flex>
  );
}
