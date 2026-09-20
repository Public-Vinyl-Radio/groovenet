"use client";

import React from "react";
import Image from "next/image";
import {
  Box,
  Button,
  Card,
  Flex,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import {
  FiCalendar,
  FiExternalLink,
  FiLink,
  FiMapPin,
  FiPlus,
  FiTrash2,
  FiUsers,
} from "react-icons/fi";
import { toaster } from "@/components/ui/toaster";
import { useFriendsQuery } from "@/hooks/useFriendsQuery";
import {
  createSetForPlaylist,
  deleteLiveSet,
  fetchLiveSet,
  type LiveSetDetail,
  type LiveSetMediaType,
  updateLiveSet,
} from "@/services/internalApi/playlists";

export default function SetDetailsPanel({
  playlistId,
}: {
  playlistId: number;
}) {
  const { friends } = useFriendsQuery({ showCurrentUser: true });
  const [set, setSet] = React.useState<LiveSetDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [performedAt, setPerformedAt] = React.useState("");
  const [performanceVenue, setPerformanceVenue] = React.useState("");
  const [performanceCity, setPerformanceCity] = React.useState("");
  const [mediaUrl, setMediaUrl] = React.useState("");
  const [mediaType, setMediaType] = React.useState<LiveSetMediaType>("flyer");
  const load = React.useCallback(async () => {
    try {
      setSet(await fetchLiveSet(playlistId));
    } catch {
      setSet(null);
    } finally {
      setLoading(false);
    }
  }, [playlistId]);
  React.useEffect(() => {
    void load();
  }, [load]);
  if (loading) return null;
  if (!set)
    return (
      <Card.Root size="sm" variant="outline" mt={2} mb={4}>
        <Card.Body p={3}>
          <Flex justify="space-between" align="center" gap={3}>
            <Flex align="center" gap={2} minW={0}>
              <FiCalendar />
              <Box>
              <Text fontWeight="semibold" fontSize="sm">Turn this playlist into a set</Text>
              <Text fontSize="xs" color="fg.muted">
                Add performances, collaborators, venues, and media when you need them.
              </Text>
            </Box>
            </Flex>
            <Button
              size="sm"
              onClick={async () => {
                await createSetForPlaylist(playlistId);
                await load();
              }}
              flexShrink={0}
            >
              Create set
            </Button>
          </Flex>
        </Card.Body>
      </Card.Root>
    );
  if (!editing)
    return (
      <Card.Root size="sm" variant="outline" mt={2} mb={4}>
        <Card.Body p={3}>
          <Flex
            direction={{ base: "column", md: "row" }}
            justify="space-between"
            align={{ base: "stretch", md: "flex-start" }}
            gap={{ base: 3, md: 4 }}
          >
            <Box minW={0}>
              <Flex align="center" gap={2} wrap="wrap">
                <FiCalendar />
                <Text fontWeight="semibold" fontSize="sm" lineClamp={1}>{set.title || "Planned set"}</Text>
                <Text fontSize="xs" color="fg.muted" textTransform="capitalize">
                  {set.status}
                </Text>
              </Flex>
              <Text fontSize="sm" color="fg.muted" mt={1}>
                {set.performances[0]
                  ? `Last played ${new Date(set.performances[0].performed_at).toLocaleDateString()}${set.performances[0].venue_name ? ` · ${set.performances[0].venue_name}` : ""}`
                  : [set.location_name, set.location_city]
                      .filter(Boolean)
                      .join(" · ") || "Not performed yet"}
              </Text>
              {set.collaborators.length > 0 && (
                <Text fontSize="sm" color="fg.muted" mt={1}>
                  {set.collaborators
                    .map((person) => person.username)
                    .join(", ")}
                </Text>
              )}
              {set.media.length > 0 && (
                <Text fontSize="sm" color="fg.muted" mt={1}>
                  {set.media.length} attachment
                  {set.media.length === 1 ? "" : "s"}
                </Text>
              )}
            </Box>
            <Button
              size="sm"
              variant="outline"
              width={{ base: "100%", md: "auto" }}
              onClick={() => setEditing(true)}
            >
              Edit set details
            </Button>
          </Flex>
        </Card.Body>
      </Card.Root>
    );
  const update = <K extends keyof LiveSetDetail>(
    key: K,
    value: LiveSetDetail[K],
  ) => setSet({ ...set, [key]: value });
  const toggleFriend = (friend: { id: number; username: string }) =>
    update(
      "collaborators",
      set.collaborators.some((c) => c.friend_id === friend.id)
        ? set.collaborators.filter((c) => c.friend_id !== friend.id)
        : [
            ...set.collaborators,
            {
              friend_id: friend.id,
              username: friend.username,
              role: "collaborator",
            },
          ],
    );
  const save = async () => {
    setSaving(true);
    try {
      await updateLiveSet(playlistId, set);
      toaster.create({ title: "Set details saved", type: "success" });
      await load();
      setEditing(false);
    } catch {
      toaster.create({ title: "Could not save set details", type: "error" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Box
        display={{ base: "block", md: "none" }}
        position="fixed"
        inset={0}
        bg="blackAlpha.600"
        zIndex="modal"
        onClick={() => { void load(); setEditing(false); }}
      />
      <Card.Root
        size="sm"
        variant="outline"
        mt={{ base: 0, md: 4 }}
        mb={{ base: 0, md: 4 }}
        position={{ base: "fixed", md: "static" }}
        bottom={{ base: 0, md: "auto" }}
        left={{ base: 0, md: "auto" }}
        right={{ base: 0, md: "auto" }}
        maxH={{ base: "92dvh", md: "none" }}
        overflowY="auto"
        borderBottomRadius={{ base: 0, md: "md" }}
        zIndex="modal"
      >
      <Card.Header pb={0} position="sticky" top={0} bg="bg.panel" zIndex={1}>
        <Flex align="center" gap={2}>
          <FiCalendar />
          <Text fontWeight="semibold">Set details</Text>
        </Flex>
      </Card.Header>
      <Card.Body>
        <VStack align="stretch" gap={4}>
          <Flex gap={2} wrap="wrap">
            <Input
              flex="1"
              value={set.title ?? ""}
              onChange={(e) => update("title", e.target.value || null)}
              placeholder="Set title"
            />
            <select
              value={set.status}
              onChange={(e) =>
                update("status", e.target.value as LiveSetDetail["status"])
              }
            >
              <option value="draft">Planned</option>
              <option value="performed">Performed</option>
              <option value="archived">Archived</option>
            </select>
          </Flex>
          <Flex gap={2}>
            <Input
              value={set.location_name ?? ""}
              onChange={(e) => update("location_name", e.target.value || null)}
              placeholder="Venue / location"
            />
            <Input
              value={set.location_city ?? ""}
              onChange={(e) => update("location_city", e.target.value || null)}
              placeholder="City"
            />
          </Flex>
          <Textarea
            value={set.notes ?? ""}
            onChange={(e) => update("notes", e.target.value || null)}
            placeholder="Set notes"
          />
          <Box>
            <Flex gap={2} align="center" mb={2}>
              <FiUsers />
              <Text fontSize="sm" fontWeight="medium">
                Collaborating libraries
              </Text>
            </Flex>
            <Flex wrap="wrap" gap={2}>
              {friends.map((f) => (
                <Button
                  key={f.id}
                  size="xs"
                  variant={
                    set.collaborators.some((c) => c.friend_id === f.id)
                      ? "solid"
                      : "outline"
                  }
                  onClick={() => toggleFriend(f)}
                >
                  {f.username}
                </Button>
              ))}
            </Flex>
          </Box>
          <Box>
            <Flex gap={2} align="center" mb={2}>
              <FiMapPin />
              <Text fontSize="sm" fontWeight="medium">
                Performance history
              </Text>
            </Flex>
            <Flex gap={2} wrap="wrap">
              <Input
                type="datetime-local"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
              />
              <Input
                value={performanceVenue}
                onChange={(e) => setPerformanceVenue(e.target.value)}
                placeholder="Venue"
              />
              <Input
                value={performanceCity}
                onChange={(e) => setPerformanceCity(e.target.value)}
                placeholder="City"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (performedAt) {
                    update("performances", [
                      ...set.performances,
                      {
                        performed_at: new Date(performedAt).toISOString(),
                        venue_name: performanceVenue || set.location_name,
                        location_city: performanceCity || set.location_city,
                        notes: null,
                      },
                    ]);
                    setPerformedAt("");
                    setPerformanceVenue("");
                    setPerformanceCity("");
                  }
                }}
              >
                <FiPlus /> Add
              </Button>
            </Flex>
            {set.performances.map((p, i) => (
              <Flex
                key={`${p.performed_at}-${i}`}
                justify="space-between"
                align="center"
                mt={1}
              >
                <Text fontSize="sm" color="fg.muted">
                  {new Date(p.performed_at).toLocaleDateString()} ·{" "}
                  {p.venue_name || "No venue"}
                  {p.location_city ? `, ${p.location_city}` : ""}
                </Text>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label="Remove performance"
                  onClick={() =>
                    update(
                      "performances",
                      set.performances.filter((_, index) => index !== i),
                    )
                  }
                >
                  <FiTrash2 />
                </Button>
              </Flex>
            ))}
          </Box>
          <Box>
            <Flex gap={2} align="center" mb={2}>
              <FiLink />
              <Text fontSize="sm" fontWeight="medium">
                Media links
              </Text>
            </Flex>
            <Flex gap={2}>
              <select
                value={mediaType}
                onChange={(e) =>
                  setMediaType(e.target.value as LiveSetMediaType)
                }
              >
                <option value="flyer">Flyer</option>
                <option value="image">Photo</option>
                <option value="audio">Mix audio</option>
                <option value="youtube">YouTube</option>
                <option value="link">Link</option>
              </select>
              <Input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://…"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (mediaUrl.trim()) {
                    update("media", [
                      ...set.media,
                      {
                        media_type: mediaType,
                        url: mediaUrl,
                        filename: null,
                        caption: null,
                      },
                    ]);
                    setMediaUrl("");
                  }
                }}
              >
                <FiPlus /> Add
              </Button>
            </Flex>
            {set.media.map((m, i) => (
              <Flex
                key={`${m.url}-${i}`}
                gap={2}
                align="center"
                mt={2}
                borderWidth="1px"
                rounded="md"
                p={2}
              >
                {(m.media_type === "flyer" || m.media_type === "image") && (
                    <Image
                      src={m.url}
                      alt={m.media_type}
                      width={56}
                      height={56}
                      unoptimized
                      style={{ objectFit: "cover", borderRadius: 4 }}
                    />
                )}
                {m.media_type === "audio" && (
                  <audio controls src={m.url} style={{ maxWidth: 260 }} />
                )}
                <Text fontSize="sm" flex="1" lineClamp={1}>
                  {m.media_type === "youtube" ? "YouTube video" : m.media_type}
                </Text>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label="Open media"
                  onClick={() =>
                    window.open(m.url, "_blank", "noopener,noreferrer")
                  }
                >
                  <FiExternalLink />
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label="Remove media"
                  onClick={() =>
                    update(
                      "media",
                      set.media.filter((_, index) => index !== i),
                    )
                  }
                >
                  <FiTrash2 />
                </Button>
              </Flex>
            ))}
          </Box>
          <Flex justify="space-between" gap={2}>
            <Button size="sm" variant="ghost" colorPalette="red" onClick={async () => {
              if (!window.confirm("Remove this set? The playlist will be kept, but its set history and attachments will be removed.")) return;
              try { await deleteLiveSet(playlistId); setSet(null); setEditing(false); toaster.create({ title: "Set removed; playlist kept", type: "success" }); }
              catch { toaster.create({ title: "Could not remove set", type: "error" }); }
            }}>Remove set</Button>
            <Flex gap={2}>
              <Button size="sm" variant="ghost" onClick={() => { void load(); setEditing(false); }}>Cancel</Button>
              <Button size="sm" colorPalette="purple" loading={saving} onClick={save}>Save set details</Button>
            </Flex>
          </Flex>
        </VStack>
      </Card.Body>
      </Card.Root>
    </>
  );
}
