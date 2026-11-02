import React from "react";
import { Box, Grid, Text } from "@chakra-ui/react";
import { system } from "@/app/chakraTheme";
import { palettes, type PaletteId } from "@/app/palettes";

// Render a story in one palette and mode, or both modes side by side, scoped
// to a wrapper so the page's own setting is untouched. Shared by the badge
// stories (#957, #963).

export type SchemeMode = "light" | "dark" | "both";
export type SchemeArgs = { palette: PaletteId; mode: SchemeMode };

// Chakra resolves `var(--gn-*)` token values once, on :root, so a scoped
// palette must declare those tokens again on its wrapper (as PalettePreview does).
const tokenVars = Object.fromEntries(
  system.tokens.allTokens
    .filter(
      (token) =>
        ["colors", "shadows"].includes(token.extensions.category) &&
        String(token.value).includes("var(--gn-"),
    )
    .map((token) => [(token.extensions.cssVar as { var: string }).var, String(token.value)]),
);

// A badge with no colorPalette uses the default one, which is also mapped on
// :root. Restate that mapping here so Chakra's stock gray follows the mode.
const defaultPaletteVars = Object.fromEntries(
  ["solid", "contrast", "fg", "muted", "subtle", "emphasized", "focus-ring", "border"].map(
    (part) => [`--chakra-colors-color-palette-${part}`, `var(--chakra-colors-gray-${part})`],
  ),
);

const scopedVars = { ...tokenVars, ...defaultPaletteVars } as React.CSSProperties;

/** One palette in one mode. */
export function Scheme({
  palette,
  dark,
  children,
}: {
  palette: PaletteId;
  dark: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box
      data-palette={palette}
      className={dark ? "dark" : "light"}
      style={scopedVars}
      bg="bg"
      color="fg"
      p={4}
      minW={0}
    >
      <Text fontFamily="mono" fontSize="11px" color="fg.muted" mb={3}>
        {palette.toUpperCase()} · {dark ? "DARK" : "LIGHT"}
      </Text>
      {children}
    </Box>
  );
}

/** The chosen palette in light, dark, or both. */
export function Schemes({ palette, mode, children }: SchemeArgs & { children: React.ReactNode }) {
  const modes = mode === "both" ? [false, true] : [mode === "dark"];
  return (
    <Grid templateColumns={{ base: "1fr", lg: `repeat(${modes.length}, minmax(0, 1fr))` }}>
      {modes.map((dark) => (
        <Scheme key={String(dark)} palette={palette} dark={dark}>
          {children}
        </Scheme>
      ))}
    </Grid>
  );
}

/** The `palette` and `mode` controls, for a story's meta. */
export const schemeControls = {
  args: { palette: "sleeve", mode: "both" } satisfies SchemeArgs,
  argTypes: {
    palette: { control: "select", options: Object.keys(palettes) },
    mode: { control: "inline-radio", options: ["light", "dark", "both"] },
  },
} as const;
