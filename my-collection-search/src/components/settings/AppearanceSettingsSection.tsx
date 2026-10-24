"use client";

import React from "react";
import { Box, chakra, Flex, Heading, SegmentGroup, Spinner, Text } from "@chakra-ui/react";
import {
  fontChoiceFamily,
  fontRoleIds,
  fontRoles,
  resolveFontChoice,
  type FontChoiceId,
  type FontRoleId,
} from "@/app/fontChoices";
import { palettes, paletteIds, resolvePaletteId, type PaletteId } from "@/app/palettes";
import { toaster } from "@/components/ui/toaster";
import { useColorMode, type ThemeSetting } from "@/components/ui/color-mode";
import {
  useAppearanceSettingsQuery,
  useUpdateAppearanceSettings,
  type AppearancePatch,
} from "@/hooks/useAppearanceSettings";

const MODES: { value: ThemeSetting; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** The four swatches a card shows, by the variable that holds each. */
const SWATCHES = [
  ["Ground", "--gn-ground"],
  ["Surface", "--gn-surface"],
  ["Ink", "--gn-ink"],
  ["Accent", "--gn-accent-solid"],
] as const;

/** A line of the kind of text each role sets, shown in the chosen face. */
const PREVIEW = "Water No Get Enemy · 104 BPM · A minor (8A)";

const paletteName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** The shared palette and this device's light/dark choice. */
export default function AppearanceSettingsSection(): React.JSX.Element {
  const settings = useAppearanceSettingsQuery();
  const update = useUpdateAppearanceSettings();
  const { colorMode, colorModeSetting, setColorModeSetting } = useColorMode();

  // The cached setting already holds a change that is still saving, so the
  // selection follows the click at once.
  const selected: PaletteId = resolvePaletteId(settings.data?.palette);

  const save = (patch: AppearancePatch, what: string) =>
    update.mutate(patch, {
      onError: (err) =>
        toaster.create({
          title: `Failed to save ${what}`,
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        }),
    });

  const choose = (palette: PaletteId) => {
    if (palette !== selected) save({ palette }, "palette");
  };

  const chooseFont = (role: FontRoleId, choice: FontChoiceId) => {
    if (choice !== resolveFontChoice(role, settings.data?.fonts[role])) {
      save({ fonts: { [role]: choice } }, `${fontRoles[role].label.toLowerCase()} font`);
    }
  };

  return (
    <Box>
      <Heading size="lg" mb={2}>
        Appearance
      </Heading>

      <Heading size="md" mb={1}>
        Palette
      </Heading>
      <Text color="fg.muted" mb={3}>
        Colours for the whole app, shared by every device.
      </Text>
      <Flex gap={3} align="stretch" flexWrap="wrap" role="radiogroup" aria-label="Palette" mb={2}>
        {paletteIds.map((id) => {
          const values = palettes[id][colorMode];
          const isSelected = id === selected;
          return (
            <chakra.button
              key={id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => choose(id)}
              textAlign="left"
              p={3}
              minW="180px"
              borderWidth={isSelected ? 2 : 1}
              borderColor={isSelected ? "accent.solid" : "border"}
              borderRadius="md"
              bg="bg.panel"
              cursor="pointer"
              _hover={{ bg: "bg.muted" }}
            >
              <Flex gap={1} mb={2} aria-hidden>
                {SWATCHES.map(([label, variable]) => (
                  <Box
                    key={variable}
                    title={label}
                    w={8}
                    h={8}
                    borderRadius="md"
                    borderWidth={1}
                    borderColor="border"
                    style={{ backgroundColor: values[variable] }}
                  />
                ))}
              </Flex>
              <Text fontWeight="medium">{paletteName(id)}</Text>
            </chakra.button>
          );
        })}
      </Flex>
      <Flex gap={2} align="center" mb={6} minH={5}>
        {update.isPending || settings.isPending ? <Spinner size="sm" /> : null}
        {settings.error ? (
          <Text fontSize="sm" color="fg.error">
            Failed to load the saved appearance.
          </Text>
        ) : null}
      </Flex>

      <Heading size="md" mb={1}>
        Typography
      </Heading>
      <Text color="fg.muted" mb={4}>
        A face for each kind of text, shared by every device. System uses the font your device
        already has.
      </Text>
      {fontRoleIds.map((role) => {
        const { label, description, choices } = fontRoles[role];
        const current = resolveFontChoice(role, settings.data?.fonts[role]);
        return (
          <Box key={role} mb={5}>
            <Heading size="sm" mb={0.5}>
              {label}
            </Heading>
            <Text color="fg.muted" fontSize="sm" mb={2}>
              {description}
            </Text>
            <Flex
              gap={3}
              align="stretch"
              flexWrap="wrap"
              role="radiogroup"
              aria-label={`${label} font`}
              mb={2}
            >
              {choices.map(({ id, label: choiceLabel }) => {
                const isSelected = id === current;
                return (
                  <chakra.button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => chooseFont(role, id)}
                    textAlign="left"
                    px={3}
                    py={2}
                    minW="160px"
                    borderWidth={isSelected ? 2 : 1}
                    borderColor={isSelected ? "accent.solid" : "border"}
                    borderRadius="md"
                    bg="bg.panel"
                    cursor="pointer"
                    _hover={{ bg: "bg.muted" }}
                    style={{ fontFamily: fontChoiceFamily(role, id) }}
                  >
                    <Text as="span" display="block" fontSize="lg" fontWeight="semibold" lineHeight="1.2">
                      {choiceLabel}
                    </Text>
                    <Text as="span" display="block" fontSize="sm" color="fg.muted">
                      Aa 0123 LP-342
                    </Text>
                  </chakra.button>
                );
              })}
            </Flex>
            <Text
              data-preview={role}
              fontSize={role === "display" ? "xl" : "md"}
              fontWeight={role === "display" ? "semibold" : "normal"}
              style={{ fontFamily: fontChoiceFamily(role, current) }}
            >
              {PREVIEW}
            </Text>
          </Box>
        );
      })}
      <Box mb={4} />

      <Heading size="md" mb={1}>
        Mode
      </Heading>
      <Text color="fg.muted" mb={3}>
        Light, dark, or follow the operating system. Remembered on this device only.
      </Text>
      <SegmentGroup.Root
        size="sm"
        value={colorModeSetting}
        aria-label="Colour mode"
        onValueChange={(details) => setColorModeSetting(details.value as ThemeSetting)}
      >
        <SegmentGroup.Indicator />
        <SegmentGroup.Items items={MODES} />
      </SegmentGroup.Root>
    </Box>
  );
}
