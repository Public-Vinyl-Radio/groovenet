"use client";

import { SectionHeading } from "@/components/ui/SectionHeading";
import React from "react";
import { Box, Button, chakra, Flex, Input, SegmentGroup, Spinner, Text } from "@chakra-ui/react";
import { resolveCorners, type CornerId } from "@/app/corners";
import {
  fontChoiceFamily,
  fontRoleIds,
  fontRoles,
  resolveFontChoice,
  type FontChoiceId,
  type FontRoleId,
} from "@/app/fontChoices";
import { palettes, paletteIds, defaultPaletteId } from "@/app/palettes";
import {
  customPaletteId,
  derivePalette,
  resolveAppearancePalette,
  type AppearancePaletteId,
  type CustomPalette,
} from "@/app/palettes/custom";
import CustomPaletteEditor from "./CustomPaletteEditor";
import { CategoryTag } from "@/components/ui/RoleTags";
import { toaster } from "@/components/ui/toaster";
import { useColorMode, type ThemeSetting } from "@/components/ui/color-mode";
import { TAB_BAR_LABELS, isTabBarLabels, useTabBarLabels } from "@/lib/tabBarLabels";
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

const CORNERS: { value: CornerId; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
];

/** The preset a new custom palette starts from: the one in use, else the default. */
const resolveBase = (selected: AppearancePaletteId) =>
  selected === customPaletteId ? defaultPaletteId : selected;

const paletteName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** Where a setting applies: every device that uses the server, or only this one. */
function Scope({ device }: { device: "every" | "this" }) {
  return (
    <Text
      as="span"
      fontFamily="label"
      fontSize="xs"
      letterSpacing="0.05em"
      textTransform="uppercase"
      color="fg.muted"
      data-scope={device}
    >
      {device === "every" ? "Every device" : "This device"}
    </Text>
  );
}

/** A titled part of the page: its name, where it applies, then what it holds. */
function Part({
  title,
  device,
  help,
  children,
}: {
  title: string;
  device: "every" | "this";
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <Box as="section" aria-label={title} mb={6}>
      <Flex align="baseline" gap={3} mb={1} flexWrap="wrap">
        <SectionHeading level={3}>{title}</SectionHeading>
        <Scope device={device} />
      </Flex>
      {help ? (
        <Text color="fg.muted" fontSize="sm" mb={3}>
          {help}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}

/** A track row, a tag, a search field and a solid button: what the corner style changes. */
function CornersPreview(): React.JSX.Element {
  return (
    <Flex
      direction="column"
      gap={2}
      p={3}
      flex="1"
      minW="240px"
      borderWidth="outline"
      borderColor="border.ink"
      borderRadius="md"
      bg="bg.panel"
      data-testid="corners-preview"
      aria-hidden
    >
      <Flex
        align="center"
        justify="space-between"
        gap={2}
        px={3}
        py={2}
        borderWidth="rule"
        borderColor="border"
        borderRadius="md"
      >
        <Box minW={0}>
          <Text fontWeight="medium" truncate>
            Water No Get Enemy
          </Text>
          <Text fontSize="xs" color="fg.muted">
            Fela Kuti · 104 BPM · 8A
          </Text>
        </Box>
        <CategoryTag>Afrobeat</CategoryTag>
      </Flex>
      <Flex gap={2}>
        <Input size="sm" placeholder="Search tracks" tabIndex={-1} readOnly />
        <Button size="sm" colorPalette="accent" tabIndex={-1}>
          Play
        </Button>
      </Flex>
    </Flex>
  );
}

/** The shared palette and this device's light/dark choice. */
export default function AppearanceSettingsSection(): React.JSX.Element {
  const settings = useAppearanceSettingsQuery();
  const update = useUpdateAppearanceSettings();
  const { colorMode, colorModeSetting, setColorModeSetting } = useColorMode();
  const [tabBarLabels, setTabBarLabels] = useTabBarLabels();

  // The cached setting already holds a change that is still saving, so the
  // selection follows the click at once.
  const customPalette = settings.data?.customPalette ?? null;
  const selected: AppearancePaletteId = resolveAppearancePalette(
    settings.data?.palette,
    customPalette,
  );
  const [editing, setEditing] = React.useState(false);

  const save = (patch: AppearancePatch, what: string) =>
    update.mutate(patch, {
      onError: (err) =>
        toaster.create({
          title: `Failed to save ${what}`,
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        }),
    });

  const choose = (palette: AppearancePaletteId) => {
    if (palette !== selected) save({ palette }, "palette");
  };

  const saveCustom = (palette: CustomPalette) =>
    update.mutate(
      { customPalette: palette, palette: customPaletteId },
      {
        onSuccess: () => toaster.create({ title: "Custom palette saved", type: "success" }),
        onError: (err) =>
          toaster.create({
            title: "Failed to save the custom palette",
            description: err instanceof Error ? err.message : String(err),
            type: "error",
          }),
      },
    );

  const deleteCustom = () =>
    update.mutate(
      { customPalette: null },
      {
        onSuccess: () => {
          setEditing(false);
          toaster.create({ title: "Custom palette deleted", type: "success" });
        },
        onError: (err) =>
          toaster.create({
            title: "Failed to delete the custom palette",
            description: err instanceof Error ? err.message : String(err),
            type: "error",
          }),
      },
    );

  const chooseFont = (role: FontRoleId, choice: FontChoiceId) => {
    if (choice !== resolveFontChoice(role, settings.data?.fonts[role])) {
      save({ fonts: { [role]: choice } }, `${fontRoles[role].label.toLowerCase()} font`);
    }
  };

  const corners = resolveCorners(settings.data?.corners);
  const chooseCorners = (value: CornerId) => {
    if (value !== corners) save({ corners: value }, "corners");
  };

  const swatchCard = (
    key: string,
    name: string,
    isSelected: boolean,
    onSelect: () => void,
    values: Record<string, string>,
  ) => (
    <chakra.button
      key={key}
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      textAlign="left"
      p={3}
      minW="160px"
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
      <Text fontWeight="medium">{name}</Text>
    </chakra.button>
  );

  return (
    <Box>
      <Part title="Palette" device="every" help="Colours for the whole app.">
        <Flex gap={3} align="stretch" flexWrap="wrap" role="radiogroup" aria-label="Palette" mb={2}>
          {paletteIds.map((id) =>
            swatchCard(
              id,
              paletteName(id),
              id === selected,
              () => choose(id),
              palettes[id][colorMode],
            ),
          )}
          {customPalette
            ? swatchCard(
                customPaletteId,
                "Custom",
                selected === customPaletteId,
                () => choose(customPaletteId),
                derivePalette(customPalette)[colorMode],
              )
            : null}
        </Flex>
        <Flex gap={2} align="center" minH={8}>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {customPalette ? "Edit custom palette" : "Create custom palette"}
            </Button>
          ) : null}
          {update.isPending || settings.isPending ? <Spinner size="sm" /> : null}
          {settings.error ? (
            <Text fontSize="sm" color="fg.error">
              Failed to load the saved appearance.
            </Text>
          ) : null}
        </Flex>
        {editing ? (
          <CustomPaletteEditor
            saved={customPalette}
            initialBase={resolveBase(selected)}
            saving={update.isPending}
            onSave={saveCustom}
            onDelete={deleteCustom}
            onClose={() => setEditing(false)}
          />
        ) : null}
      </Part>

      <Part
        title="Corners"
        device="every"
        help="Square is sharp; rounded softens controls and cards."
      >
        <Flex gap={4} align="flex-start" flexWrap="wrap">
          <SegmentGroup.Root
            size="sm"
            value={corners}
            aria-label="Corners"
            onValueChange={(details) => chooseCorners(details.value as CornerId)}
          >
            <SegmentGroup.Indicator />
            <SegmentGroup.Items items={CORNERS} />
          </SegmentGroup.Root>
          <CornersPreview />
        </Flex>
      </Part>

      <Part title="Type" device="every" help="System uses the font your device already has.">
        {fontRoleIds.map((role) => {
          const { label, description, choices } = fontRoles[role];
          const current = resolveFontChoice(role, settings.data?.fonts[role]);
          return (
            <Flex
              key={role}
              gap={{ base: 1, md: 4 }}
              align={{ base: "stretch", md: "center" }}
              direction={{ base: "column", md: "row" }}
              py={2}
              borderTopWidth="rule"
              borderColor="border"
            >
              <Box w={{ md: "200px" }} flexShrink={0}>
                <SectionHeading level={3}>{label}</SectionHeading>
                <Text color="fg.muted" fontSize="xs">
                  {description}
                </Text>
              </Box>
              <Flex gap={2} flexWrap="wrap" role="radiogroup" aria-label={`${label} font`}>
                {choices.map(({ id, label: choiceLabel }) => {
                  const isSelected = id === current;
                  return (
                    <chakra.button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => chooseFont(role, id)}
                      px={3}
                      py={1}
                      borderWidth={isSelected ? 2 : 1}
                      borderColor={isSelected ? "accent.solid" : "border"}
                      borderRadius="md"
                      bg="bg.panel"
                      cursor="pointer"
                      _hover={{ bg: "bg.muted" }}
                      style={{ fontFamily: fontChoiceFamily(role, id) }}
                    >
                      {choiceLabel}
                    </chakra.button>
                  );
                })}
              </Flex>
            </Flex>
          );
        })}
      </Part>

      <Part title="Light or dark" device="this" help="System follows this device's setting.">
        <SegmentGroup.Root
          size="sm"
          value={colorModeSetting}
          aria-label="Colour mode"
          onValueChange={(details) => setColorModeSetting(details.value as ThemeSetting)}
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={MODES} />
        </SegmentGroup.Root>
      </Part>

      <Part
        title="Tab bar labels"
        device="this"
        help="On phones. Hide the labels to give the bar less height."
      >
        <SegmentGroup.Root
          size="sm"
          value={tabBarLabels}
          aria-label="Tab bar labels"
          onValueChange={(details) => {
            if (isTabBarLabels(details.value)) setTabBarLabels(details.value);
          }}
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={TAB_BAR_LABELS} />
        </SegmentGroup.Root>
      </Part>
    </Box>
  );
}
