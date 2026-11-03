"use client";

import React, { useRef, useState } from "react";
import { Box, Button, Field, Flex, Input, Text } from "@chakra-ui/react";
import RetroDialog from "@/components/ui/RetroDialog";
import { StatusTag } from "@/components/ui/RoleTags";
import { useDiscogsUserLookup } from "@/hooks/useLibraries";
import { buttonLabel } from "./libraryStyles";

type AddLibraryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Adds the library and starts its sync; rejects to keep the modal open. */
  onAdd: (username: string) => Promise<void>;
  /** Usernames already in the list, which can't be added again. */
  existing: string[];
  /** Opens with this username typed and looked up (stories show each state with it). */
  initialUsername?: string;
};

const monoLabel = {
  fontFamily: "label",
  fontSize: "11px",
  fontWeight: "semibold",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
} as const;

/**
 * Add a friend's library (#969): look the Discogs username up first, so a
 * typo or a private collection is caught before anything syncs. ADD AND SYNC
 * becomes the primary action only once the user is found.
 */
export default function AddLibraryDialog({
  open,
  onOpenChange,
  onAdd,
  existing,
  initialUsername,
}: AddLibraryDialogProps) {
  const [typed, setTyped] = useState(initialUsername ?? "");
  const [submitted, setSubmitted] = useState<string | null>(initialUsername ?? null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lookup = useDiscogsUserLookup(submitted);

  // The dialog is controlled, so the only change it reports is closing.
  const close = () => {
    onOpenChange(false);
    setTyped("");
    setSubmitted(null);
    setAddError(null);
  };

  // Only reachable with a name typed: LOOK UP, the form's submit, is disabled otherwise.
  const lookUp = () => {
    const username = typed.trim();
    setAddError(null);
    if (username === submitted) void lookup.refetch();
    else setSubmitted(username);
  };

  // A result is shown only for the name in the field; editing it clears the result.
  const current = submitted !== null && submitted === typed.trim();
  const result = current ? lookup.data : undefined;
  const found = result?.found ? result : null;
  const duplicate =
    found !== null && existing.some((name) => name.toLowerCase() === found.username.toLowerCase());
  const canAdd = found !== null && !duplicate && !adding;

  const add = async (username: string) => {
    setAdding(true);
    setAddError(null);
    try {
      await onAdd(username);
      close();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
    } finally {
      setAdding(false);
    }
  };

  let status: React.ReactNode;
  if (!current) {
    status = (
      <Text fontSize="sm" lineHeight="20px" color="fg.muted" py={3}>
        Look up a username to check it before adding.
      </Text>
    );
  } else if (lookup.isFetching || (!result && !lookup.isError)) {
    status = (
      <Text fontSize="sm" lineHeight="20px" color="fg.muted" py={3}>
        Looking up {submitted}…
      </Text>
    );
  } else if (lookup.isError) {
    status = (
      <Box data-testid="lookup-error" p={3} borderWidth="outline" borderColor="border.ink">
        <Text fontSize="sm" lineHeight="20px" color="fg.error">
          Couldn&apos;t reach Discogs: {lookup.error.message}. Try again in a moment.
        </Text>
      </Box>
    );
  } else if (found) {
    status = (
      <Flex
        data-testid="lookup-found"
        align="center"
        gap={3}
        p={3}
        borderWidth="outline"
        borderColor="border.ink"
        bg="bg.subtle"
      >
        {/* A record: an ink disc with a ground-coloured spindle hole. */}
        <Flex
          aria-hidden="true"
          boxSize={{ base: "40px", md: "44px" }}
          flexShrink={0}
          align="center"
          justify="center"
          borderRadius="full"
          bg="fg"
        >
          <Box boxSize="9px" borderRadius="full" bg="bg" />
        </Flex>
        <Box flex="1" minW={0}>
          <Text fontSize="md" lineHeight="22px" fontWeight="semibold" truncate>
            {found.username}
          </Text>
          <Text {...monoLabel} fontWeight="normal" letterSpacing="0.04em" color="fg.muted">
            {found.release_count.toLocaleString()} releases
            <Box as="span" display={{ base: "none", md: "inline" }}>
              {" "}
              in their collection
            </Box>
          </Text>
          {duplicate ? (
            <Text fontSize="sm" color="fg.muted" mt={1}>
              Already in your libraries.
            </Text>
          ) : null}
        </Box>
        <StatusTag tone="success">Found</StatusTag>
      </Flex>
    );
  } else {
    status = (
      <Box
        data-testid="lookup-not-found"
        p={3}
        borderWidth="outline"
        borderStyle="dashed"
        borderColor="border.ink"
      >
        <Text fontSize="sm" lineHeight="20px">
          No Discogs user called “{submitted}”. Check the spelling, or that their collection is
          public.
        </Text>
      </Box>
    );
  }

  return (
    <RetroDialog
      open={open}
      onOpenChange={close}
      title="Add a library"
      maxW="520px"
      dismissible={!adding}
      initialFocusEl={() => inputRef.current}
      footer={
        <Box
          display={{ base: "grid", md: "flex" }}
          gridTemplateColumns="repeat(2, minmax(0, 1fr))"
          justifyContent="flex-end"
          gap={2}
          px={{ base: 4, md: 5 }}
          py={3}
          borderTopWidth="outline"
          borderColor="border.ink"
          bg="bg.subtle"
        >
          <Button variant="outline" h="44px" {...buttonLabel} onClick={close} disabled={adding}>
            Cancel
          </Button>
          <Button
            variant={found && !duplicate ? "solid" : "outline"}
            h="44px"
            {...buttonLabel}
            onClick={found ? () => add(found.username) : undefined}
            disabled={!canAdd}
            loading={adding}
          >
            Add and sync
          </Button>
        </Box>
      }
    >
      <Flex direction="column" gap={4} p={{ base: 4, md: 5 }} minW={0}>
        <Text fontSize={{ base: "sm", md: "15px" }} lineHeight="22px" color="fg.muted">
          Add a friend’s Discogs collection to browse it and use their records in playlists.
        </Text>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            lookUp();
          }}
        >
          <Field.Root>
            <Field.Label {...monoLabel}>Discogs username</Field.Label>
            <Flex direction={{ base: "column", md: "row" }} gap={2} w="full">
              <Input
                ref={inputRef}
                flex={{ base: "none", md: 1 }}
                minW={0}
                h="44px"
                fontSize="16px"
                bg="bg.subtle"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                h="44px"
                {...buttonLabel}
                disabled={!typed.trim() || (current && lookup.isFetching)}
              >
                Look up
              </Button>
            </Flex>
          </Field.Root>
        </form>
        <Box role="status" aria-live="polite" minH="72px">
          {status}
          {addError ? (
            <Text fontSize="sm" color="fg.error" mt={2}>
              Couldn&apos;t add {found?.username}: {addError}
            </Text>
          ) : null}
        </Box>
        <Text fontSize="13px" lineHeight="18px" color="fg.muted">
          Their collection starts syncing as soon as it’s added. A large collection takes a few
          minutes.
        </Text>
      </Flex>
    </RetroDialog>
  );
}
