"use client";

import React from "react";
import NextLink from "next/link";
import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  IconButton,
  Stack,
  Text,
  chakra,
} from "@chakra-ui/react";
import { FiX } from "react-icons/fi";
import RetroDialog, { RetroDialogTitle } from "@/components/ui/RetroDialog";
import { useAlbum } from "@/hooks/useAlbum";
import { useAlbumDetailQuery } from "@/hooks/useAlbumsQuery";
import { useSpinTrackStatsQuery } from "@/hooks/useSpinsQuery";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import { DeleteSpinConfirm } from "./SpinActionsMenu";
import SpinFormDialog from "./SpinFormDialog";
import { SpinArt } from "./listeningLogParts";
import {
  describeNeighbour,
  describeSessionPosition,
  describeSpinHeadline,
  describeSpinLogging,
  describeTrackPlays,
  formatLoggedAt,
  spinNeighbours,
  type SpinSelection,
} from "./spinSelection";
import { summarizeSpin, type SpinPlay } from "./spinSummary";
import { useSpinActions } from "./useSpinActions";

type Variant = "panel" | "modal";

type DetailProps = {
  selection: SpinSelection;
  /** Moves the selection to another play, keeping the detail open. */
  onSelect: (key: string) => void;
  /** Called once the spin session is deleted. */
  onDeleted: () => void;
};

const sectionHeading = {
  as: "h3" as const,
  fontFamily: "mono",
  fontSize: "11px",
  fontWeight: "semibold",
  letterSpacing: "0.08em",
  color: "fg.muted",
};

const titleStyle = {
  fontWeight: "semibold",
  truncate: true,
} as const;

function Section({ first, children }: { first?: boolean; children: React.ReactNode }) {
  return (
    <Stack
      as="section"
      gap={2}
      px={3.5}
      py={3}
      borderTopWidth={first ? 0 : "rule"}
      borderColor="border"
    >
      {children}
    </Stack>
  );
}

/** The library identifier and side, from the album row once it loads. */
function useSpinHeadline(play: SpinPlay): string | null {
  const friendId = play.item.session.friend_id;
  useAlbumDetailQuery(play.releaseId, friendId);
  const album = useAlbum(play.releaseId, friendId);
  return describeSpinHeadline(play, album?.library_identifier);
}

/** Cover, then `LP-342 · SIDE A1`, the title, and artist · record. */
function SpinDetailHeading({
  play,
  variant,
  title,
}: {
  play: SpinPlay;
  variant: Variant;
  title: React.ReactNode;
}) {
  const headline = useSpinHeadline(play);
  const sub = [play.artist, play.record].filter(Boolean).join(" · ");
  return (
    <Flex flex="1" minW={0} align="center" gap={3}>
      <SpinArt src={play.thumbnail} boxSize={variant === "panel" ? "64px" : "52px"} inverse />
      <Box flex="1" minW={0}>
        {headline && (
          <Text
            fontFamily="mono"
            fontSize="11px"
            lineHeight="14px"
            letterSpacing="0.06em"
            opacity={0.8}
          >
            {headline}
          </Text>
        )}
        {title}
        {sub && (
          <Text fontSize="13px" lineHeight="18px" opacity={0.8} truncate title={sub}>
            {sub}
          </Text>
        )}
      </Box>
    </Flex>
  );
}

function HowItWasLogged({ play }: { play: SpinPlay }) {
  const timeZone = useDisplayTimeZone();
  const logging = describeSpinLogging(play);
  const facts: Array<[string, string]> = [
    ["SOURCE", logging.source],
    ["LOGGED BY", logging.loggedBy],
    ...(play.medium === "digital" && play.item.session.output_name
      ? [["OUTPUT", play.item.session.output_name] as [string, string]]
      : []),
    ["LOGGED AT", formatLoggedAt(play.playedAt, timeZone)],
  ];
  return (
    <Section first>
      <Heading {...sectionHeading}>HOW IT WAS LOGGED</Heading>
      <Grid
        as="dl"
        templateColumns={{ base: "96px minmax(0, 1fr)", xl: "110px minmax(0, 1fr)" }}
        columnGap={3}
        rowGap={1}
        fontSize="sm"
        lineHeight="20px"
      >
        {facts.map(([label, value]) => (
          <React.Fragment key={label}>
            <Text
              as="dt"
              fontFamily="mono"
              fontSize="11px"
              lineHeight="20px"
              letterSpacing="0.06em"
              color="fg.muted"
            >
              {label}
            </Text>
            <Text as="dd" fontWeight="semibold">
              {value}
            </Text>
          </React.Fragment>
        ))}
      </Grid>
      {logging.note && (
        <Text fontSize="13px" lineHeight="18px" color="fg.muted">
          {logging.note}
        </Text>
      )}
    </Section>
  );
}

function NeighbourButton({
  direction,
  play,
  onSelect,
}: {
  direction: "BEFORE" | "AFTER";
  play: SpinPlay | null;
  onSelect: (key: string) => void;
}) {
  const timeZone = useDisplayTimeZone();
  const text = play
    ? describeNeighbour(play, timeZone)
    : direction === "BEFORE"
      ? "First spin of the session"
      : "Last spin of the session";
  return (
    <chakra.button
      type="button"
      disabled={!play}
      onClick={() => play && onSelect(play.key)}
      minH="44px"
      px={2.5}
      display="flex"
      alignItems="center"
      gap={2.5}
      borderWidth="outline"
      borderColor="border"
      textAlign="left"
      fontSize="13px"
      cursor={play ? "pointer" : "default"}
      color={play ? "fg" : "fg.muted"}
      _hover={play ? { bg: "bg.muted" } : undefined}
    >
      <Text as="span" fontFamily="mono" fontSize="10px" letterSpacing="0.08em" color="fg.muted">
        {direction}
      </Text>
      <Text as="span" flex="1" minW={0} truncate title={text}>
        {text}
      </Text>
    </chakra.button>
  );
}

function SessionSection({
  selection,
  variant,
  onSelect,
}: {
  selection: SpinSelection;
  variant: Variant;
  onSelect: (key: string) => void;
}) {
  const timeZone = useDisplayTimeZone();
  const { before, after } = spinNeighbours(selection);
  // The phone modal leaves out a direction with nowhere to go; the panel keeps
  // both, so its layout doesn't jump as the selection moves.
  const showEnds = variant === "panel";
  return (
    <Section>
      <Heading {...sectionHeading}>SESSION</Heading>
      <Text fontSize="sm" fontWeight="semibold">
        {describeSessionPosition(selection, timeZone)}
      </Text>
      {(before || showEnds) && (
        <NeighbourButton direction="BEFORE" play={before} onSelect={onSelect} />
      )}
      {(after || showEnds) && (
        <NeighbourButton direction="AFTER" play={after} onSelect={onSelect} />
      )}
    </Section>
  );
}

function ThisTrack({
  play,
  trackId,
  variant,
}: {
  play: SpinPlay;
  trackId: string;
  variant: Variant;
}) {
  const timeZone = useDisplayTimeZone();
  const friendId = play.item.session.friend_id;
  const { stats } = useSpinTrackStatsQuery({ friend_id: friendId, track_id: trackId });
  const plays = stats ? describeTrackPlays(stats, timeZone) : "–";
  const suffix = variant === "panel" ? " PAGE →" : " →";
  const link = (label: string, href: string) => (
    <Button asChild variant="outline" size="sm" h="44px">
      <NextLink href={href}>
        {label}
        {suffix}
      </NextLink>
    </Button>
  );
  return (
    <Section>
      <Flex
        direction={variant === "panel" ? "column" : "row"}
        align={variant === "panel" ? "start" : "baseline"}
        justify="space-between"
        gap={2}
      >
        <Heading {...sectionHeading}>THIS TRACK</Heading>
        <Text fontFamily="mono" fontSize={variant === "panel" ? "13px" : "xs"}>
          {plays}
        </Text>
      </Flex>
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
        {link("TRACK", `/tracks/${encodeURIComponent(trackId)}?friend_id=${friendId}`)}
        {link("ALBUM", `/albums/${encodeURIComponent(play.releaseId)}?friend_id=${friendId}`)}
      </Grid>
    </Section>
  );
}

function SpinDetailActions({ play, onDeleted }: { play: SpinPlay; onDeleted: () => void }) {
  const { item } = play;
  const { editOpen, setEditOpen, handleDelete, deleting } = useSpinActions(item, { onDeleted });
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  return (
    <Box px={3.5} pt={3} pb={3.5} borderTopWidth="rule" borderColor="border">
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
        {play.medium === "vinyl" && (
          <Button variant="outline" size="sm" h="44px" onClick={() => setEditOpen(true)}>
            FIX SPIN
          </Button>
        )}
        <Button
          variant="outline"
          colorPalette="danger"
          size="sm"
          h="44px"
          onClick={() => setConfirmOpen(true)}
        >
          DELETE SPIN
        </Button>
      </Grid>
      <DeleteSpinConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        label={summarizeSpin(item).headline}
        onDelete={handleDelete}
        deleting={deleting}
      />
      <SpinFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        releaseId={item.session.release_id}
        friendId={item.session.friend_id}
        spin={item}
      />
    </Box>
  );
}

/** Everything under the header: how it was logged, its session, the track, actions. */
export function SpinDetailBody({
  selection,
  variant,
  onSelect,
  onDeleted,
}: DetailProps & { variant: Variant }) {
  const { play } = selection;
  return (
    <>
      <HowItWasLogged play={play} />
      <SessionSection selection={selection} variant={variant} onSelect={onSelect} />
      {play.trackId && <ThisTrack play={play} trackId={play.trackId} variant={variant} />}
      <SpinDetailActions play={play} onDeleted={onDeleted} />
    </>
  );
}

/** The desktop side panel's content for a selected spin. */
export function SpinDetailPanel({ onClose, ...props }: DetailProps & { onClose: () => void }) {
  const { play } = props.selection;
  return (
    <Box borderWidth="outline" borderColor="border.ink" boxShadow="md" bg="bg">
      <Flex align="center" gap={3} py={3} pl={3} pr={1} bg="border.ink" color="bg">
        <SpinDetailHeading
          play={play}
          variant="panel"
          title={
            <Heading as="h2" fontSize="17px" lineHeight="22px" {...titleStyle} title={play.title}>
              {play.title}
            </Heading>
          }
        />
        <IconButton
          aria-label="Close spin detail"
          variant="ghost"
          color="bg"
          boxSize="44px"
          minW="44px"
          flexShrink={0}
          onClick={onClose}
          _hover={{ bg: "transparent", opacity: 0.75 }}
        >
          <FiX />
        </IconButton>
      </Flex>
      <SpinDetailBody {...props} variant="panel" />
    </Box>
  );
}

/** The phone modal for a selected spin. */
export function SpinDetailModal({ onClose, ...props }: DetailProps & { onClose: () => void }) {
  const { play } = props.selection;
  return (
    <RetroDialog
      open
      onOpenChange={(open) => !open && onClose()}
      header={
        <SpinDetailHeading
          play={play}
          variant="modal"
          title={
            <RetroDialogTitle fontSize="16px" lineHeight="22px" {...titleStyle} title={play.title}>
              {play.title}
            </RetroDialogTitle>
          }
        />
      }
    >
      <SpinDetailBody {...props} variant="modal" />
    </RetroDialog>
  );
}

/** The desktop panel's empty state. */
export function SpinDetailEmpty() {
  return (
    <Flex
      minH="200px"
      align="center"
      justify="center"
      p={6}
      borderWidth="outline"
      borderStyle="dashed"
      borderColor="border"
      textAlign="center"
      fontSize="sm"
      color="fg.muted"
    >
      Pick a spin to see how it was logged.
    </Flex>
  );
}
