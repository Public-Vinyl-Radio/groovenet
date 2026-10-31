"use client";

import React from "react";
import NextLink from "next/link";
import { Box, chakra, Flex, Heading, Link, Text } from "@chakra-ui/react";
import { formatSeconds } from "@/lib/trackUtils";
import Artwork from "@/components/player/Artwork";
import {
  SquarePlayButton,
  TransportStrip,
  type TransportProps,
} from "@/components/player/TransportControls";

export type NowPlayingCardProps = {
  medium: "digital" | "vinyl";
  /** The server player's name ("Lounge"); none for vinyl. */
  outputName?: string | null;
  title: string;
  artist: string;
  album?: string | null;
  coverUrl?: string | null;
  /** Server players only: elapsed and total seconds. */
  progress?: { elapsed: number; duration: number } | null;
  /** Server players only: previous / play-pause / next. */
  transport?: TransportProps | null;
  /** Where the card goes for vinyl: the track's page. */
  href?: string;
  /** Without `href`: opens Now playing for a server player. */
  onOpen?: () => void;
};

const mono = { fontFamily: "mono", letterSpacing: "0.08em" } as const;

const Opener = chakra("button");

function ProgressFill({ percent }: { percent: number }) {
  return (
    <Box
      h="100%"
      bg="accent.solid"
      data-testid="now-playing-progress"
      style={{ width: `${percent}%` }}
    />
  );
}

/**
 * Home's Now playing (#881): what a music server is playing, with its
 * transport, or the record a vinyl detection heard (no transport, no
 * progress). Desktop is one row: an ink label block, the track, the keys.
 * Phones stack the label over the track and end with a progress line.
 */
export function NowPlayingCard({
  medium,
  outputName,
  title,
  artist,
  album,
  coverUrl,
  progress,
  transport,
  onOpen,
  href,
}: NowPlayingCardProps) {
  const mediumLabel = medium === "vinyl" ? "VINYL" : "DIGITAL";
  const percent =
    progress && progress.duration > 0
      ? Math.max(0, Math.min(100, (progress.elapsed / progress.duration) * 100))
      : 0;
  const byline = album ? `${artist} · ${album}` : artist;

  const body = (
    <>
      <Box boxSize={{ base: "48px", md: "56px" }} flexShrink={0}>
        <Artwork src={coverUrl} alt={album || title} fill />
      </Box>
      <Flex as="span" direction="column" flex="1" minW={0} gap={{ base: "2px", md: "6px" }}>
        <Flex
          as="span"
          direction={{ base: "column", md: "row" }}
          align={{ md: "baseline" }}
          gap={{ base: "2px", md: "10px" }}
          minW={0}
        >
          <Text
            as="span"
            fontSize={{ base: "15px", md: "16px" }}
            lineHeight={{ base: "20px", md: "22px" }}
            fontWeight="semibold"
            truncate
            title={title}
          >
            {title}
          </Text>
          <Text
            as="span"
            fontSize={{ base: "13px", md: "14px" }}
            lineHeight="18px"
            color="fg.muted"
            truncate
            title={byline}
          >
            {byline}
          </Text>
        </Flex>
        <Flex as="span" display={{ base: "none", md: "flex" }} align="center" gap="10px">
          <Text
            as="span"
            h="20px"
            px="6px"
            display="inline-flex"
            alignItems="center"
            borderWidth="outline"
            borderColor="border.ink"
            fontSize="10px"
            fontWeight="semibold"
            flexShrink={0}
            {...mono}
          >
            {mediumLabel}
          </Text>
          {progress && (
            <>
              <Box
                as="span"
                display="block"
                flex="1"
                maxW="420px"
                h="8px"
                borderWidth="outline"
                borderColor="border.ink"
                aria-hidden="true"
              >
                <ProgressFill percent={percent} />
              </Box>
              <Text
                as="span"
                fontFamily="mono"
                fontSize="12px"
                color="fg.muted"
                fontVariantNumeric="tabular-nums"
                flexShrink={0}
              >
                {formatSeconds(progress.elapsed)} / {formatSeconds(progress.duration)}
              </Text>
            </>
          )}
        </Flex>
      </Flex>
    </>
  );

  const bodyCss = {
    flex: "1",
    minW: 0,
    display: "flex",
    alignItems: "center",
    gap: { base: "12px", md: "14px" },
    px: { base: "12px", md: "14px" },
    py: "10px",
    color: "fg",
    textAlign: "left",
    textDecoration: "none",
    _hover: { bg: "bg.muted", textDecoration: "none" },
  } as const;

  return (
    <Flex
      as="section"
      aria-labelledby="now-playing-heading"
      direction={{ base: "column", md: "row" }}
      align="stretch"
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="md"
      mr="6px"
      flexShrink={0}
    >
      <Heading
        as="h2"
        id="now-playing-heading"
        m={0}
        w={{ md: "132px" }}
        h={{ base: "32px", md: "auto" }}
        flexShrink={0}
        px={3}
        display="flex"
        flexDirection={{ base: "row", md: "column" }}
        alignItems={{ base: "center", md: "flex-start" }}
        justifyContent={{ base: "space-between", md: "center" }}
        gap="2px"
        bg="fg"
        color="bg"
        fontSize={{ base: "11px", md: "12px" }}
        fontWeight="semibold"
        {...mono}
      >
        NOW PLAYING
        <Box as="span" fontWeight="normal" letterSpacing="0.06em">
          {outputName ? outputName.toUpperCase() : null}
          <Box as="span" display={{ base: "inline", md: "none" }}>
            {outputName ? ` · ${mediumLabel}` : mediumLabel}
          </Box>
        </Box>
      </Heading>

      <Flex flex="1" minW={0} align="center" pr={{ base: transport ? "8px" : 0, md: 0 }}>
        {href ? (
          <Link asChild css={bodyCss}>
            <NextLink href={href}>{body}</NextLink>
          </Link>
        ) : (
          <Opener
            type="button"
            aria-label={`Open Now playing: ${title}`}
            onClick={onOpen}
            css={{ ...bodyCss, cursor: "pointer", bg: "transparent" }}
          >
            {body}
          </Opener>
        )}
        {transport && (
          <Box display={{ base: "block", md: "none" }}>
            <SquarePlayButton {...transport} />
          </Box>
        )}
      </Flex>

      {transport && (
        <Flex
          display={{ base: "none", md: "flex" }}
          align="center"
          px="14px"
          borderLeftWidth="outline"
          borderColor="border.ink"
        >
          <TransportStrip size="card" {...transport} />
        </Flex>
      )}

      {progress && (
        <Box
          display={{ base: "block", md: "none" }}
          h="6px"
          borderTopWidth="outline"
          borderColor="border.ink"
          aria-hidden="true"
        >
          <ProgressFill percent={percent} />
        </Box>
      )}
    </Flex>
  );
}
