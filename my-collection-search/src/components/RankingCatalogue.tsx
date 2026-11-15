"use client";

import { FiUpload } from "react-icons/fi";
import { useState } from "react";
import Link from "next/link";
import { Box, Button, Flex, Input, NativeSelect, Text } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MAX_RANKING_FILE_BYTES } from "@groovenet/contracts";
import PageHeader from "@/components/layout/PageHeader";
import RetroDialog from "@/components/ui/RetroDialog";
import { SourceTag } from "@/components/ui/RoleTags";
import { useFriendsQuery } from "@/hooks/useFriendsQuery";
import { useRankingProfilesQuery, useSetActiveRankingProfile } from "@/hooks/useRankingProfiles";
import { queryKeys } from "@/lib/queryKeys";
import {
  exportRankingProfile,
  fetchRankingProfiles,
  importRankingProfile,
  useFriendRankingProfile as copyFriendRankingProfile,
} from "@/services/internalApi/ranking";

export default function RankingCatalogue() {
  const { data, friendId, isError } = useRankingProfilesQuery();
  const { friends } = useFriendsQuery();
  const qc = useQueryClient();
  const choose = useSetActiveRankingProfile();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [imported, setImported] = useState(false);
  const [sourceId, setSourceId] = useState(0);
  const source = friends.find((friend) => friend.id === sourceId);
  const friendProfiles = useQuery({
    queryKey: queryKeys.rankingProfiles(sourceId),
    queryFn: () => fetchRankingProfiles(sourceId),
    enabled: sourceId > 0,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.rankingProfiles(friendId) });
  const importing = useMutation({
    mutationFn: () => importRankingProfile(friendId, text),
    onSuccess: (result) => {
      setWarnings(result.warnings);
      setImported(true);
      setError("");
      void refresh();
    },
    onError: (e: Error) => setError(e.message),
  });
  const using = useMutation({
    mutationFn: (id: string) => copyFriendRankingProfile(id, friendId, sourceId),
    onSuccess: refresh,
  });
  const exporting = useMutation({
    mutationFn: async (id: string) => {
      const file = await exportRankingProfile(id);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2) + "\n"], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "ranking-profile.json";
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <Box>
      <PageHeader>
        <PageHeader.Title>Ranking profiles</PageHeader.Title>
        <PageHeader.Actions
          actions={[
            {
              label: "Import profile",
              icon: <FiUpload />,
              primary: true,
              disabled: friendId <= 0,
              onClick: () => {
                setOpen(true);
                setText("");
                setError("");
                setWarnings([]);
                setImported(false);
              },
            },
          ]}
        />
      </PageHeader>
      <Flex direction="column" gap={5} py={5}>
        <Text>Presets, your own profiles and independent copies shared by other DJs.</Text>
        <Link href="/settings/ranking">Tune weights and constraints in Ranking settings</Link>
        {isError ? <Text role="alert">Could not load your profiles.</Text> : null}
        {exporting.error || choose.error || using.error ? (
          <Text role="alert">{(exporting.error || choose.error || using.error)?.message}</Text>
        ) : null}
        <Box
          as="ul"
          listStyleType="none"
          borderWidth="outline"
          borderColor="border.ink"
          boxShadow="md"
        >
          {data.profiles.map((profile, index) => (
            <Flex
              as="li"
              key={profile.id}
              direction={{ base: "column", md: "row" }}
              gap={3}
              p={4}
              borderTopWidth={index ? "rule" : 0}
              borderColor="border"
            >
              <Box flex={1}>
                <Text fontWeight="semibold">{profile.name}</Text>
                <Text fontSize="sm">{profile.description}</Text>
                <SourceTag size="xs" stroke="dashed">
                  {profile.kind === "preset"
                    ? "Preset"
                    : profile.origin === "friend"
                      ? `From ${profile.source_handle ?? "a friend"}`
                      : profile.origin === "file"
                        ? `Imported${profile.author ? ` · ${profile.author}` : ""}`
                        : "Your profile"}
                </SourceTag>
              </Box>
              <Flex gap={2} align="center" wrap="wrap">
                <Button
                  variant="outline"
                  disabled={friendId <= 0 || profile.invalid || choose.isPending}
                  onClick={() => choose.mutate({ friend_id: friendId, profile_id: profile.id })}
                >
                  Use
                </Button>
                <Button
                  variant="outline"
                  disabled={profile.invalid || exporting.isPending}
                  onClick={() => exporting.mutate(profile.id)}
                >
                  Export
                </Button>
              </Flex>
            </Flex>
          ))}
        </Box>
        <Text fontWeight="semibold">Use a friend’s profile</Text>
        <Text fontSize="sm">
          This copies the profile into your library and uses it. Later edits to theirs won’t change
          yours.
        </Text>
        <NativeSelect.Root>
          <NativeSelect.Field
            aria-label="Friend library"
            value={sourceId}
            onChange={(e) => setSourceId(Number(e.target.value))}
          >
            <option value={0}>Choose a friend</option>
            {friends
              .filter((friend) => friend.id !== friendId)
              .map((friend) => (
                <option key={friend.id} value={friend.id}>
                  {friend.username}
                </option>
              ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        {friendProfiles.isError ? (
          <Text role="alert">Could not load your friend’s profiles.</Text>
        ) : null}
        {source ? (
          <Box>
            {friendProfiles.data?.profiles
              .filter((profile) => profile.kind === "custom")
              .map((profile) => (
                <Flex key={profile.id} gap={3} py={3} align="center" wrap="wrap">
                  <Box flex={1}>
                    <Text>{profile.name}</Text>
                    <Text fontSize="sm">{profile.description}</Text>
                  </Box>
                  <Button
                    variant="outline"
                    disabled={friendId <= 0 || profile.invalid || using.isPending}
                    onClick={() => using.mutate(profile.id)}
                  >
                    Use {source.username}’s profile
                  </Button>
                </Flex>
              ))}
            {friendProfiles.data?.profiles.every((profile) => profile.kind === "preset") ? (
              <Text>No custom profiles in this library.</Text>
            ) : null}
          </Box>
        ) : null}
      </Flex>
      <RetroDialog
        open={open}
        onOpenChange={setOpen}
        title="Import ranking profile"
        fullScreenOnMobile
      >
        <Flex direction="column" gap={4} p={4}>
          <Text fontSize="sm">
            Choose a Groovenet ranking profile JSON file. It contains settings, with no collection
            data.
          </Text>
          <Input
            aria-label="Profile file"
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImported(false);
              setWarnings([]);
              setError("");
              setText("");
              if (file.size > MAX_RANKING_FILE_BYTES) {
                setError(`Ranking file exceeds ${MAX_RANKING_FILE_BYTES} bytes`);
                return;
              }
              try {
                setText(await file.text());
              } catch {
                setError("Could not read profile file");
              }
            }}
          />
          {error ? <Text role="alert">{error}</Text> : null}
          {imported ? (
            <Text role="status">
              Profile imported.{" "}
              {warnings.length ? "Review the warnings below." : "Ready to use in your library."}
            </Text>
          ) : null}
          {warnings.map((warning) => (
            <Text key={warning} role="status">
              {warning}
            </Text>
          ))}
          <Button
            variant="solid"
            disabled={!text || imported || importing.isPending}
            onClick={() => importing.mutate()}
          >
            Import
          </Button>
        </Flex>
      </RetroDialog>
    </Box>
  );
}
