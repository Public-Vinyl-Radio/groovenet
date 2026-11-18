"use client";

import React, { useState } from "react";
import { Box, Button, Flex, Skeleton, Text, Textarea } from "@chakra-ui/react";
import type { TrackLyricsState } from "@/services/internalApi/trackLyrics";

export type TrackLyricsPanelProps = {
  /** Undefined while the first read is in flight. */
  state: TrackLyricsState | undefined;
  error?: Error | null;
  saving?: boolean;
  clearing?: boolean;
  onSave: (text: string) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  /** Start in the editor (stories). */
  defaultEditing?: boolean;
};

const SOURCE_LABEL = { embedded: "From file", user: "Edited" } as const;

/**
 * A track's lyrics (#1171), the body of the Lyrics dialog that the track page's
 * ⋯ menu opens (#1214): a song's words are long and most visits are for BPM and
 * key, so they don't take a section. Your own library only, so a friend's track
 * renders nothing. Lyrics read from the file say "From file"; typed ones say
 * "Edited", and a re-read of the file never replaces them. Clearing deletes the
 * row, so the next tag read can fill it from the file.
 */
export default function TrackLyricsPanel({
  state,
  error,
  saving = false,
  clearing = false,
  onSave,
  onClear,
  defaultEditing = false,
}: TrackLyricsPanelProps) {
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

  const startEditing = () => setDraft(lyrics?.text ?? "");

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
    <Box data-testid="track-lyrics-panel">
      {meta && (
        <Flex align="center" justify="space-between" gap={2} mb={3} minH="32px">
          <Text
            as="span"
            fontFamily="label"
            fontSize="11px"
            lineHeight="16px"
            letterSpacing="0.08em"
            textTransform="uppercase"
            color="fg.muted"
          >
            {meta}
          </Text>
          {lyrics && !editing && (
            <Button size="xs" variant="ghost" minH="44px" onClick={startEditing}>
              Edit
            </Button>
          )}
        </Flex>
      )}
      {body}
      {actionError && (
        <Text color="fg.error" mt={2} role="alert">
          {actionError}
        </Text>
      )}
    </Box>
  );
}
