// The retro house style: square corners, 2px outlines, hard offset shadows
// with no blur, mono labels (#667). Everything that gives the app its shape
// lives in this file, so tuning the look is a one-file change.
//
// Provisional until #664 is signed off.
import { monoFallback, sansFallback } from "./fontChoices";
import { defineRecipe, defineSlotRecipe, type SystemStyleObject } from "@chakra-ui/react";
import {
  cardAnatomy,
  comboboxAnatomy,
  dialogAnatomy,
  drawerAnatomy,
  menuAnatomy,
  nativeSelectAnatomy,
  popoverAnatomy,
  segmentGroupAnatomy,
  switchAnatomy,
  tabsAnatomy,
  selectAnatomy,
} from "@chakra-ui/react/anatomy";

/** Outline width for controls and containers. */
export const outlineWidth = "2px";
/** Ruled dividers inside a bordered block. */
export const ruleWidth = "1px";

/** Hard offset shadows: x and y offset, no blur, no spread. */
export const shadowOffsets = {
  /** Pressed button. */
  pressed: "1px",
  /** Chips, small controls. */
  xs: "2px",
  /** Compact controls: buttons, inputs, tags. */
  sm: "3px",
  /** Containers: cards, dialogs, menus, lists. */
  md: "6px",
} as const;

const hard = (offset: string) => `${offset} ${offset} 0 0 var(--gn-shadow)`;

export const shadows = {
  xs: { value: hard(shadowOffsets.xs) },
  sm: { value: hard(shadowOffsets.sm) },
  md: { value: hard(shadowOffsets.md) },
  lg: { value: hard(shadowOffsets.md) },
  xl: { value: hard(shadowOffsets.md) },
  "2xl": { value: hard(shadowOffsets.md) },
  // The default inner shadow is blurred; a flat inset keeps the rule.
  inner: { value: `inset ${shadowOffsets.xs} ${shadowOffsets.xs} 0 0 var(--gn-shadow)` },
  pressed: { value: hard(shadowOffsets.pressed) },
};

// Everything is square. `full` stays for round things: slider thumbs,
// avatars, player transport buttons.
const square = { value: "0" };
export const radii = {
  "2xs": square,
  xs: square,
  sm: square,
  md: square,
  lg: square,
  xl: square,
  "2xl": square,
  "3xl": square,
  "4xl": square,
};

export const borderWidths = {
  outline: { value: outlineWidth },
  rule: { value: ruleWidth },
};

// Each token reads a CSS variable that the user's font choice sets from the
// `data-font-<role>` attribute (fontChoices.ts, emitted by chakraTheme.ts), so
// a face changes without touching the theme. The fallback stacks match the
// metrics of the loaded fonts closely enough to avoid layout shift while they
// swap in. `mono` (IDs, paths) is not a role: it is always Plex Mono.
export const fonts = {
  heading: { value: `var(--gn-font-heading), ${sansFallback}` },
  body: { value: `var(--gn-font-body), ${sansFallback}` },
  mono: { value: `var(--face-plex-mono, ${monoFallback}), ${monoFallback}` },
  label: { value: `var(--gn-font-label), ${monoFallback}` },
};

/** The focus ring every control shares: solid, offset from the 2px border. */
export const focusRing = {
  width: "2px",
  offset: "2px",
  color: "var(--gn-accent-focus-ring)",
} as const;

const motionSafe = "@media (prefers-reduced-motion: no-preference)";

// Pressing shifts a button down and right by the amount its shadow shrinks
// (3px to 1px), so it looks pushed into the page. Nothing moves for reduced
// motion; the darker fill still marks the press.
const buttonShift = "2px";

// Solid and outline buttons are labelled in the mono face; ghost buttons often
// hold content (a playlist's name), so they keep the body face.
const buttonLabel: SystemStyleObject = { fontFamily: "label", fontWeight: "semibold", letterSpacing: "0.02em" };

const solidButton: SystemStyleObject = {
  bg: "colorPalette.solid",
  color: "colorPalette.contrast",
  borderColor: "border.ink",
  boxShadow: "sm",
  _hover: { bg: "colorPalette.solid", filter: "brightness(1.08)" },
  _expanded: { bg: "colorPalette.solid" },
  _active: {
    filter: "brightness(0.94)",
    [motionSafe]: {
      transform: `translate(${buttonShift}, ${buttonShift})`,
      boxShadow: "pressed",
    },
  },
  _disabled: { boxShadow: "none" },
};

const fieldStates = (focus: SystemStyleObject): Record<"outline" | "subtle", SystemStyleObject> => ({
  outline: { borderWidth: "outline", borderColor: "border.ink", bg: "bg.panel", ...focus },
  subtle: { borderWidth: "outline", ...focus },
});
const outsideRing = { focusVisibleRing: "outside" } as const;

export const recipes = {
  button: defineRecipe({
    base: {
      borderWidth: "outline",
      [motionSafe]: {
        transitionProperty: "background-color, color, border-color, box-shadow, transform",
        transitionDuration: "80ms",
      },
    },
    variants: {
      // Mono capitals run wide; step the small size down so chips and toolbar
      // buttons stay compact.
      size: { sm: { fontSize: "13px" } },
      variant: {
        solid: { ...buttonLabel, ...solidButton },
        outline: { ...buttonLabel, borderColor: "colorPalette.border", boxShadow: "none" },
        ghost: { boxShadow: "none" },
      },
    },
  }),
  input: defineRecipe({ variants: { variant: fieldStates(outsideRing) } }),
  textarea: defineRecipe({ variants: { variant: fieldStates(outsideRing) } }),
  // Every badge is a tag: spaced-out mono capitals. Status tags always carry
  // their word, so the type does the work and the fill only adds to it.
  badge: defineRecipe({
    base: {
      fontFamily: "label",
      fontWeight: "medium",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    },
    variants: {
      size: {
        xs: { fontSize: "10px" },
        sm: { fontSize: "11px", px: "1.5" },
        md: { fontSize: "12px" },
      },
      variant: {
        subtle: { borderWidth: "rule", borderStyle: "solid", borderColor: "colorPalette.border" },
      },
    },
  }),
};

const container: SystemStyleObject = { borderWidth: "outline", borderColor: "border.ink", boxShadow: "md" };

export const slotRecipes = {
  card: defineSlotRecipe({
    slots: cardAnatomy.keys(),
    variants: {
      variant: { outline: { root: container }, elevated: { root: container }, subtle: { root: container } },
    },
  }),
  dialog: defineSlotRecipe({ slots: dialogAnatomy.keys(), base: { content: container } }),
  drawer: defineSlotRecipe({ slots: drawerAnatomy.keys(), base: { content: container } }),
  popover: defineSlotRecipe({ slots: popoverAnatomy.keys(), base: { content: container } }),
  menu: defineSlotRecipe({ slots: menuAnatomy.keys(), base: { content: container } }),
  select: defineSlotRecipe({
    slots: selectAnatomy.keys(),
    base: { content: container },
    variants: {
      variant: {
        outline: { trigger: fieldStates(outsideRing).outline },
        subtle: { trigger: fieldStates(outsideRing).subtle },
      },
    },
  }),
  // A segmented control: an outlined strip whose selection is an ink fill,
  // like an active filter chip.
  segmentGroup: defineSlotRecipe({
    slots: segmentGroupAnatomy.keys(),
    base: {
      root: {
        "--segment-indicator-bg": "colors.neutral.solid",
        "--segment-indicator-shadow": "none",
        borderWidth: "outline",
        borderColor: "border.ink",
        boxShadow: "none",
        bg: "bg.panel",
      },
      item: {
        fontFamily: "label",
        "&[data-state=checked]": { color: "neutral.contrast" },
        // Ringed inside the segment, so keyboard focus doesn't read as a
        // second, heavier selection box around the filled one.
        "&:has(input:focus-visible)": { "--focus-ring-offset": "-4px" },
      },
    },
  }),
  // Tabs are outlined boxes in the label face; the selected one is an ink fill,
  // like an active filter chip, instead of an underline.
  tabs: defineSlotRecipe({
    slots: tabsAnatomy.keys(),
    variants: {
      variant: {
        line: {
          list: { gap: "2", _horizontal: { borderBottomWidth: "0" } },
          trigger: {
            borderWidth: "outline",
            borderColor: "border.ink",
            bg: "bg.panel",
            fontFamily: "label",
            fontSize: "13px",
            fontWeight: "semibold",
            color: "fg",
            focusVisibleRing: "outside",
            _hover: { bg: "bg.emphasized" },
            _selected: {
              bg: "neutral.solid",
              color: "neutral.contrast",
              "&::before": { display: "none" },
            },
          },
          indicator: { display: "none" },
        },
      },
    },
  }),
  // A square toggle: an ink-outlined box with a square thumb. The outline is
  // an inset shadow, not a border, so the thumb's travel keeps its sums.
  switch: defineSlotRecipe({
    slots: switchAnatomy.keys(),
    base: { label: { fontFamily: "label", fontSize: "13px", fontWeight: "semibold" } },
    variants: {
      variant: {
        solid: {
          control: {
            borderRadius: "0",
            bg: "bg.panel",
            boxShadow: "inset 0 0 0 2px var(--gn-ink)",
            _checked: { bg: "colorPalette.solid" },
          },
          thumb: {
            borderRadius: "0",
            bg: "fg",
            boxShadow: "none",
            _checked: { bg: "colorPalette.contrast" },
          },
        },
      },
    },
  }),
  // The genre filter: a field that looks like the buttons beside it.
  combobox: defineSlotRecipe({
    slots: comboboxAnatomy.keys(),
    base: { content: container },
    variants: {
      variant: {
        outline: {
          input: { ...fieldStates(outsideRing).outline, ...buttonLabel, fontSize: { base: "16px", md: "13px" } },
        },
      },
    },
  }),
  nativeSelect: defineSlotRecipe({
    slots: nativeSelectAnatomy.keys(),
    variants: {
      variant: {
        outline: { field: fieldStates(outsideRing).outline },
        subtle: { field: fieldStates(outsideRing).subtle },
      },
    },
  }),
};

// A focus ring for anything the recipes don't reach: plain elements with a
// tabIndex, third-party widgets. Recipes that set their own ring use the same
// width, offset and colour.
export const globalCss: Record<string, SystemStyleObject> = {
  ":focus-visible": {
    outline: `${focusRing.width} solid ${focusRing.color}`,
    outlineOffset: focusRing.offset,
  },
};
