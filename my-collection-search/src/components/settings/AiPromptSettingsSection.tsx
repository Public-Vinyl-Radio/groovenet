"use client";

import React from "react";
import { Box, Button, Flex, NativeSelect, Spinner, Text, Textarea } from "@chakra-ui/react";
import { StatusTag } from "@/components/ui/RoleTags";
import { toaster } from "@/components/ui/toaster";
import { useFriendsQuery } from "@/hooks/useFriendsQuery";
import { useUsername } from "@/providers/UsernameProvider";
import { fetchAiPromptSettings, updateAiPromptSettings } from "@/services/internalApi/settings";
import SavedStatus from "./SavedStatus";
import SettingsRow from "./SettingsRow";

export const AI_METADATA_INTRO =
  "The prompt that asks the model for a track’s genres, mood and notes. Each library has its own.";

const MIN_ROWS = 8;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

const clockTime = () =>
  new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

type Saved = { time: string; previous: string | null };

/** Settings → AI metadata (#971): the prompt for one library, saved as you leave the box. */
export default function AiPromptSettingsSection(): React.JSX.Element {
  const { friend } = useUsername();
  const { friends } = useFriendsQuery({ showCurrentUser: true });

  const [pickedId, setPickedId] = React.useState<number | undefined>(undefined);
  const libraryId = pickedId ?? friend?.id;

  const [prompt, setPrompt] = React.useState("");
  // What the server holds for the library: the baseline a blur compares against.
  const [stored, setStored] = React.useState("");
  const [defaultPrompt, setDefaultPrompt] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<Saved | null>(null);

  React.useEffect(() => {
    let current = true;
    const run = async () => {
      setLoading(true);
      setSaved(null);
      try {
        const data = await fetchAiPromptSettings({ friend_id: libraryId });
        if (!current) return;
        setPrompt(data.prompt || data.defaultPrompt || "");
        setStored(data.prompt || "");
        setDefaultPrompt(data.defaultPrompt || "");
        setIsDefault(Boolean(data.isDefault));
      } catch (err) {
        if (!current) return;
        toaster.create({
          title: "Failed to load AI prompt",
          description: errorMessage(err),
          type: "error",
        });
      } finally {
        if (current) setLoading(false);
      }
    };
    run();
    return () => {
      current = false;
    };
  }, [libraryId]);

  /** Saves `next`; an empty prompt means the default. `previous` is what Undo restores. */
  const persist = async (next: string, previous: string | null) => {
    if (libraryId === undefined) {
      toaster.create({ title: "Select a library first", type: "warning" });
      return;
    }
    setSaving(true);
    try {
      const data = await updateAiPromptSettings({ friend_id: libraryId, prompt: next });
      const shown = data.prompt || (data.isDefault ? defaultPrompt : next);
      setPrompt(shown);
      setStored(data.isDefault ? "" : shown);
      setIsDefault(Boolean(data.isDefault));
      setSaved({ time: clockTime(), previous });
    } catch (err) {
      toaster.create({
        title: "Failed to save prompt",
        description: errorMessage(err),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBlur = () => {
    // The default text shown unchanged is not a custom prompt.
    const next = isDefault && prompt === defaultPrompt ? "" : prompt;
    if (next === stored) return;
    void persist(next, stored);
  };

  const rows = Math.max(
    MIN_ROWS,
    prompt.split("\n").length + 1,
    defaultPrompt.split("\n").length + 1,
  );

  return (
    <Flex direction="column" gap={4}>
      <Box borderWidth="outline" borderColor="border.ink" borderRadius="md" px={{ base: 4, md: 5 }}>
        <SettingsRow label="Prompt for" help="Prompts are stored per library.">
          <Flex align="center" gap={3} flexWrap="wrap">
            <NativeSelect.Root size="sm" w="auto" minW="180px">
              <NativeSelect.Field
                aria-label="Prompt for"
                value={libraryId ?? ""}
                onChange={(e) => setPickedId(Number(e.currentTarget.value))}
              >
                {friends.map((library) => (
                  <option key={library.id} value={library.id}>
                    {library.username}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            {loading ? <Spinner size="sm" /> : null}
            <StatusTag tone={isDefault ? "neutral" : "analysis"}>
              {isDefault ? "Default" : "Custom"}
            </StatusTag>
          </Flex>
        </SettingsRow>
      </Box>

      <Textarea
        aria-label="Prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onBlur={handleBlur}
        rows={rows}
        resize="vertical"
        fontFamily="mono"
        fontSize="sm"
        borderColor="border.ink"
        placeholder="Enter your AI system prompt..."
      />

      <Flex align="center" gap={3} flexWrap="wrap">
        <Button
          size="sm"
          variant="outline"
          disabled={saving || isDefault}
          onClick={() => void persist("", stored)}
        >
          Reset to default
        </Button>
        <SavedStatus
          saved={saved !== null && !saving}
          detail={saved?.time}
          onUndo={
            saved?.previous !== null && saved
              ? () => void persist(saved.previous ?? "", null)
              : undefined
          }
        />
      </Flex>

      <Text fontSize="sm" color="fg.muted" maxW="60ch">
        Keep the JSON field names in the prompt as they are: they are what GrooveNet reads back from
        the model’s reply.
      </Text>
    </Flex>
  );
}
