"use client";

import React from "react";
import {
  Badge,
  Box,
  Button,
  chakra,
  Flex,
  Heading,
  Input,
  SegmentGroup,
  Text,
} from "@chakra-ui/react";
import { LuCheck, LuTriangleAlert, LuX } from "react-icons/lu";
import { system } from "@/app/chakraTheme";
import {
  paletteIds,
  paletteVariableNames,
  statusNames,
  type PaletteValues,
  type PaletteVariable,
} from "@/app/palettes";
import {
  checkContrast,
  customColourKeys,
  customFromPreset,
  customModes,
  derivePalette,
  isHexColour,
  type ContrastCheck,
  type CustomColourKey,
  type CustomMode,
  type CustomPalette,
} from "@/app/palettes/custom";

const KEY_LABELS: Record<CustomColourKey, string> = {
  ground: "Ground",
  surface: "Surface",
  ink: "Ink",
  accent: "Accent",
  shadow: "Shadow",
};

const KEY_HELP: Record<CustomColourKey, string> = {
  ground: "The page background",
  surface: "Panels, inputs and menus",
  ink: "Text and outlines",
  accent: "Primary actions and selection",
  shadow: "The hard offset shadow",
};

/** The pairs each input is read against, shown beside it. */
const READOUTS: Record<CustomColourKey, [PaletteVariable, PaletteVariable][]> = {
  ground: [["--gn-ink", "--gn-ground"]],
  surface: [["--gn-ink", "--gn-surface"]],
  ink: [
    ["--gn-ink", "--gn-ground"],
    ["--gn-ink", "--gn-surface"],
  ],
  accent: [
    ["--gn-accent-solid", "--gn-ground"],
    ["--gn-accent-contrast", "--gn-accent-solid"],
  ],
  shadow: [],
};

const PAIR_NAMES: Record<string, string> = {
  "--gn-ink": "Ink",
  "--gn-ink-muted": "Muted ink",
  "--gn-ground": "ground",
  "--gn-surface": "surface",
  "--gn-border": "Border",
  "--gn-accent-contrast": "Text on accent",
  "--gn-accent-solid": "accent",
  "--gn-accent-fg": "Accent text",
  "--gn-accent-subtle": "accent tint",
  "--gn-accent-focus-ring": "Focus ring",
  "--gn-accent-border": "Accent border",
};

const STATUS_PARTS: Record<string, string> = { fg: "text", subtle: "tint", border: "border" };

const pairName = (variable: string) => {
  const status = /^--gn-status-(\w+)-(fg|subtle|border)$/.exec(variable);
  if (status) return `Status ${status[1]} ${STATUS_PARTS[status[2]]}`;
  return PAIR_NAMES[variable];
};

const pairLabel = (check: ContrastCheck) =>
  `${pairName(check.fg)} on ${pairName(check.bg).toLowerCase()}`;

const ratioText = (ratio: number) => `${ratio.toFixed(2)}:1`;

// Chakra turns `var(--gn-x)` token values into --chakra-* variables declared
// on :root, where the reference is resolved once and descendants inherit the
// result. The preview therefore declares them again on its own wrapper, so
// every colour and shadow follows the draft, not the page's palette.
const tokenVars: Record<string, string> = Object.fromEntries(
  system.tokens.allTokens
    .filter(
      (token) =>
        ["colors", "shadows"].includes(token.extensions.category) &&
        String(token.value).includes("var(--gn-"),
    )
    .map((token) => [(token.extensions.cssVar as { var: string }).var, String(token.value)]),
);

const cssVars = (values: PaletteValues) =>
  ({
    ...Object.fromEntries(paletteVariableNames.map((name) => [name, values[name]])),
    ...tokenVars,
  }) as React.CSSProperties;

function ColourField({
  mode,
  colourKey,
  value,
  checks,
  onChange,
}: {
  mode: CustomMode;
  colourKey: CustomColourKey;
  value: string;
  checks: ContrastCheck[];
  onChange: (value: string) => void;
}) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  const label = `${KEY_LABELS[colourKey]} (${mode})`;
  const valid = isHexColour(text);
  return (
    <Box py={2} borderTopWidth="rule" borderColor="border" data-colour={`${mode}-${colourKey}`}>
      <Flex gap={3} align="center" flexWrap="wrap">
        <chakra.input
          type="color"
          aria-label={`${label} colour picker`}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          w={10}
          h={10}
          p={0}
          cursor="pointer"
        />
        <Box flex="1" minW="140px">
          <chakra.label htmlFor={`custom-${mode}-${colourKey}`} fontWeight="medium" display="block">
            {KEY_LABELS[colourKey]}
          </chakra.label>
          <Text fontSize="xs" color="fg.muted">
            {KEY_HELP[colourKey]}
          </Text>
        </Box>
        <Input
          id={`custom-${mode}-${colourKey}`}
          aria-label={`${label} hex`}
          aria-invalid={!valid}
          value={text}
          maxLength={7}
          spellCheck={false}
          fontFamily="mono"
          size="sm"
          w="110px"
          onChange={(e) => {
            setText(e.target.value);
            if (isHexColour(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
        />
      </Flex>
      {!valid ? (
        <Text role="alert" fontSize="sm" color="fg.error" mt={1}>
          Use a six-digit hex colour such as #c8321a.
        </Text>
      ) : null}
      {checks.map((check) => (
        <Flex
          key={`${check.fg}-${check.bg}`}
          gap={1}
          align="center"
          fontSize="sm"
          mt={1}
          color={check.pass ? "fg.muted" : "fg.error"}
        >
          {check.pass ? <LuCheck aria-hidden /> : <LuX aria-hidden />}
          <span>
            {pairLabel(check)}: {ratioText(check.ratio)} · {check.pass ? "Pass" : "Fail"} (needs{" "}
            {check.min}:1)
          </span>
        </Flex>
      ))}
    </Box>
  );
}

/** A card, buttons, a track row and the four status tags, drawn with the draft's variables. */
export function PalettePreview({ values, mode }: { values: PaletteValues; mode: CustomMode }) {
  return (
    <Box
      data-testid="palette-preview"
      data-preview-mode={mode}
      style={{
        ...cssVars(values),
        backgroundColor: values["--gn-ground"],
        color: values["--gn-ink"],
      }}
      p={4}
      borderWidth="outline"
      borderColor="border.ink"
    >
      <Box bg="bg.panel" borderWidth="outline" borderColor="border.ink" boxShadow="md" p={3} mb={3}>
        <Heading size="sm" mb={1}>
          Preview · {mode}
        </Heading>
        <Text fontSize="sm" color="fg.muted" mb={3}>
          Secondary text sits here.
        </Text>
        <Flex gap={2} flexWrap="wrap">
          <Button size="sm" colorPalette="accent" variant="solid">
            Solid
          </Button>
          <Button size="sm" variant="outline">
            Outline
          </Button>
        </Flex>
      </Box>
      <Flex
        bg="bg.panel"
        borderWidth="outline"
        borderColor="border.ink"
        p={2}
        mb={3}
        justify="space-between"
        gap={2}
      >
        <Box minW={0}>
          <Text fontWeight="medium" truncate>
            Water No Get Enemy
          </Text>
          <Text fontSize="sm" color="fg.muted" truncate>
            Fela Kuti · 104 BPM · 8A
          </Text>
        </Box>
        <Text color="accent.fg" fontWeight="medium" flexShrink={0}>
          LP-342
        </Text>
      </Flex>
      <Flex gap={2} flexWrap="wrap">
        {statusNames.map((status) => (
          <Badge key={status} size="sm" variant="subtle" colorPalette={`status.${status}`}>
            {status}
          </Badge>
        ))}
      </Flex>
    </Box>
  );
}

export interface CustomPaletteEditorProps {
  /** The saved palette, or null when starting a new one. */
  saved: CustomPalette | null;
  /** The preset a new palette starts from. */
  initialBase: (typeof paletteIds)[number];
  saving: boolean;
  onSave: (palette: CustomPalette) => void;
  onDelete: () => void;
  onClose: () => void;
}

const sameColours = (a: CustomPalette, b: CustomPalette) => JSON.stringify(a) === JSON.stringify(b);

export default function CustomPaletteEditor({
  saved,
  initialBase,
  saving,
  onSave,
  onDelete,
  onClose,
}: CustomPaletteEditorProps): React.JSX.Element {
  const [draft, setDraft] = React.useState<CustomPalette>(
    () => saved ?? customFromPreset(initialBase),
  );
  const [mode, setMode] = React.useState<CustomMode>("light");
  const [pendingBase, setPendingBase] = React.useState<(typeof paletteIds)[number] | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const derived = React.useMemo(() => derivePalette(draft), [draft]);
  const checks = React.useMemo(
    () => ({ light: checkContrast(derived.light), dark: checkContrast(derived.dark) }),
    [derived],
  );
  const failures = {
    light: checks.light.filter((c) => !c.pass),
    dark: checks.dark.filter((c) => !c.pass),
  };
  const failureCount = failures.light.length + failures.dark.length;

  const edited = !sameColours(draft, saved ?? customFromPreset(draft.base));

  const edit = (key: CustomColourKey, value: string) => {
    setConfirming(false);
    setDraft((d) => ({ ...d, [mode]: { ...d[mode], [key]: value } }));
  };

  const chooseBase = (base: (typeof paletteIds)[number]) => {
    if (edited) setPendingBase(base);
    else setDraft(customFromPreset(base));
  };

  const reset = () => {
    setConfirming(false);
    setPendingBase(null);
    setDraft(saved ?? customFromPreset(draft.base));
  };

  const save = () => {
    if (failureCount > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onSave(draft);
  };

  return (
    <Box
      borderWidth="outline"
      borderColor="border.ink"
      bg="bg.panel"
      p={4}
      mb={6}
      data-testid="custom-palette-editor"
    >
      <Heading size="md" mb={1}>
        Custom palette
      </Heading>
      <Text color="fg.muted" fontSize="sm" mb={3}>
        Five colours per mode. The rest, and the status colours, come from the preset it starts
        from.
      </Text>

      <Flex gap={3} align="center" flexWrap="wrap" mb={3}>
        <chakra.label htmlFor="custom-base" fontWeight="medium">
          Start from
        </chakra.label>
        <chakra.select
          id="custom-base"
          value={draft.base}
          onChange={(e) => chooseBase(e.target.value as (typeof paletteIds)[number])}
          borderWidth="outline"
          borderColor="border.ink"
          bg="bg.panel"
          px={2}
          py={1}
          fontSize="16px"
        >
          {paletteIds.map((id) => (
            <option key={id} value={id}>
              {id.charAt(0).toUpperCase() + id.slice(1)}
            </option>
          ))}
        </chakra.select>
      </Flex>

      {pendingBase ? (
        <Box
          role="alertdialog"
          aria-label="Replace edits"
          borderWidth="outline"
          borderColor="status.analysis.border"
          bg="status.analysis.subtle"
          color="status.analysis.fg"
          p={3}
          mb={3}
        >
          <Text mb={2}>Start from {pendingBase} instead? Your edits will be replaced.</Text>
          <Flex gap={2}>
            <Button
              size="xs"
              onClick={() => {
                setDraft(customFromPreset(pendingBase));
                setPendingBase(null);
                setConfirming(false);
              }}
            >
              Replace my edits
            </Button>
            <Button size="xs" variant="outline" onClick={() => setPendingBase(null)}>
              Keep editing
            </Button>
          </Flex>
        </Box>
      ) : null}

      <SegmentGroup.Root
        size="sm"
        value={mode}
        aria-label="Mode being edited"
        onValueChange={(d) => setMode(d.value as CustomMode)}
        mb={3}
      >
        <SegmentGroup.Indicator />
        <SegmentGroup.Items
          items={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </SegmentGroup.Root>

      <Flex gap={5} align="flex-start" flexWrap="wrap">
        <Box flex="1 1 320px" minW={0}>
          {customColourKeys.map((key) => (
            <ColourField
              key={`${mode}-${key}`}
              mode={mode}
              colourKey={key}
              value={draft[mode][key]}
              checks={READOUTS[key].map(
                ([fg, bg]) => checks[mode].find((c) => c.fg === fg && c.bg === bg) as ContrastCheck,
              )}
              onChange={(value) => edit(key, value)}
            />
          ))}
        </Box>
        <Box flex="1 1 280px" minW={0}>
          <PalettePreview values={derived[mode]} mode={mode} />
        </Box>
      </Flex>

      <Box mt={4} aria-live="polite" data-testid="contrast-summary">
        {failureCount === 0 ? (
          <Flex gap={2} align="center" color="status.success.fg">
            <LuCheck aria-hidden />
            <Text fontWeight="medium">Every checked pair passes AA in light and dark.</Text>
          </Flex>
        ) : (
          <>
            <Flex gap={2} align="center" color="fg.error" mb={1}>
              <LuTriangleAlert aria-hidden />
              <Text fontWeight="medium">
                {customModes
                  .filter((m) => failures[m].length > 0)
                  .map(
                    (m) =>
                      `${failures[m].length} ${failures[m].length === 1 ? "pair" : "pairs"} below AA in ${m}`,
                  )
                  .join(" · ")}
              </Text>
            </Flex>
            {customModes.map((m) =>
              failures[m].length ? (
                <Box key={m} mb={2}>
                  <Text fontWeight="medium" fontSize="sm">
                    {m === "light" ? "Light" : "Dark"}
                  </Text>
                  <chakra.ul listStyleType="none" fontSize="sm">
                    {failures[m].map((c) => (
                      <li key={`${c.fg}-${c.bg}`}>
                        <LuX aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                        {pairLabel(c)}: {ratioText(c.ratio)}, needs {c.min}:1
                      </li>
                    ))}
                  </chakra.ul>
                </Box>
              ) : null,
            )}
          </>
        )}
      </Box>

      {confirming ? (
        <Box
          role="alert"
          borderWidth="outline"
          borderColor="status.analysis.border"
          bg="status.analysis.subtle"
          color="status.analysis.fg"
          p={3}
          mt={3}
        >
          <Text mb={2}>
            Some text in this palette may be hard to read. You can still save it; the contrast is
            your call.
          </Text>
          <Button size="xs" onClick={save} loading={saving}>
            Save anyway
          </Button>
        </Box>
      ) : null}

      <Flex gap={2} mt={4} flexWrap="wrap">
        {!confirming ? (
          <Button size="sm" colorPalette="accent" onClick={save} loading={saving}>
            Save custom palette
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={reset} disabled={!edited && !pendingBase}>
          Reset
        </Button>
        {saved ? (
          <Button
            size="sm"
            variant="outline"
            colorPalette="danger"
            onClick={onDelete}
            disabled={saving}
          >
            Delete custom palette
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </Flex>
    </Box>
  );
}
