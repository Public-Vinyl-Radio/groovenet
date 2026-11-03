"use client";

import React, { createContext, useContext, useState } from "react";
import { Box, Button, Flex, IconButton, Skeleton, Spinner, Text } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { FiRefreshCcw, FiTrash2 } from "react-icons/fi";
import { LuPlus } from "react-icons/lu";
import ConfirmDialog from "@/components/records/ConfirmDialog";
import { HeaderButton } from "@/components/layout/ListHeader";
import ManifestVerificationDialog from "@/components/settings/dialogs/ManifestVerificationDialog";
import RemovedReleasesDialog from "@/components/settings/dialogs/RemovedReleasesDialog";
import SuggestionScopeToggle from "@/components/SuggestionScopeToggle";
import { SourceTag } from "@/components/ui/RoleTags";
import { toaster } from "@/components/ui/toaster";
import {
  useCleanupManifests,
  useDeleteReleases,
  useSyncDiscogs,
  useVerifyManifests,
} from "@/hooks/useDiscogsQuery";
import { useFriendsQuery } from "@/hooks/useFriendsQuery";
import { useFriendsSync } from "@/hooks/useFriendsSync";
import { useLibrariesQuery } from "@/hooks/useLibraries";
import {
  useRecommendationSettingsQuery,
  useUpdateRecommendationSettings,
} from "@/hooks/useSuggestionScope";
import { formatDate } from "@/lib/date";
import { queryKeys } from "@/lib/queryKeys";
import { useSyncStreams } from "@/providers/SyncStreamsProvider";
import { useUsername } from "@/providers/UsernameProvider";
import type { VerificationResult } from "@/services/internalApi/discogs";
import type { LibraryWithStats } from "@/services/internalApi/friends";
import type { Friend } from "@/types/track";
import { DEFAULT_RECOMMENDATION_SCOPE } from "@/types/recommendations";
import AddLibraryDialog from "./AddLibraryDialog";
import { buttonLabel } from "./libraryStyles";
import { librarySyncProgress } from "./librarySyncProgress";
import SavedStatus from "./SavedStatus";

// ── Opening the add-library modal ──────────────────────────────────────────
// The button lives in the shell's header (desktop) or the PageHeader (phone),
// the modal in the section, so they share this small context.

type AddLibraryContextValue = { open: boolean; setOpen: (open: boolean) => void };

const AddLibraryContext = createContext<AddLibraryContextValue | null>(null);

export function AddLibraryProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AddLibraryContext.Provider value={{ open, setOpen }}>{children}</AddLibraryContext.Provider>
  );
}

function useAddLibrary(): AddLibraryContextValue {
  const ctx = useContext(AddLibraryContext);
  if (!ctx) throw new Error("useAddLibrary must be used within AddLibraryProvider");
  return ctx;
}

/** Desktop: the section's one solid action, beside its heading. */
export function AddLibraryButton() {
  const { setOpen } = useAddLibrary();
  return (
    <HeaderButton variant="solid" h="44px" onClick={() => setOpen(true)}>
      <LuPlus aria-hidden="true" />
      Add library
    </HeaderButton>
  );
}

/** Phone: the "+" at the right of the PageHeader. */
export function AddLibraryHeaderButton() {
  const { setOpen } = useAddLibrary();
  return (
    <IconButton
      aria-label="Add library"
      variant="ghost"
      boxSize="44px"
      minW="44px"
      mr={-3}
      onClick={() => setOpen(true)}
    >
      <LuPlus />
    </IconButton>
  );
}

export const LIBRARIES_INTRO =
  "The Discogs collections GrooveNet syncs. The default is the library Tracks, Albums and Spins open on.";

// ── The list ───────────────────────────────────────────────────────────────

/** A row: a friends row, or the server's account before its first sync (no id yet). */
type LibraryRowData = {
  id: number | null;
  username: string;
  isAccount: boolean;
  releaseCount: number | null;
  lastSyncedAt: string | null;
};

const columnLabel = {
  fontFamily: "label",
  fontSize: "11px",
  fontWeight: "semibold",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
} as const;

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Unknown error");

const DESKTOP_COLUMNS = "minmax(0, 1fr) 110px 150px 296px";

function toRows(results: LibraryWithStats[], account: string | null): LibraryRowData[] {
  const rows = results.map<LibraryRowData>((library) => ({
    id: library.id,
    username: library.username,
    isAccount: library.is_account,
    releaseCount: library.release_count,
    lastSyncedAt: library.last_synced_at,
  }));
  if (account && !rows.some((row) => row.isAccount)) {
    rows.unshift({
      id: null,
      username: account,
      isAccount: true,
      releaseCount: null,
      lastSyncedAt: null,
    });
  }
  return rows;
}

function syncedLabel(lastSyncedAt: string | null): string {
  return lastSyncedAt ? formatDate(lastSyncedAt) : "Never";
}

type LibraryRowProps = {
  row: LibraryRowData;
  first: boolean;
  isDefault: boolean;
  /** The sync stream's one-line progress while this row syncs. */
  progress: string | null;
  syncDisabled: boolean;
  onMakeDefault: () => void;
  onSync: () => void;
  onRemove: () => void;
};

function LibraryRow({
  row,
  first,
  isDefault,
  progress,
  syncDisabled,
  onMakeDefault,
  onSync,
  onRemove,
}: LibraryRowProps) {
  const releases =
    row.releaseCount === null ? "Not synced" : `${row.releaseCount.toLocaleString()}`;
  const synced = progress ?? syncedLabel(row.lastSyncedAt);
  const phoneMeta = progress
    ? progress
    : row.releaseCount === null
      ? "Not synced yet"
      : `${row.releaseCount.toLocaleString()} releases · ${
          row.lastSyncedAt ? `synced ${formatDate(row.lastSyncedAt)}` : "never synced"
        }`;
  const canMakeDefault = !isDefault && row.id !== null;
  const iconButton = {
    variant: "outline" as const,
    boxSize: { base: "44px", md: "40px" },
    minW: { base: "44px", md: "40px" },
    flexShrink: 0,
  };

  return (
    <Box
      as="li"
      data-testid="library-row"
      display={{ base: "flex", md: "grid" }}
      flexDirection="column"
      gridTemplateColumns={DESKTOP_COLUMNS}
      gap={{ base: "10px", md: 4 }}
      alignItems={{ md: "center" }}
      minH={{ md: "72px" }}
      px={{ base: 3, md: 4 }}
      py={3}
      borderTopWidth={first ? 0 : "rule"}
      borderColor="border"
    >
      <Box minW={0}>
        <Flex align="center" gap={2} wrap="wrap">
          <Text fontSize="md" lineHeight="22px" fontWeight="semibold" minW={0} truncate>
            {row.username}
          </Text>
          {row.isAccount ? <SourceTag>Your account</SourceTag> : null}
          {isDefault ? <SourceTag stroke="fill">Default</SourceTag> : null}
        </Flex>
        <Text
          display={{ base: "none", md: "block" }}
          mt={1}
          fontSize="13px"
          lineHeight="18px"
          color="fg.muted"
        >
          {row.isAccount ? "Your Discogs account, set on the server" : "A friend’s collection"}
        </Text>
        <Text
          display={{ base: "block", md: "none" }}
          mt={1}
          {...columnLabel}
          fontWeight="normal"
          letterSpacing="0.04em"
          color="fg.muted"
          aria-live={progress ? "polite" : undefined}
        >
          {phoneMeta}
        </Text>
      </Box>
      <Text display={{ base: "none", md: "block" }} fontFamily="mono" fontSize="13px">
        {releases}
      </Text>
      <Text
        display={{ base: "none", md: "block" }}
        fontFamily="mono"
        fontSize="13px"
        aria-live={progress ? "polite" : undefined}
      >
        {synced}
      </Text>
      <Flex align="center" justify={{ md: "flex-end" }} gap={2}>
        {canMakeDefault ? (
          <Button
            variant="outline"
            h={{ base: "44px", md: "40px" }}
            px={3}
            flex={{ base: 1, md: "none" }}
            {...buttonLabel}
            onClick={onMakeDefault}
          >
            Make default
          </Button>
        ) : (
          <Box flex={{ base: 1, md: "none" }} />
        )}
        <IconButton
          {...iconButton}
          aria-label={`Sync ${row.username}`}
          onClick={onSync}
          loading={progress !== null}
          disabled={syncDisabled}
        >
          <FiRefreshCcw />
        </IconButton>
        {row.isAccount ? (
          // Your account can't be removed; the slot keeps the icons in line.
          <Box aria-hidden="true" boxSize={{ base: "44px", md: "40px" }} flexShrink={0} />
        ) : (
          <IconButton {...iconButton} aria-label={`Remove ${row.username}`} onClick={onRemove}>
            <FiTrash2 />
          </IconButton>
        )}
      </Flex>
    </Box>
  );
}

// ── Suggestions ────────────────────────────────────────────────────────────

/** The saved suggestion scope for the default library; behaviour as before #969. */
function SuggestionsBlock({ library }: { library: Friend | null }) {
  const settings = useRecommendationSettingsQuery(library?.id);
  const update = useUpdateRecommendationSettings();
  const headingId = React.useId();
  const name = library?.username ?? "the default library";

  let control: React.ReactNode;
  if (!library) control = null;
  else if (settings.isPending) control = <Spinner size="sm" />;
  else if (settings.error)
    control = <Text color="fg.error">Failed to load the suggestion scope.</Text>;
  else
    control = (
      <Flex align="center" gap={3} w={{ base: "full", md: "auto" }}>
        {update.isPending ? <Spinner size="sm" /> : null}
        <SuggestionScopeToggle
          size="md"
          value={settings.data?.scope ?? DEFAULT_RECOMMENDATION_SCOPE}
          onChange={(scope) =>
            update.mutate(
              { friend_id: library.id, scope },
              {
                onError: (err) =>
                  toaster.create({
                    title: "Failed to save suggestion scope",
                    description: err instanceof Error ? err.message : String(err),
                    type: "error",
                  }),
              },
            )
          }
        />
      </Flex>
    );

  return (
    <Box
      as="section"
      aria-labelledby={headingId}
      data-testid="suggestions-block"
      mt={{ base: 2, md: 4 }}
      pt={{ base: 4, md: 5 }}
      borderTopWidth="rule"
      borderColor="border"
      display="grid"
      gridTemplateColumns={{ base: "minmax(0, 1fr)", md: "minmax(0, 1fr) auto" }}
      gap={{ base: "10px", md: 6 }}
      alignItems={{ md: "center" }}
    >
      <Box>
        <Text
          as="h3"
          id={headingId}
          fontSize={{ base: "17px", md: "18px" }}
          lineHeight="24px"
          fontWeight="semibold"
        >
          Suggestions
        </Text>
        <Text mt={1} fontSize="sm" lineHeight="20px" color="fg.muted" maxW="520px">
          Where related tracks, similar tracks and playlist suggestions come from for {name}.
          <Box as="span" display={{ base: "none", md: "inline" }}>
            {" "}
            Each list can still switch for that view.
          </Box>
        </Text>
      </Box>
      {control}
    </Box>
  );
}

// ── The section ────────────────────────────────────────────────────────────

/**
 * Settings → Libraries (#969): your account and friends' collections in one
 * list, each with Make default, sync and remove, then the Suggestions scope.
 * Must sit inside `AddLibraryProvider` (the shell adds it).
 */
export default function LibrariesSettingsSection() {
  const qc = useQueryClient();
  const { open: addOpen, setOpen: setAddOpen } = useAddLibrary();
  const libraries = useLibrariesQuery();
  const { friend: defaultLibrary, setFriend, isSaving } = useUsername();
  const { addFriend } = useFriendsQuery();
  const { handleRemoveFriend } = useFriendsSync();
  const { discogs } = useSyncStreams();

  // Make default saves at once; `previous` is what UNDO restores.
  const [madeDefault, setMadeDefault] = useState<{ previous: Friend | null } | null>(null);

  // The library the last sync was started for, read only while a sync is busy.
  // `undefined` is the server account (the sync route's DISCOGS_USERNAME default).
  const [syncTarget, setSyncTarget] = useState<string | undefined>(undefined);
  // Manifests that need a look before that sync starts.
  const [verification, setVerification] = useState<VerificationResult[] | null>(null);
  const [removed, setRemoved] = useState<{ username: string; ids: string[] } | null>(null);
  const [toRemove, setToRemove] = useState<string | null>(null);

  const refreshLibraries = () => qc.invalidateQueries({ queryKey: queryKeys.libraries() });

  const discogsSync = useSyncDiscogs((data) => {
    if (data.removedIds.length > 0) setRemoved({ username: data.username, ids: data.removedIds });
  });
  const verifyManifests = useVerifyManifests();
  const cleanupManifests = useCleanupManifests();
  const deleteReleases = useDeleteReleases();

  const runSync = (username: string | undefined, showDialog = true) =>
    discogsSync.mutate({ username, showDialog }, { onSettled: refreshLibraries });

  const rows = toRows(libraries.data?.results ?? [], libraries.data?.account_username ?? null);
  const account = rows.find((row) => row.isAccount);

  const handleSyncClick = async (row: LibraryRowData) => {
    // The account syncs through the route's DISCOGS_USERNAME default, as before.
    const username = row.isAccount ? undefined : row.username;
    setSyncTarget(username);
    try {
      const result = await verifyManifests.mutateAsync();
      if (result.summary.totalManifests === 0) {
        runSync(username);
        return;
      }
      setVerification(result.results);
    } catch (err) {
      toaster.create({ title: "Verification Failed", description: errorText(err), type: "error" });
    }
  };

  const handleCleanupAndContinue = async () => {
    try {
      const result = await cleanupManifests.mutateAsync();
      toaster.create({
        title: "Manifest Cleaned",
        description: `Removed ${result.summary.totalRemoved} invalid entries`,
        type: "success",
      });
      setVerification(null);
      runSync(syncTarget);
    } catch (err) {
      toaster.create({ title: "Cleanup Failed", description: errorText(err), type: "error" });
    }
  };

  const handleContinueWithoutCleanup = () => {
    setVerification(null);
    runSync(syncTarget);
  };

  const handleDeleteRemovedReleases = async (removed: { username: string; ids: string[] }) => {
    try {
      const result = await deleteReleases.mutateAsync({
        username: removed.username,
        releaseIds: removed.ids,
      });
      toaster.create({
        title: "Releases Deleted",
        description: `Deleted ${result.deletedFromDb} tracks from database and search index. Sync continuing in background...`,
        type: "success",
        duration: 5000,
      });
      setRemoved(null);
    } catch (err) {
      toaster.create({ title: "Delete Failed", description: errorText(err), type: "error" });
    }
  };

  const handleSkipDeleteRemovedReleases = () => {
    setRemoved(null);
    toaster.create({
      title: "Skipped Deletion",
      description: "Files kept on disk. Sync continuing in background...",
      type: "info",
      duration: 5000,
    });
  };

  // Only a row with an id offers Make default.
  const makeDefault = (id: number, username: string) => {
    setMadeDefault({ previous: defaultLibrary });
    setFriend({ id, username });
  };

  // UNDO shows only once a default was made.
  const undoDefault = (previous: Friend | null) => {
    setFriend(previous);
    setMadeDefault(null);
  };

  const addLibrary = async (username: string) => {
    // Resolves once the list (under the friends key) has refetched with the new row.
    await addFriend(username);
    // The new row shows its own progress, so the sync dialog stays closed.
    setSyncTarget(username);
    runSync(username, false);
  };

  const syncBusy = discogsSync.isPending || verifyManifests.isPending;
  const progressFor = (row: LibraryRowData): string | null => {
    if (!syncBusy) return null;
    const syncing = syncTarget === undefined ? row.isAccount : syncTarget === row.username;
    if (!syncing) return null;
    return discogsSync.isPending ? librarySyncProgress(discogs.lines, discogs.error) : "Checking";
  };

  let list: React.ReactNode;
  if (libraries.isPending) {
    list = [0, 1, 2].map((i) => (
      <Box as="li" key={i} px={4} py={4} borderTopWidth={i ? "rule" : 0} borderColor="border">
        <Skeleton h="22px" w="40%" />
      </Box>
    ));
  } else if (libraries.isError) {
    list = (
      <Box as="li" p={4}>
        <Text color="fg.error">Couldn&apos;t load your libraries: {libraries.error.message}</Text>
      </Box>
    );
  } else if (rows.length === 0) {
    list = (
      <Box as="li" p={4}>
        <Text color="fg.muted">No libraries yet. Add one to start syncing.</Text>
      </Box>
    );
  } else {
    list = rows.map((row, index) => (
      <LibraryRow
        key={row.username}
        row={row}
        first={index === 0}
        isDefault={row.id !== null && row.id === defaultLibrary?.id}
        progress={progressFor(row)}
        syncDisabled={syncBusy}
        onMakeDefault={() => makeDefault(row.id as number, row.username)}
        onSync={() => handleSyncClick(row)}
        onRemove={() => setToRemove(row.username)}
      />
    ));
  }

  return (
    <Flex direction="column" gap={{ base: 4, md: 5 }}>
      {/* Phones keep no room for the status until there is one, as in the mockup. */}
      <Box css={{ "@media (max-width: 47.99em)": { "& > [role=status]:empty": { minHeight: 0 } } }}>
        <SavedStatus
          saved={madeDefault !== null && !isSaving}
          subject={defaultLibrary ? `Default set to ${defaultLibrary.username}` : undefined}
          onUndo={() => undoDefault((madeDefault as { previous: Friend | null }).previous)}
        />
      </Box>

      <Box
        mr="6px"
        borderWidth="outline"
        borderRadius="md"
        borderColor="border.ink"
        boxShadow="md"
        bg="bg"
        data-testid="libraries-list"
      >
        <Box
          display={{ base: "none", md: "grid" }}
          gridTemplateColumns={DESKTOP_COLUMNS}
          gap={4}
          alignItems="center"
          h="40px"
          px={4}
          bg="bg.subtle"
          borderBottomWidth="outline"
          borderColor="border.ink"
          aria-hidden="true"
          {...columnLabel}
        >
          <span>Library</span>
          <span>Releases</span>
          <span>Last synced</span>
          <Box as="span" textAlign="right">
            Actions
          </Box>
        </Box>
        <Box as="ul" listStyleType="none" m={0} p={0} aria-label="Libraries">
          {list}
        </Box>
      </Box>

      <SuggestionsBlock library={defaultLibrary} />

      <AddLibraryDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={addLibrary}
        existing={rows.map((row) => row.username)}
      />

      {/* Each dialog is mounted only while it has something to show, and only ever closes itself. */}
      {verification ? (
        <ManifestVerificationDialog
          open
          onOpenChange={() => setVerification(null)}
          results={verification}
          onCleanup={handleCleanupAndContinue}
          onContinue={handleContinueWithoutCleanup}
          cleanupPending={cleanupManifests.isPending}
        />
      ) : null}

      {removed ? (
        <RemovedReleasesDialog
          open
          onOpenChange={() => setRemoved(null)}
          username={removed.username}
          removedIds={removed.ids}
          onDelete={() => handleDeleteRemovedReleases(removed)}
          onSkip={handleSkipDeleteRemovedReleases}
          deletePending={deleteReleases.isPending}
        />
      ) : null}

      {toRemove ? (
        <ConfirmDialog
          open
          onOpenChange={() => setToRemove(null)}
          title={`Remove ${toRemove}`}
          body={
            <>
              <Text>
                Remove <strong>{toRemove}</strong> from your libraries?
              </Text>
              <Text mt={2} color="fg.muted" fontSize="sm">
                This deletes its tracks and albums from GrooveNet. You can add it again later.
              </Text>
            </>
          }
          confirmLabel="Remove library"
          onConfirm={async () => {
            // The remove dialog streams progress, then refreshes the list.
            void handleRemoveFriend(toRemove);
          }}
          pending={false}
        />
      ) : null}

      {account?.id === null ? (
        <Text fontSize="sm" color="fg.muted">
          Sync {account.username} once to make it a library you can set as the default.
        </Text>
      ) : null}
    </Flex>
  );
}
