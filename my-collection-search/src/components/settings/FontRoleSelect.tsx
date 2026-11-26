"use client";

import React from "react";
import {
  Box,
  Button,
  Flex,
  Input,
  Portal,
  Select,
  Text,
  createListCollection,
} from "@chakra-ui/react";
import {
  fontChoiceFamily,
  fontKindLabels,
  fontKinds,
  fontRoles,
  type FontChoice,
  type FontKind,
  type FontRoleId,
} from "@/app/fontChoices";
import {
  isLocalFontInstalled,
  localFontAccess,
  localFontFamilies,
  localFontMaxLength,
  localFontStack,
  parseLocalFontFamily,
} from "@/app/localFont";

/** The select's value for "Font on this device…"; no choice id can be this. */
export const LOCAL_FONT_VALUE = "__local__";

/** What each role's live preview line says. */
const previews: Record<FontRoleId, { text: string; css: React.CSSProperties }> = {
  display: { text: "Page titles and section headings", css: { fontSize: "18px", fontWeight: 600 } },
  body: { text: "Interface text, track titles and notes", css: { fontSize: "14px" } },
  label: {
    text: "LP-342 · BUTTON",
    css: { fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" },
  },
};

interface Item {
  value: string;
  label: string;
  kind: FontKind | "local";
}

/** A role's choices, grouped by kind in picker order, then the device's own font. */
function groupItems(role: FontRoleId): { kind: FontKind | "local"; items: Item[] }[] {
  const choices = fontRoles[role].choices as readonly FontChoice[];
  const groups: { kind: FontKind | "local"; items: Item[] }[] = fontKinds.map((kind) => ({
    kind,
    items: choices
      .filter((choice) => choice.kind === kind)
      .map((choice) => ({ value: choice.id, label: choice.label, kind })),
  }));
  groups.push({
    kind: "local",
    items: [{ value: LOCAL_FONT_VALUE, label: "Font on this device…", kind: "local" }],
  });
  return groups.filter((group) => group.items.length > 0);
}

/** The `font-family` an item renders in. */
const itemFamily = (role: FontRoleId, item: Item, localFamily?: string) =>
  item.value === LOCAL_FONT_VALUE
    ? localFamily
      ? localFontStack(role, localFamily)
      : undefined
    : fontChoiceFamily(role, item.value);

interface Props {
  role: FontRoleId;
  /** The choice in force: the override, else the saved one, else the default. */
  choice: string;
  /** This device's installed font for the role, when it has one. */
  localFamily?: string;
  onChoose: (choice: string) => void;
  onChooseLocal: (family: string) => void;
}

/**
 * One role's font as a select: every option in its own face, grouped by kind,
 * the closed trigger in the current face, a live preview under it, and "Font on
 * this device…" at the bottom (#1294).
 */
export default function FontRoleSelect({
  role,
  choice,
  localFamily,
  onChoose,
  onChooseLocal,
}: Props): React.JSX.Element {
  const { label } = fontRoles[role];
  const groups = React.useMemo(() => groupItems(role), [role]);
  const collection = React.useMemo(
    () =>
      createListCollection<Item>({
        items: groups.flatMap((group) => group.items),
        itemToString: (item) => item.label,
        itemToValue: (item) => item.value,
      }),
    [groups],
  );
  // The panel is open while this device already has a font here, or after choosing the option.
  const [choosing, setChoosing] = React.useState(false);
  const panelOpen = choosing || localFamily !== undefined;
  const value = localFamily ? LOCAL_FONT_VALUE : choice;
  const stack = localFamily ? localFontStack(role, localFamily) : fontChoiceFamily(role, choice);
  const preview = previews[role];

  return (
    <Box flex="1" minW={0}>
      <Select.Root
        collection={collection}
        size="sm"
        value={[value]}
        maxW={{ md: "360px" }}
        positioning={{ sameWidth: true }}
        lazyMount
        unmountOnExit
        onValueChange={({ value: next }) => {
          const picked = next[0] as string;
          if (picked === LOCAL_FONT_VALUE) {
            setChoosing(true);
            return;
          }
          setChoosing(false);
          onChoose(picked);
        }}
      >
        <Select.HiddenSelect />
        <Select.Label srOnly>{`${label} font`}</Select.Label>
        <Select.Control>
          <Select.Trigger minH={{ base: "44px", md: "36px" }} data-testid={`font-trigger-${role}`}>
            <Select.ValueText style={{ fontFamily: stack }}>
              {localFamily ?? undefined}
            </Select.ValueText>
          </Select.Trigger>
          <Select.IndicatorGroup>
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Portal>
          <Select.Positioner>
            <Select.Content maxH="60vh">
              {groups.map((group) => (
                <Select.ItemGroup key={group.kind}>
                  <Select.ItemGroupLabel>
                    {group.kind === "local" ? "This device" : fontKindLabels[group.kind]}
                  </Select.ItemGroupLabel>
                  {group.items.map((item) => (
                    <Select.Item item={item} key={item.value} minH={{ base: "44px", md: "auto" }}>
                      <Select.ItemText style={{ fontFamily: itemFamily(role, item, localFamily) }}>
                        {item.label}
                      </Select.ItemText>
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.ItemGroup>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>

      <Text
        mt={2}
        color="fg"
        truncate
        data-testid={`font-preview-${role}`}
        style={{ fontFamily: stack, ...preview.css }}
      >
        {preview.text}
      </Text>

      {panelOpen ? (
        <LocalFontPanel
          role={role}
          current={localFamily}
          onUse={(family) => {
            setChoosing(false);
            onChooseLocal(family);
          }}
          onCancel={localFamily ? undefined : () => setChoosing(false)}
        />
      ) : null}
    </Box>
  );
}

/** Most installed families the list shows at once. */
const MAX_LISTED = 8;

/**
 * Choosing a font by its family name. Where the browser has the Local Font
 * Access API a click offers the installed families to search; elsewhere, or if
 * the permission is refused, it is a text field. Either way the name is
 * validated, previewed and checked against what is actually installed.
 */
export function LocalFontPanel({
  role,
  current,
  onUse,
  onCancel,
}: {
  role: FontRoleId;
  current?: string;
  onUse: (family: string) => void;
  onCancel?: () => void;
}): React.JSX.Element {
  const [text, setText] = React.useState(current ?? "");
  const [installed, setInstalled] = React.useState<string[] | null>(null);
  const [denied, setDenied] = React.useState(false);
  const query = React.useMemo(() => localFontAccess(), []);

  const family = parseLocalFontFamily(text);
  const hasText = text.trim() !== "";
  const present = React.useMemo(() => (family ? isLocalFontInstalled(family) : null), [family]);

  const load = async (query: NonNullable<ReturnType<typeof localFontAccess>>) => {
    try {
      setInstalled(localFontFamilies(await query()));
      setDenied(false);
    } catch {
      setDenied(true);
    }
  };

  const matches = React.useMemo(() => {
    if (!installed) return [];
    const needle = text.trim().toLowerCase();
    return installed.filter((name) => name.toLowerCase().includes(needle)).slice(0, MAX_LISTED);
  }, [installed, text]);

  const inputId = `local-font-${role}`;
  return (
    <Box
      mt={3}
      p={3}
      borderWidth="rule"
      borderColor="border"
      borderRadius="md"
      bg="bg.panel"
      data-testid={`local-font-panel-${role}`}
    >
      <Text color="fg.muted" fontSize="xs" mb={2}>
        Only on this device. Other devices keep the default.
      </Text>

      {denied ? (
        <Text color="fg.muted" fontSize="xs" mb={2} role="status">
          Couldn&apos;t read your installed fonts. Type the family name instead.
        </Text>
      ) : null}
      <Text asChild fontSize="xs" color="fg.muted" display="block">
        <label htmlFor={inputId}>Font family</label>
      </Text>
      <Input
        id={inputId}
        size="sm"
        value={text}
        maxLength={localFontMaxLength}
        placeholder="e.g. Berkeley Mono"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        fontSize={{ base: "16px", md: "14px" }}
        minH={{ base: "44px", md: "auto" }}
        onChange={(event) => setText(event.target.value)}
      />
      {query && !installed ? (
        <Button
          size="xs"
          variant="outline"
          mt={2}
          minH={{ base: "44px", md: "auto" }}
          onClick={() => load(query)}
        >
          Choose from installed fonts
        </Button>
      ) : null}
      {installed && matches.length > 0 ? (
        <Flex
          direction="column"
          mt={1}
          role="listbox"
          aria-label="Installed fonts"
          borderWidth="rule"
          borderColor="border"
        >
          {matches.map((name) => (
            <Button
              key={name}
              role="option"
              aria-selected={name === family}
              size="sm"
              variant="ghost"
              justifyContent="flex-start"
              minH={{ base: "44px", md: "auto" }}
              style={{ fontFamily: localFontStack(role, name) }}
              onClick={() => setText(name)}
            >
              {name}
            </Button>
          ))}
        </Flex>
      ) : null}
      {hasText && !family ? (
        <Text color="fg.error" fontSize="xs" mt={1} role="alert">
          Use letters, numbers, spaces, - and _ only, up to {localFontMaxLength} characters.
        </Text>
      ) : null}
      {family ? (
        <>
          <Text
            mt={2}
            truncate
            data-testid={`local-font-sample-${role}`}
            style={{ fontFamily: localFontStack(role, family) }}
          >
            The quick brown fox · LP-342 · 128 BPM
          </Text>
          {present === false ? (
            <Text color="fg.error" fontSize="xs" mt={1} role="alert">
              &ldquo;{family}&rdquo; doesn&apos;t look installed on this device, so text will use
              the default {role === "label" ? "monospace" : "sans-serif"} font.
            </Text>
          ) : null}
        </>
      ) : null}
      <Flex gap={2} mt={3}>
        <Button
          size="sm"
          variant="solid"
          minH={{ base: "44px", md: "auto" }}
          disabled={!family || family === current}
          onClick={() => family && onUse(family)}
        >
          Use this font
        </Button>
        {onCancel ? (
          <Button size="sm" variant="ghost" minH={{ base: "44px", md: "auto" }} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </Flex>
    </Box>
  );
}
