"use client";

import React from "react";
import { Box, Link, Spinner, Text, VisuallyHidden, chakra } from "@chakra-ui/react";
import { FiFileText, FiImage, FiPlay, FiYoutube } from "react-icons/fi";
import PlaylistItemActionsMenu from "@/components/PlaylistItemActionsMenu";
import {
  CoverMosaic,
  SetFlyer,
  formatDuration,
  playlistCoverUrls,
  playlistSummary,
  setLinks,
  type PlaylistActionHandlers,
} from "@/components/PlaylistListItem";
import { formatGroupCount, playlistDayParts, type PlaylistMonthGroup } from "@/lib/playlistGroups";
import type { Playlist } from "@/types/track";

const Table = chakra("table");
const Thead = chakra("thead");
const Tr = chakra("tr");
const Th = chakra("th");
const Td = chakra("td");

const COLUMNS = 8;
/** Width of the table block below which With, then Set links, drop off. */
const WITH_MIN_WIDTH = "820px";
const LINKS_MIN_WIDTH = "680px";

const HEADER_CELL = {
  px: 3,
  py: 2,
  textAlign: "left",
  fontFamily: "mono",
  fontSize: "2xs",
  fontWeight: "semibold",
  letterSpacing: "0.08em",
  color: "fg.muted",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
} as const;

const BODY_CELL = { px: 3, py: 2, verticalAlign: "middle" } as const;

const LINK_ICONS = {
  recording: FiPlay,
  post: FiFileText,
  youtube: FiYoutube,
  flyer: FiImage,
} as const;

const LINK_LABELS = { recording: "Recording", post: "Website post", youtube: "YouTube", flyer: "Flyer" } as const;

/** The links a set shows in the table: recording, post, YouTube, then the flyer. */
export function tableSetLinks(set: NonNullable<Playlist["set"]>) {
  const links: Array<{ key: keyof typeof LINK_ICONS; href: string; primary: boolean }> = setLinks(set).map(
    (link) => ({
      key: link.key as keyof typeof LINK_ICONS,
      href: link.href,
      primary: link.primary,
    }),
  );
  if (set.flyer_url) links.push({ key: "flyer", href: set.flyer_url, primary: false });
  return links;
}

function SetLinkButtons({ set }: { set: Playlist["set"] }) {
  const links = set ? tableSetLinks(set) : [];
  if (links.length === 0) {
    return (
      <Text data-testid="set-links-empty" color="fg.muted" aria-label="No links">
        —
      </Text>
    );
  }
  return (
    <Box display="inline-flex" gap={1.5}>
      {links.map((link) => {
        const Icon = LINK_ICONS[link.key];
        return (
          <Link
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={LINK_LABELS[link.key]}
            data-testid={`table-link-${link.key}`}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            boxSize="32px"
            borderWidth="outline"
            borderColor={link.primary ? "border.ink" : "border"}
            bg={link.primary ? "bg.subtle" : undefined}
            color="fg"
            textDecoration="none"
            _hover={{ bg: "bg.muted", textDecoration: "none" }}
          >
            <Icon aria-hidden="true" />
          </Link>
        );
      })}
    </Box>
  );
}

function PlaylistTableRow({
  playlist,
  loading,
  actions,
}: {
  playlist: Playlist;
  loading: boolean;
  actions: PlaylistActionHandlers;
}) {
  const day = playlistDayParts(playlist);
  const set = playlist.set;
  const title = set?.title || playlist.name;
  const venue = set ? [set.venue_name, set.location_city].filter(Boolean).join(" · ") : "";
  const collaborators = set?.collaborators.map((person) => person.username).join(", ") ?? "";
  const duration = formatDuration(playlist.total_duration_seconds);

  return (
    <Box
      as="tr"
      data-testid="playlist-table-row"
      tabIndex={0}
      cursor="pointer"
      borderBottomWidth="rule"
      borderColor="border"
      _hover={{ bg: "bg.muted" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "accent.focusRing", outlineOffset: "-2px" }}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        const target = e.target as HTMLElement;
        // Links, the kebab and its portalled menu keep their own clicks.
        if (!e.currentTarget.contains(target) || target.closest("a, button, [role='menuitem']")) return;
        actions.onClick();
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter" && e.target === e.currentTarget) actions.onClick();
      }}
    >
      <Td {...BODY_CELL} fontFamily="mono" fontSize="sm" whiteSpace="nowrap">
        {day ? (
          <>
            <Text as="span" fontWeight="semibold">
              {day.day}
            </Text>{" "}
            <Text as="span" fontSize="2xs" color="fg.muted">
              {day.weekday}
            </Text>
          </>
        ) : (
          <Text as="span" color="fg.muted">
            —
          </Text>
        )}
      </Td>
      <Td {...BODY_CELL} px={0}>
        {set?.flyer_url ? <SetFlyer url={set.flyer_url} compact /> : <CoverMosaic urls={playlistCoverUrls(playlist)} size="40px" />}
      </Td>
      <Td {...BODY_CELL} minW={0}>
        <Box display="flex" alignItems="center" gap={2} minW={0}>
          <Text fontWeight="semibold" fontSize="sm" lineClamp={2}>
            {title}
          </Text>
          {set && (
            <Text
              data-testid="live-set-stamp"
              flexShrink={0}
              px={1.5}
              borderWidth="rule"
              borderColor="border.ink"
              fontFamily="mono"
              fontSize="2xs"
              fontWeight="bold"
              letterSpacing="0.08em"
              whiteSpace="nowrap"
            >
              LIVE SET
            </Text>
          )}
        </Box>
        {venue && (
          <Text
            data-testid="table-venue"
            mt={0.5}
            fontFamily="mono"
            fontSize="2xs"
            letterSpacing="0.06em"
            textTransform="uppercase"
            color="fg.muted"
            lineClamp={1}
          >
            {venue}
          </Text>
        )}
      </Td>
      <Td {...BODY_CELL} textAlign="right" fontFamily="mono" fontSize="sm">
        {playlist.tracks.length}
      </Td>
      <Td {...BODY_CELL} textAlign="right" fontFamily="mono" fontSize="sm" whiteSpace="nowrap">
        {duration ?? "—"}
      </Td>
      <Td data-col="with" {...BODY_CELL} color="fg.muted" fontSize="sm">
        {collaborators || "—"}
      </Td>
      <Td data-col="links" {...BODY_CELL}>
        <SetLinkButtons set={set} />
      </Td>
      <Td {...BODY_CELL} px={1} whiteSpace="nowrap">
        {loading && <Spinner size="xs" mr={1} />}
        <PlaylistItemActionsMenu
          playlistName={playlist.name}
          onOpen={actions.onClick}
          onPlay={actions.onPlay}
          onDelete={actions.onDelete}
          onEnqueue={actions.onEnqueue}
          onExportPdf={actions.onExportPdf}
          summary={playlistSummary(playlist)}
          played={set?.status === "performed"}
          collaborators={collaborators}
          onCreateSet={set ? undefined : actions.onCreateSet}
        />
      </Td>
    </Box>
  );
}

/**
 * Desktop list view: one outlined table with a single hard shadow, a group row
 * per month. Rows open the playlist on click or Enter; the set links and the
 * kebab handle their own clicks. With, then Set links, drop off as the block
 * narrows (it is a `container-type: inline-size` ancestor).
 */
export default function PlaylistTable({
  groups,
  loadingId,
  getActions,
}: {
  groups: PlaylistMonthGroup[];
  /** Id of the playlist with a pending action, if any. */
  loadingId?: number | null;
  getActions: (playlist: Playlist) => PlaylistActionHandlers;
}) {
  return (
    <Box mr="6px" mb="6px" borderWidth="outline" borderColor="border.ink" boxShadow="md" css={{ containerType: "inline-size" }}>
      <Table
        aria-label="Playlists"
        w="100%"
        css={{
          borderCollapse: "collapse",
          tableLayout: "auto",
          [`@container (max-width: ${WITH_MIN_WIDTH})`]: { "& [data-col=with]": { display: "none" } },
          [`@container (max-width: ${LINKS_MIN_WIDTH})`]: { "& [data-col=links]": { display: "none" } },
        }}
      >
        <Thead bg="bg.subtle" borderBottomWidth="outline" borderColor="border.ink">
          <Tr>
            <Th scope="col" {...HEADER_CELL}>
              Date
            </Th>
            <Th scope="col" {...HEADER_CELL}>
              <VisuallyHidden>Cover</VisuallyHidden>
            </Th>
            <Th scope="col" {...HEADER_CELL}>
              Name
            </Th>
            <Th scope="col" {...HEADER_CELL} textAlign="right">
              Tracks
            </Th>
            <Th scope="col" {...HEADER_CELL} textAlign="right">
              Length
            </Th>
            <Th scope="col" data-col="with" {...HEADER_CELL}>
              With
            </Th>
            <Th scope="col" data-col="links" {...HEADER_CELL}>
              Set links
            </Th>
            <Th scope="col" {...HEADER_CELL}>
              <VisuallyHidden>Actions</VisuallyHidden>
            </Th>
          </Tr>
        </Thead>
        {groups.map((group) => (
          <tbody key={group.key} aria-label={group.label}>
            <Tr data-testid="month-group-row">
              <Th scope="rowgroup" colSpan={COLUMNS} px={3} py={2} textAlign="left" borderBottomWidth="rule" borderColor="border">
                <Box display="flex" alignItems="center" gap={3}>
                  <Text
                    as="span"
                    data-testid="month-tab"
                    bg="fg"
                    color="bg"
                    fontFamily="mono"
                    fontSize="xs"
                    fontWeight="bold"
                    letterSpacing="0.1em"
                    px={3}
                    py={0.5}
                  >
                    {group.label}
                  </Text>
                  <Text
                    as="span"
                    data-testid="month-count"
                    fontFamily="mono"
                    fontSize="2xs"
                    letterSpacing="0.06em"
                    color="fg.muted"
                    textTransform="uppercase"
                    fontWeight="normal"
                  >
                    {formatGroupCount(group)}
                  </Text>
                </Box>
              </Th>
            </Tr>
            {group.playlists.map((playlist) => (
              <PlaylistTableRow
                key={playlist.id}
                playlist={playlist}
                loading={playlist.id === loadingId}
                actions={getActions(playlist)}
              />
            ))}
          </tbody>
        ))}
      </Table>
    </Box>
  );
}
