"use client";

import React, { useId, useState } from "react";
import { Box, Button, Flex, Skeleton, Text, Textarea } from "@chakra-ui/react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { TrackLyricsState } from "@/services/internalApi/trackLyrics";

export type TrackLyricsPanelProps = {
  /** Undefined while the first read is in flight. */
  state: TrackLyricsState | undefined;
  error?: Error | null;
  saving?: boolean;
  clearing?: boolean;
  onSave: (text: string) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  /** Collapsed by default; stories open it. */
  defaultOpen?: boolean;
  /** Start in the editor (stories). */
  defaultEditing?: boolean;
};

const SOURCE_LABEL = { embedded: "From file", user: "Edited" } as const;

/**
 * Lyrics on the track page (#1171), collapsed by default: a song's words are
 * long and most visits are for BPM and key. Your own library only, so a
 * friend's track renders nothing. Lyrics read from the file say "From file";
 * typed ones say "Edited", and a re-read of the file never replaces them.
 * Clearing deletes the row, so the next tag read can fill it from the file.
 */
export default function TrackLyricsPanel({
  state,
  error,
  saving = false,
  clearing = false,
  onSave,
  onClear,
  defaultOpen = false,
  defaultEditing = false,
}: TrackLyricsPanelProps) {
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen || defaultEditing);
  const [draft, setDraft] = useState<string | null>(
    defaultEditing ? (state?.kind === "lyrics" ? state.lyrics.text : "") : null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  if (state?.kind === "not_owner") return null;

  const lyrics = state?.kind === "lyrics" ? state.lyrics : null;
  const editing = draft !== null;
  const meta = lyrics ? SOURCE_LABEL[lyrics.source] : state?.kind === "none" ? "None" : undefined;

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
      setDraft(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const startEditing = () => {
    setOpen(true);
    setDraft(lyrics?.text ?? "");
  };

  let body: React.ReactNode;
  if (error) {
    body = <Text color="fg.error">{error.message}</Text>;
  } else if (!state) {
    body = <Skeleton height="80px" />;
  } else if (editing) {
    const blank = draft.trim().length === 0;
    body = (
      <Flex direction="column" gap={3}>
        <Textarea
          aria-label="Lyrics"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={12}
          fontSize="16px"
          autoFocus
        />
        <Flex gap={2} wrap="wrap" align="center">
          <Button
            size="sm"
            variant="solid"
            loading={saving}
            disabled={blank || clearing}
            onClick={() => run(() => onSave(draft))}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving || clearing}
            onClick={() => setDraft(null)}
          >
            Cancel
          </Button>
          {lyrics && (
            <Button
              size="sm"
              variant="outline"
              colorPalette="danger"
              ml="auto"
              loading={clearing}
              disabled={saving}
              onClick={() => run(onClear)}
            >
              Clear lyrics
            </Button>
          )}
        </Flex>
        {lyrics && (
          <Text fontSize="sm" color="fg.muted">
            Clearing removes these lyrics. The next tag read fills them from the file again, if it
            has any.
          </Text>
        )}
      </Flex>
    );
  } else if (lyrics) {
    body = (
      <Text whiteSpace="pre-wrap" overflowWrap="anywhere" data-testid="track-lyrics-text">
        {lyrics.text}
      </Text>
    );
  } else {
    body = (
      <Flex direction="column" gap={3} align="flex-start">
        <Text color="fg.muted">No lyrics. An instrumental, or the file carries none.</Text>
        <Button size="sm" variant="outline" onClick={startEditing}>
          Add lyrics
        </Button>
      </Flex>
    );
  }

  return (
    <Box
      as="section"
      aria-label="Lyrics"
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="sm"
      p={4}
      mt={4}
      borderRadius="md"
    >
      <SectionHeading
        meta={meta}
        actions={
          <Flex gap={1}>
            {open && lyrics && !editing && (
              <Button size="xs" variant="ghost" onClick={startEditing}>
                Edit
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Hide" : "Show"}
            </Button>
          </Flex>
        }
      >
        Lyrics
      </SectionHeading>
      <Box id={bodyId} hidden={!open} mt={3}>
        {open && body}
        {open && actionError && (
          <Text color="fg.error" mt={2} role="alert">
            {actionError}
          </Text>
        )}
      </Box>
    </Box>
  );
}
