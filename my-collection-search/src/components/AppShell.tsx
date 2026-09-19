"use client";

import React, { useMemo, useState } from "react";
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
import { FiChevronLeft, FiChevronRight, FiSearch, FiDisc, FiMoreHorizontal, FiCode } from "react-icons/fi";
import { TbPlaylist } from "react-icons/tb";
import { LuCloudDownload } from "react-icons/lu";
import {
  IoBookSharp,
  IoMusicalNotes,
  IoSettings,
  IoAlbums,
} from "react-icons/io5";
import { usePathname } from "next/navigation";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { useCommandPalette } from "@/providers/CommandPaletteProvider";
import CommandPalette from "@/components/CommandPalette";
import {
  getMobileBottomOverlayOffset,
  MOBILE_NAV_BOTTOM_OFFSET,
} from "@/lib/mobileLayout";

const baseMenuItems = [
  { href: "/", label: "Tracks" },
  { href: "/albums", label: "Albums" },
  { href: "/spins", label: "Spins" },
  { href: "/playlists", label: "Playlists" },
  { href: "/jobs", label: "Jobs" },
  { href: "/settings", label: "Settings" },
];

function getItemIcon(href: string) {
  if (href === "/") return IoMusicalNotes;
  if (href === "/albums") return IoAlbums;
  if (href === "/spins") return FiDisc;
  if (href === "/settings") return IoSettings;
  if (href === "/playlists") return TbPlaylist;
  if (href === "/jobs") return LuCloudDownload;
  if (href === "/developer") return FiCode;
  return IoBookSharp;
}

function isActiveRoute(currentPath: string, href: string) {
  if (href === "/") {
    return currentPath === "/" || currentPath.startsWith("/tracks");
  }
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
  const { playlistLength } = usePlaylistPlayer();
  const mobileDrawerBottomPadding = "80px";
  const mobileContentBottomPadding = getMobileBottomOverlayOffset(playlistLength);
  const current = useMemo(() => {
    if (!pathname) return "";
    if (pathname === "/") return "/";
    return pathname.split("?")[0];
  }, [pathname]);
  const isFullscreenEditMobile = isMobileFullscreenEditRoute(current);
  const menuItems = useMemo(
    () => developerToolsEnabled
      ? [...baseMenuItems, { href: "/developer", label: "Developer" }]
      : baseMenuItems,
    [developerToolsEnabled],
  );
  const primaryMobileMenuItems = menuItems.slice(0, 4);
  const secondaryMobileMenuItems = menuItems.slice(4);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const { setPaletteOpen } = useCommandPalette();

  // Keep initial render deterministic across SSR/CSR; hydrate from storage after mount.
  const [isExpanded, setIsExpanded] = useState(false);

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
      <CommandPalette />
      {/* Desktop sidebar */}
      <Box
        display={{ base: "none", md: "block" }}
        position="sticky"
        top={0}
        h="100vh"
        w={isExpanded ? "220px" : "64px"}
        transition="width 0.18s ease"
        borderRightWidth="1px"
        borderColor="brand.0"
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
                <Text fontWeight="semibold" letterSpacing="0.02em">
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
                  <Text fontSize="xs" color="fg.muted">Search…</Text>
                </HStack>
                <HStack gap={1}>
                  <Box
                    as="span"
                    fontSize="10px"
                    px="4px"
                    py="1px"
                    borderRadius="4px"
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
                <Tooltip
                  key={item.href}
                  content={item.label}
                  disabled={isExpanded}
                  openDelay={250}
                >
                  <Link
                    as={NextLink}
                    href={item.href}
                    _hover={{ textDecoration: "none", bg: "bg.subtle" }}
                    px={isExpanded ? 3 : 2}
                    py={2}
                    borderRadius="md"
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
                      <Icon
                        as={ItemIcon}
                        boxSize={5}
                        color={active ? "blue.500" : "fg.muted"}
                      />
                      {isExpanded && (
                        <Text fontWeight={active ? "bold" : "normal"} fontSize={'0.9rem'}>
                          {item.label}
                        </Text>
                      )}
                    </HStack>
                  </Link>
                </Tooltip>
              );
            })}
          </VStack>

          <Box mt="auto" px={isExpanded ? 2 : 1} pb={2} />
        </Flex>
      </Box>

      {/* Mobile More sheet */}
      <Portal>
        <Drawer.Root
          open={drawerOpen}
          onOpenChange={(e) => setDrawerOpen(e.open)}
          placement="bottom"
        >
          <Drawer.Backdrop bg="blackAlpha.400" backdropFilter="blur(4px)" />
          <Drawer.Positioner
            paddingTop={0}
            paddingBottom={`calc(env(safe-area-inset-bottom, 0px) + ${mobileDrawerBottomPadding})`}
          >
            <Drawer.Content
              mx={4}
              borderTopRadius="2xl"
              borderWidth="1px"
              borderColor="border"
              boxShadow="0 20px 48px rgba(15, 23, 42, 0.2)"
            >
              <Drawer.Header borderBottomWidth="1px" py={3} px={5} position="relative">
                <Box
                  position="absolute"
                  top={2}
                  left="50%"
                  transform="translateX(-50%)"
                  w="40px"
                  h="4px"
                  borderRadius="full"
                  bg="blackAlpha.300"
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
                            color={active ? "blue.500" : "fg.muted"}
                          />
                          <Text fontWeight={active ? "bold" : "normal"}>
                            {item.label}
                          </Text>
                        </HStack>
                      </Link>
                    );
                  })}
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
          isFullscreenEditMobile
            ? { base: "none", md: "none" }
            : { base: "block", md: "none" }
        }
        position="fixed"
        left={4}
        right={4}
        bottom={`calc(env(safe-area-inset-bottom, 0px) + ${MOBILE_NAV_BOTTOM_OFFSET})`}
        zIndex={90}
        opacity={drawerOpen ? 0 : 1}
        transform={drawerOpen ? "translateY(12px)" : "translateY(0)"}
        transition="opacity 0.18s ease, transform 0.18s ease"
        pointerEvents={drawerOpen ? "none" : "auto"}
      >
        <Flex
          align="center"
          justify="space-between"
          gap={1}
          px={2}
          py={1.5}
          borderWidth="1px"
          borderColor="border"
          borderRadius="2xl"
          bg="bg"
          boxShadow="0 12px 28px rgba(15, 23, 42, 0.12)"
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
                  borderRadius="xl"
                  bg={active ? "bg.subtle" : "transparent"}
                >
                  <Icon
                    as={ItemIcon}
                    boxSize={5}
                    color={active ? "blue.500" : "fg.muted"}
                  />
                  <Text
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
            borderRadius="xl"
          >
            <VStack gap={1}>
              <Icon as={FiMoreHorizontal} boxSize={5} color="fg.muted" />
              <Text fontSize="xs" fontWeight="medium" color="fg.muted" lineHeight="1">
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
        px={{ base: 4, md: 6 }}
        py={{ base: 4, md: 6 }}
        pb={{
          base: isFullscreenEditMobile ? 6 : mobileContentBottomPadding,
          md: 6,
        }}
      >
        <Box w="full" maxW={CONTENT_MAX_W} mx="auto">
          {children}
        </Box>
      </Box>
    </Flex>
  );
}
