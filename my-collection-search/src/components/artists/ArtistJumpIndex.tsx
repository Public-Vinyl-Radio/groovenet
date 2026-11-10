"use client";

import React from "react";
import { Box, Flex, chakra } from "@chakra-ui/react";
import { INDEX_LETTERS } from "@/lib/artists/indexLetters";

/** Height of the desktop row; the section headers stick just below it. */
export const JUMP_ROW_HEIGHT = "36px";

type Props = {
  /** Letters that have artists; the rest are dimmed and can't be chosen. */
  available: ReadonlySet<string>;
  /** The section in view. */
  active: string | undefined;
  onJump: (letter: string) => void;
};

const letterName = (letter: string) => (letter === "#" ? "Other characters" : letter);

const RowButton = chakra("button");

/** Desktop (#1116): one row of mono letters under the search field. */
function JumpRow({ available, active, onJump }: Props) {
  return (
    <Flex
      as="nav"
      aria-label="Jump to letter"
      position="sticky"
      top="0"
      zIndex={60}
      h={JUMP_ROW_HEIGHT}
      align="center"
      justify="space-between"
      bg="bg"
      borderBottomWidth="rule"
      borderColor="border"
      fontFamily="mono"
      fontSize="sm"
    >
      {INDEX_LETTERS.map((letter) => {
        const enabled = available.has(letter);
        const on = letter === active;
        return (
          <RowButton
            key={letter}
            type="button"
            aria-label={letterName(letter)}
            aria-disabled={!enabled}
            aria-current={on ? "location" : undefined}
            tabIndex={enabled ? 0 : -1}
            onClick={() => enabled && onJump(letter)}
            minW="24px"
            h="26px"
            px={1}
            borderRadius="sm"
            fontWeight={on ? "bold" : "normal"}
            bg={on ? "fg" : "transparent"}
            color={on ? "bg" : enabled ? "fg" : "fg.subtle"}
            opacity={enabled ? 1 : 0.4}
            cursor={enabled ? "pointer" : "default"}
            _hover={enabled && !on ? { bg: "bg.muted" } : undefined}
          >
            {letter}
          </RowButton>
        );
      })}
    </Flex>
  );
}

/** The index letter under a pointer, from its position down a strip of equal slots. */
export function letterAtY(clientY: number, top: number, height: number): string {
  const slot = Math.floor(((clientY - top) / Math.max(height, 1)) * INDEX_LETTERS.length);
  return INDEX_LETTERS[Math.min(INDEX_LETTERS.length - 1, Math.max(0, slot))];
}

/**
 * Phones (#1116): a thin A to Z strip on the right edge, between the page
 * header and the bottom chrome. Tap or drag a thumb along it; a bubble shows
 * the letter under the thumb and empty letters are skipped.
 */
function JumpStrip({ available, active, onJump }: Props) {
  const [touched, setTouched] = React.useState<string | undefined>();
  const dragging = React.useRef(false);
  const last = React.useRef<string | undefined>(undefined);

  const point = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const letter = letterAtY(event.clientY, rect.top, rect.height);
    if (!available.has(letter) || letter === last.current) return;
    last.current = letter;
    setTouched(letter);
    onJump(letter);
  };
  const end = () => {
    dragging.current = false;
    last.current = undefined;
    setTouched(undefined);
  };

  return (
    <>
      <Flex
        as="nav"
        aria-label="Jump to letter"
        data-testid="artist-jump-strip"
        position="fixed"
        right="0"
        top="calc(var(--safe-top) + var(--header-h))"
        bottom="var(--chrome-bottom)"
        zIndex={70}
        w="24px"
        direction="column"
        align="stretch"
        bg="bg"
        fontFamily="mono"
        fontSize="11px"
        css={{ touchAction: "none", userSelect: "none" }}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          point(event);
        }}
        onPointerMove={(event) => dragging.current && point(event)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {INDEX_LETTERS.map((letter) => {
          const enabled = available.has(letter);
          return (
            <RowButton
              key={letter}
              type="button"
              aria-label={letterName(letter)}
              aria-disabled={!enabled}
              aria-current={letter === active ? "location" : undefined}
              flex="1"
              minH="0"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontWeight={letter === active ? "bold" : "normal"}
              color={letter === active ? "fg" : "fg.muted"}
              opacity={enabled ? 1 : 0.35}
              // Pointer events cover touch; a click with no pointer is a keyboard or switch press.
              onClick={(event) => event.detail === 0 && enabled && onJump(letter)}
            >
              {letter}
            </RowButton>
          );
        })}
      </Flex>
      {touched && (
        <Box
          aria-hidden
          data-testid="artist-jump-bubble"
          position="fixed"
          top="50%"
          right="48px"
          transform="translateY(-50%)"
          zIndex={71}
          boxSize="56px"
          display="grid"
          placeItems="center"
          bg="fg"
          color="bg"
          borderRadius="md"
          fontFamily="mono"
          fontSize="2xl"
          fontWeight="bold"
        >
          {touched}
        </Box>
      )}
    </>
  );
}

/** True from the `md` breakpoint (48em) up. Phones first until the browser answers. */
function useIsDesktop() {
  const [desktop, setDesktop] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 48em)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

/** The jump index (#1116): a row on desktop, a strip on phones. */
export function ArtistJumpIndex(props: Props) {
  return useIsDesktop() ? <JumpRow {...props} /> : <JumpStrip {...props} />;
}
