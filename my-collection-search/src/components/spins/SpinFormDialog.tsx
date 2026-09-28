"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  CloseButton,
  Dialog,
  Drawer,
  Flex,
  HStack,
  Input,
  Portal,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  Textarea,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react";
import { toaster } from "@/components/ui/toaster";
import { useSpinMutations } from "@/hooks/useSpinsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { getAlbumPlayableStructure } from "@/services/internalApi/albums";
import {
  buildSpinChanges,
  initialSpinFormState,
  parseTrackKey,
  trackKey,
  type SpinFormState,
} from "./spinForm";
import type { SpinListItem } from "./spinSummary";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releaseId: string;
  friendId: number;
  albumTitle?: string;
  /** The spin to edit; omit to log a new one. */
  spin?: SpinListItem;
};

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export default function SpinFormDialog({
  open,
  onOpenChange,
  releaseId,
  friendId,
  albumTitle,
  spin,
}: Props) {
  const isEdit = Boolean(spin);
  const title = isEdit ? "Edit Vinyl Spin" : "Log Vinyl Spin";
  const isDesktop = useBreakpointValue({ base: false, md: true }) ?? true;

  // The form resets each time it opens — blank for a new spin, filled from the
  // spin being edited — and `initial` is what an edit is diffed against.
  const [initial, setInitial] = React.useState<SpinFormState>(() => initialSpinFormState(spin));
  const [form, setForm] = React.useState<SpinFormState>(initial);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const fresh = initialSpinFormState(spin);
      setInitial(fresh);
      setForm(fresh);
    }
  }
  const update = (patch: Partial<SpinFormState>) => setForm((current) => ({ ...current, ...patch }));

  const playableStructureQuery = useQuery({
    queryKey: queryKeys.albumPlayableStructure(releaseId, friendId),
    queryFn: () => getAlbumPlayableStructure(releaseId, friendId),
    enabled: open && !!releaseId && !!friendId,
    staleTime: 5 * 60_000,
  });
  const sides = React.useMemo(
    () => playableStructureQuery.data?.sides ?? [],
    [playableStructureQuery.data]
  );
  const { createSpin, updateSpin, createSpinPending, updateSpinPending } =
    useSpinMutations(friendId);

  const sideByTrackKey = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const side of sides) {
      for (const track of side.tracks) map.set(trackKey(track.track_id, track.friend_id), side.side_key);
    }
    return map;
  }, [sides]);

  const selectedTrackCount =
    form.selectionMode === "sides"
      ? sides
          .filter((side) => form.sideKeys.includes(side.side_key))
          .reduce((count, side) => count + side.track_count, 0)
      : form.trackKeys.length;
  const selectedSideCount =
    form.selectionMode === "sides"
      ? form.sideKeys.length
      : new Set(form.trackKeys.map((key) => sideByTrackKey.get(key))).size;
  const isFullAlbumSpin =
    form.selectionMode === "sides" && sides.length > 0 && form.sideKeys.length === sides.length;

  const fail = (title: string, description: string) =>
    toaster.create({ title, description, type: "error" });

  const handleSubmit = async () => {
    if (!form.playedAtInput) {
      fail("Missing played time", "Choose when the vinyl spin happened.");
      return;
    }
    if (form.selectionMode === "sides" ? form.sideKeys.length === 0 : form.trackKeys.length === 0) {
      fail(
        form.selectionMode === "sides" ? "No sides selected" : "No tracks selected",
        `Choose at least one ${form.selectionMode === "sides" ? "side" : "track"}.`
      );
      return;
    }

    try {
      if (spin) {
        const changes = buildSpinChanges(initial, form);
        if (!changes) {
          onOpenChange(false);
          return;
        }
        await updateSpin(spin.session.id, changes);
        toaster.create({
          title: "Spin updated",
          description:
            spin.session.provenance === "automatic" ? "Marked as corrected." : undefined,
          type: "success",
        });
      } else {
        const selection =
          form.selectionMode === "sides"
            ? { side_keys: form.sideKeys }
            : { track_refs: form.trackKeys.map(parseTrackKey) };
        await createSpin({
          friend_id: friendId,
          release_id: releaseId,
          played_at: new Date(form.playedAtInput).toISOString(),
          note: form.note.trim() || null,
          context_type: form.contextType.trim() || null,
          ...selection,
        });
        const count = form.selectionMode === "sides" ? selectedSideCount : selectedTrackCount;
        const unit = form.selectionMode === "sides" ? "side" : "track";
        toaster.create({
          title: "Spin logged",
          description: `Logged ${count} ${unit}${count === 1 ? "" : "s"}${albumTitle ? ` for ${albumTitle}` : ""}`,
          type: "success",
        });
      }
      onOpenChange(false);
    } catch (error) {
      fail(
        isEdit ? "Failed to update spin" : "Failed to log spin",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  };

  const formBody = (
    <Stack gap={4}>
      <Text fontSize="sm" color="fg.muted">
        {spin?.session.provenance === "automatic"
          ? "Saving a change marks this detected spin as corrected."
          : "This logs a physical record spin, separate from app playback."}
      </Text>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Played At</Text>
          <Input
            type="datetime-local"
            value={form.playedAtInput}
            onChange={(event) => update({ playedAtInput: event.target.value })}
          />
        </Box>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Context</Text>
          <Input
            value={form.contextType}
            onChange={(event) => update({ contextType: event.target.value })}
            placeholder="home, gig, practice"
          />
        </Box>
      </SimpleGrid>

      <Box>
        <Text fontSize="sm" fontWeight="medium" mb={1}>Note</Text>
        <Textarea
          value={form.note}
          onChange={(event) => update({ note: event.target.value })}
          placeholder="Optional note about this spin"
          rows={3}
        />
      </Box>

      <HStack gap={2} wrap="wrap">
        <Button
          size="sm"
          variant={form.selectionMode === "sides" ? "solid" : "outline"}
          onClick={() => update({ selectionMode: "sides" })}
        >
          By sides
        </Button>
        <Button
          size="sm"
          variant={form.selectionMode === "tracks" ? "solid" : "outline"}
          onClick={() => update({ selectionMode: "tracks" })}
        >
          By tracks
        </Button>
        {form.selectionMode === "sides" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => update({ sideKeys: sides.map((side) => side.side_key) })}
            >
              Select all sides
            </Button>
            <Button size="sm" variant="ghost" onClick={() => update({ sideKeys: [] })}>
              Clear
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => update({ trackKeys: Array.from(sideByTrackKey.keys()) })}
            >
              Select all tracks
            </Button>
            <Button size="sm" variant="ghost" onClick={() => update({ trackKeys: [] })}>
              Clear
            </Button>
          </>
        )}
      </HStack>

      <HStack gap={2} wrap="wrap">
        <Badge colorPalette="blue">
          {form.selectionMode === "sides"
            ? `${selectedSideCount} side${selectedSideCount === 1 ? "" : "s"} selected`
            : `${selectedTrackCount} track${selectedTrackCount === 1 ? "" : "s"} selected`}
        </Badge>
        <Badge variant="outline">
          {selectedTrackCount} track event{selectedTrackCount === 1 ? "" : "s"}
        </Badge>
        {isFullAlbumSpin && <Badge colorPalette="green">Full album</Badge>}
      </HStack>

      {playableStructureQuery.isLoading ? (
        <Flex justify="center" py={8}>
          <Spinner size="sm" />
        </Flex>
      ) : playableStructureQuery.error ? (
        <Text color="red.500">
          {playableStructureQuery.error instanceof Error
            ? playableStructureQuery.error.message
            : "Failed to load playable structure"}
        </Text>
      ) : (
        <Stack gap={3}>
          {sides.map((side) => (
            <Box key={side.side_key} borderWidth="1px" borderRadius="md" p={3}>
              <HStack gap={2}>
                {form.selectionMode === "sides" && (
                  <Checkbox.Root
                    checked={form.sideKeys.includes(side.side_key)}
                    onCheckedChange={() => update({ sideKeys: toggle(form.sideKeys, side.side_key) })}
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control />
                  </Checkbox.Root>
                )}
                <Text fontWeight="semibold">{side.side_label}</Text>
                <Badge variant="outline">{side.track_count} tracks</Badge>
              </HStack>
              <Stack gap={2} mt={3}>
                {side.tracks.map((track) => {
                  const key = trackKey(track.track_id, track.friend_id);
                  return (
                    <Flex key={key} align="center" gap={3} p={2} borderRadius="md" bg="bg.subtle">
                      <HStack gap={3} minW={0}>
                        {form.selectionMode === "tracks" && (
                          <Checkbox.Root
                            checked={form.trackKeys.includes(key)}
                            onCheckedChange={() => update({ trackKeys: toggle(form.trackKeys, key) })}
                          >
                            <Checkbox.HiddenInput />
                            <Checkbox.Control />
                          </Checkbox.Root>
                        )}
                        <VStack align="start" gap={0} minW={0}>
                          <Text fontSize="sm" fontWeight="medium" lineClamp={1}>
                            {track.title}
                          </Text>
                          <Text fontSize="xs" color="fg.muted">
                            {track.position ? `${track.position} · ` : ""}{track.artist}
                          </Text>
                        </VStack>
                      </HStack>
                    </Flex>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );

  const saving = isEdit ? updateSpinPending : createSpinPending;
  const saveLabel = isEdit ? "Save Changes" : "Save Spin";

  return isDesktop ? (
    <Dialog.Root open={open} onOpenChange={(details) => onOpenChange(details.open)} size="xl">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body pb={6}>{formBody}</Dialog.Body>
            <Dialog.Footer>
              <HStack gap={2}>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button loading={saving} onClick={handleSubmit}>{saveLabel}</Button>
              </HStack>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  ) : (
    <Drawer.Root placement="bottom" open={open} onOpenChange={(details) => onOpenChange(details.open)}>
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content borderTopRadius="xl" maxH="92vh">
            <Drawer.Header borderBottomWidth="1px" py={3} px={4} position="relative">
              <Text fontWeight="semibold" fontSize="sm">{title}</Text>
              <Drawer.CloseTrigger asChild>
                <CloseButton size="sm" position="absolute" right={3} top="50%" transform="translateY(-50%)" />
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body p={4} overflowY="auto">{formBody}</Drawer.Body>
            <Drawer.Footer borderTopWidth="1px" pt={3} pb="max(env(safe-area-inset-bottom), 16px)" px={4}>
              <HStack gap={2} w="full">
                <Button variant="outline" flex={1} onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button flex={1} loading={saving} onClick={handleSubmit}>{saveLabel}</Button>
              </HStack>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
