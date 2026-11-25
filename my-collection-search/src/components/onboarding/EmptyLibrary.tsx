"use client";

import React from "react";
import { Box, Button, Flex, Link, Text } from "@chakra-ui/react";
import { LuDisc3 } from "react-icons/lu";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useDiscogsImport } from "@/hooks/useDiscogsImport";
import { useLibrariesQuery } from "@/hooks/useLibraries";
import { useUsername } from "@/providers/UsernameProvider";

export const DISCOGS_SETUP_DOCS =
  "https://groovenet.publicvinylradio.com/docs/getting-started/discogs/";

/**
 * What Home, Albums and Tracks show for a library with nothing in it (#1246): one message and
 * one action, never a spinner or a row of zeros. It covers a fresh install (no library selected
 * yet) and a library that holds no albums.
 *
 * Three faces of the same block: the server has no Discogs credentials (say which, and where to
 * set them, instead of letting the sync fail with a 500); an import is running (its progress,
 * and that leaving is safe); and the ready state, whose action starts the import. A failed
 * import offers "Resume import": the import checkpoints every 25 releases, so a rerun carries on.
 * The import is a background job (#1274), so its progress shows after a reload or on another
 * device, and no second import is offered while one runs.
 */
export default function EmptyLibrary() {
  const { friend } = useUsername();
  const libraries = useLibrariesQuery();
  const tokenMissing = libraries.data ? !libraries.data.discogs_token_set : false;
  const account = libraries.data?.account_username ?? null;
  // A selected library syncs by its own username; with none, the server's account.
  const target = friend?.username ?? account;
  const usernameMissing = libraries.data ? target === null : false;
  const missing = [
    ...(tokenMissing ? ["DISCOGS_USER_TOKEN"] : []),
    ...(usernameMissing ? ["DISCOGS_USERNAME"] : []),
  ];
  const unconfigured = missing.length > 0;
  const importer = useDiscogsImport(target);

  const resuming = importer.failure !== null;
  const label = resuming ? "Resume import" : "Import from Discogs";

  return (
    <Box
      as="section"
      aria-labelledby="empty-library-heading"
      data-testid="empty-library"
      borderWidth="outline"
      borderColor="border.ink"
      borderRadius="md"
      boxShadow="md"
      bg="bg.panel"
      mr="6px"
      mt={3}
      p={{ base: 4, md: 6 }}
    >
      <Flex direction="column" align="flex-start" gap={3} maxW="560px">
        <Box color="fg.muted" aria-hidden="true">
          <LuDisc3 size={28} />
        </Box>
        <SectionHeading id="empty-library-heading">Your library is empty</SectionHeading>
        <Text color="fg.muted">
          Import your collection from Discogs to fill Home, Albums and Tracks.
        </Text>

        {unconfigured && (
          <Box
            role="alert"
            borderWidth="rule"
            borderColor="border"
            borderRadius="md"
            bg="bg.subtle"
            p={3}
            w="100%"
          >
            <Text fontWeight="semibold">
              Discogs isn&apos;t set up: {missing.join(" and ")} {missing.length > 1 ? "are" : "is"}{" "}
              missing.
            </Text>
            <Text color="fg.muted" mt={1}>
              Set {missing.length > 1 ? "them" : "it"} in the <code>.env</code> file next to your{" "}
              <code>docker-compose.yml</code>, then restart GrooveNet.
            </Text>
          </Box>
        )}

        {importer.running && (
          <Box role="status" w="100%">
            <Text fontWeight="semibold">Importing · {importer.progress}</Text>
            <Text color="fg.muted" mt={1}>
              A large collection takes a while: about a second per release. You can leave this page
              or close the tab; the import keeps running, and your records appear as they arrive.
            </Text>
          </Box>
        )}

        {importer.failure && (
          <Box role="alert" w="100%">
            <Text fontWeight="semibold">The import stopped: {importer.failure}</Text>
            <Text color="fg.muted" mt={1}>
              Releases already saved are kept, so resuming carries on from where it stopped.
            </Text>
          </Box>
        )}

        {importer.finished && (
          <Text role="status" color="fg.muted">
            The import finished but found no releases. Check that the Discogs username is right and
            the collection is public.
          </Text>
        )}

        {unconfigured ? (
          <Link
            href={DISCOGS_SETUP_DOCS}
            target="_blank"
            rel="noreferrer"
            minH="44px"
            display="inline-flex"
            alignItems="center"
            fontWeight="semibold"
          >
            Read the Discogs setup guide
          </Link>
        ) : (
          !importer.running && (
            <Button
              colorPalette="accent"
              variant="solid"
              minH="44px"
              disabled={libraries.isPending}
              onClick={() => importer.start(friend?.username)}
            >
              {label}
            </Button>
          )
        )}
      </Flex>
    </Box>
  );
}
