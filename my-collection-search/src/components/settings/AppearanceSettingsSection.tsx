"use client";

import { SectionHeading } from "@/components/ui/SectionHeading";
import React from "react";
import { Box, Button, chakra, Flex, Input, SegmentGroup, Spinner, Text } from "@chakra-ui/react";
import { type CornerId } from "@/app/corners";
import {
  fontChoiceFamily,
  fontRoleIds,
  fontRoles,
  type FontChoiceId,
  type FontRoleId,
} from "@/app/fontChoices";
import { palettes, paletteIds, defaultPaletteId } from "@/app/palettes";
import {
  customPaletteId,
  derivePalette,
  type AppearancePaletteId,
  type CustomPalette,
} from "@/app/palettes/custom";
import CustomPaletteEditor from "./CustomPaletteEditor";
import { CategoryTag, StatusTag } from "@/components/ui/RoleTags";
import type { OverriddenField } from "@/app/appearanceOverride";
import { toaster } from "@/components/ui/toaster";
import { useColorMode, type ThemeSetting } from "@/components/ui/color-mode";
import { TAB_BAR_LABELS, isTabBarLabels, useTabBarLabels } from "@/lib/tabBarLabels";
import { useDeviceAppearance } from "@/hooks/useAppearanceSettings";

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

/** Phones need a 44px target; desktop keeps the compact button. */
const touchTarget = { base: "44px", md: "auto" } as const;

/** Whether this device sets its own value, or follows the saved default. */
function Scope({ overridden }: { overridden?: boolean }) {
  return overridden === undefined ? (
    <Text
      as="span"
      fontFamily="label"
      fontSize="xs"
      letterSpacing="0.05em"
      textTransform="uppercase"
      color="fg.muted"
      data-scope="device-only"
    >
      This device
    </Text>
  ) : overridden ? (
    <StatusTag tone="neutral" size="sm" data-scope="device">
      Overridden on this device
    </StatusTag>
  ) : (
    <Text
      as="span"
      fontFamily="label"
      fontSize="xs"
      letterSpacing="0.05em"
      textTransform="uppercase"
      color="fg.muted"
      data-scope="default"
    >
      Default
    </Text>
  );
}

/** A titled part of the page: its name, whether this device overrides it, then what it holds. */
function Part({
  title,
  overridden,
  onReset,
  help,
  children,
}: {
  title: string;
  /** Absent for a setting that is always this device's own. */
  overridden?: boolean;
  onReset?: () => void;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <Box as="section" aria-label={title} mb={6}>
      <Flex align="center" gap={3} mb={1} flexWrap="wrap">
        <SectionHeading level={3}>{title}</SectionHeading>
        <Scope overridden={overridden} />
        {overridden && onReset ? (
          <Button
            size="xs"
            variant="ghost"
            color="fg.muted"
            minH={touchTarget}
            onClick={onReset}
            aria-label={`Reset ${title.toLowerCase()} to the default`}
          >
            Reset
          </Button>
        ) : null}
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

/** This device's appearance over the saved default, and its light/dark choice. */
export default function AppearanceSettingsSection(): React.JSX.Element {
  const device = useDeviceAppearance();
  const { saved: settings, override, resolved, overridden } = device;
  const { colorMode, colorModeSetting, setColorModeSetting } = useColorMode();
  const [tabBarLabels, setTabBarLabels] = useTabBarLabels();

  const customPalette = resolved.customPalette;
  const selected: AppearancePaletteId = resolved.palette;
  const [editing, setEditing] = React.useState(false);
  const isOverridden = (field: OverriddenField) => overridden.includes(field);

  const fail = (title: string) => (err: unknown) =>
    toaster.create({
      title,
      description: err instanceof Error ? err.message : String(err),
      type: "error",
    });

  const choose = (palette: AppearancePaletteId) => {
    if (palette !== selected) device.set({ palette });
  };

  const saveCustom = (palette: CustomPalette) => {
    device.set({ customPalette: palette, palette: customPaletteId });
    toaster.create({ title: "Custom palette saved on this device", type: "success" });
  };

  // The device's own palette is removed here; the shared one is only ever
  // deleted from the editor when this device has none of its own.
  const ownCustom = override.customPalette !== undefined;
  const deleteCustom = () => {
    if (ownCustom) {
      device.set({ customPalette: null });
      setEditing(false);
      toaster.create({ title: "Custom palette removed from this device", type: "success" });
      return;
    }
    device.updateShared.mutate(
      { customPalette: null },
      {
        onSuccess: () => {
          setEditing(false);
          toaster.create({ title: "Custom palette deleted for everyone", type: "success" });
        },
        onError: fail("Failed to delete the custom palette"),
      },
    );
  };

  const chooseFont = (role: FontRoleId, choice: FontChoiceId) => {
    if (choice !== resolved.fonts[role]) device.set({ fonts: { [role]: choice } });
  };

  const corners = resolved.corners;
  const chooseCorners = (value: CornerId) => {
    if (value !== corners) device.set({ corners: value });
  };

  const setAsDefault = () =>
    device.setAsDefault({
      onSuccess: () =>
        toaster.create({ title: "Saved as the default for everyone", type: "success" }),
      onError: fail("Failed to save the default"),
    });

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
      <Flex
        gap={2}
        align={{ base: "stretch", md: "center" }}
        direction={{ base: "column", md: "row" }}
        flexWrap="wrap"
        mb={6}
      >
        <Text color="fg.muted" fontSize="sm" flex="1" minW="240px">
          {overridden.length > 0
            ? "Changes here apply to this device only. The default is what new devices see."
            : "Changes here apply to this device only. This device follows the default."}
        </Text>
        <Button
          size="sm"
          variant="outline"
          minH={touchTarget}
          onClick={setAsDefault}
          disabled={overridden.length === 0}
          loading={device.savingDefault}
        >
          Use as the default for everyone
        </Button>
        <Button
          size="sm"
          variant="outline"
          minH={touchTarget}
          onClick={device.resetAll}
          disabled={overridden.length === 0}
        >
          Reset this device
        </Button>
      </Flex>

      <Part
        title="Palette"
        overridden={isOverridden("palette")}
        onReset={() => device.reset({ palette: null, customPalette: null })}
        help="Colours for the whole app."
      >
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
          {device.savingDefault || settings.isPending ? <Spinner size="sm" /> : null}
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
            saving={device.updateShared.isPending}
            deleteLabel={ownCustom ? "Remove from this device" : "Delete for everyone"}
            onSave={saveCustom}
            onDelete={deleteCustom}
            onClose={() => setEditing(false)}
          />
        ) : null}
      </Part>

      <Part
        title="Corners"
        overridden={isOverridden("corners")}
        onReset={() => device.reset({ corners: null })}
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

      <Part
        title="Type"
        overridden={fontRoleIds.some((role) => isOverridden(`font:${role}`))}
        onReset={() => device.reset({ fonts: { display: null, body: null, label: null } })}
        help="System uses the font your device already has."
      >
        {fontRoleIds.map((role) => {
          const { label, description, choices } = fontRoles[role];
          const current = resolved.fonts[role];
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
                {isOverridden(`font:${role}`) ? (
                  <Flex align="center" gap={2} flexWrap="wrap">
                    <StatusTag tone="neutral" size="xs" data-scope="device">
                      Overridden
                    </StatusTag>
                    <Button
                      size="xs"
                      variant="ghost"
                      color="fg.muted"
                      minH={touchTarget}
                      onClick={() => device.reset({ fonts: { [role]: null } })}
                      aria-label={`Reset ${label.toLowerCase()} font to the default`}
                    >
                      Reset
                    </Button>
                  </Flex>
                ) : null}
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

      <Part title="Light or dark" help="System follows this device's setting.">
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

      <Part title="Tab bar labels" help="On phones. Hide the labels to give the bar less height.">
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
