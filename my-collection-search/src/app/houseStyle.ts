// The retro house style: square corners, 2px outlines, hard offset shadows
// with no blur, mono labels (#667). Everything that gives the app its shape
// lives in this file, so tuning the look is a one-file change.
//
// Provisional until #664 is signed off.
import { monoFallback, sansFallback } from "./fontChoices";
import { defineRecipe, defineSlotRecipe, type SystemStyleObject } from "@chakra-ui/react";
import {
  cardAnatomy,
  checkboxAnatomy,
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

/** Shared cover treatment; CSS variables also let Storybook preview token changes. */
export const coverTokens = {
  borderWidth: "var(--gn-cover-border-width, var(--chakra-border-widths-outline))",
  borderColor: "var(--gn-cover-border-color, var(--gn-ink))",
  radius: "var(--gn-radius)",
  monochrome: "var(--gn-cover-grayscale, 0)",
  transition: "filter 150ms ease",
} as const;

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

// Every step reads `--gn-radius`: 0 (square) by default, and softer under
// `[data-corners="rounded"]` (the Corners setting, corners.ts). `full` stays for
// round things: slider thumbs, avatars, player transport buttons.
const corner = { value: "var(--gn-radius)" };
export const radii = {
  "2xs": corner,
  xs: corner,
  sm: corner,
  md: corner,
  lg: corner,
  xl: corner,
  "2xl": corner,
  "3xl": corner,
  "4xl": corner,
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

// Every button variant is labelled in the mono face: the line is action versus
// content, not variant (#687). A button whose text is data (a playlist's name)
// opts out at the call site with `fontFamily="body"`.
const buttonLabel: SystemStyleObject = {
  fontFamily: "label",
  fontWeight: "semibold",
  letterSpacing: "0.02em",
};

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

const fieldStates = (
  focus: SystemStyleObject,
): Record<"outline" | "subtle", SystemStyleObject> => ({
  outline: { borderWidth: "outline", borderColor: "border.ink", bg: "bg.panel", ...focus },
  subtle: { borderWidth: "outline", ...focus },
});
const outsideRing = { focusVisibleRing: "outside" } as const;

// Badge roles (#963): six looks, one per meaning, for every badge, chip and tag.
// Components in `components/ui/RoleTags.tsx` and `FilterChip.tsx` render them;
// product code never styles a tag itself. Every colour is a named semantic
// token, never `colorPalette.*`, so a tag can't fall back to Chakra's stock
// gray, and `badgeRoles.test.ts` checks each one exists in every palette.

/** A tag's text, from the Labels face: capitals by CSS, so labels stay sentence case. */
const tagBase: SystemStyleObject = {
  display: "inline-flex",
  alignItems: "center",
  boxSizing: "border-box",
  maxW: "100%",
  borderWidth: "rule",
  borderStyle: "solid",
  borderRadius: "md",
  fontFamily: "label",
  fontWeight: "medium",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  textDecoration: "none",
  verticalAlign: "middle",
  // A linked tag (a genre, a playlist count) looks like a static one until it
  // is hovered or focused: an underline and the focus ring, and nothing else.
  "&:is(a, button)": {
    cursor: "pointer",
    focusVisibleRing: "outside",
    _hover: { textDecoration: "underline" },
  },
};

// sm is 20px with 11px text, xs 16px with 10px. The height is fixed and the
// line height fills what the ring leaves, so the text stays centred when a row
// switches a tag to `display: block` to end it in an ellipsis.
const tagSizes = (ring: number) => ({
  sm: { h: "20px", px: "6px", gap: "6px", fontSize: "11px", lineHeight: `${20 - 2 * ring}px` },
  xs: { h: "16px", px: "4px", gap: "4px", fontSize: "10px", lineHeight: `${16 - 2 * ring}px` },
});

/** The filter chip's text, shared with the chip row's "Clear all". */
export const filterChipText = {
  fontFamily: "label",
  fontSize: "12px",
  fontWeight: "semibold",
  letterSpacing: "0.04em",
} as const;

export const roleRecipes = {
  // A state to notice or act on. Never solid: the word carries the state and
  // the tint only supports it (B9 asked for status tokens that don't exist).
  statusTag: defineRecipe({
    className: "status-tag",
    base: tagBase,
    variants: {
      size: tagSizes(1),
      tone: {
        missing: {
          bg: "status.missing.subtle",
          color: "status.missing.fg",
          borderColor: "status.missing.border",
        },
        analysis: {
          bg: "status.analysis.subtle",
          color: "status.analysis.fg",
          borderColor: "status.analysis.border",
        },
        success: {
          bg: "status.success.subtle",
          color: "status.success.fg",
          borderColor: "status.success.border",
        },
        neutral: { bg: "bg.muted", color: "fg.muted", borderColor: "border" },
      },
    },
    defaultVariants: { size: "sm", tone: "neutral" },
  }),
  // What a record is: genre, style, mood. The genre purple means this and
  // nothing else. A value the taxonomy doesn't know yet has a dashed ring.
  categoryTag: defineRecipe({
    className: "category-tag",
    base: {
      ...tagBase,
      bg: "status.genre.subtle",
      color: "status.genre.fg",
      borderColor: "status.genre.border",
    },
    variants: {
      size: tagSizes(1),
      unreconciled: { true: { borderStyle: "dashed" }, false: {} },
    },
    defaultVariants: { size: "sm", unreconciled: false },
  }),
  // A value: key, BPM, era, a count with its noun. The library ID is the one
  // accent tag; raw values (paths, hashes) keep their case in Plex Mono.
  metaTag: defineRecipe({
    className: "meta-tag",
    base: { ...tagBase, bg: "transparent", color: "fg", borderColor: "border" },
    variants: {
      size: tagSizes(1),
      variant: {
        plain: {},
        id: { color: "accent.fg", borderColor: "accent.border", fontWeight: "semibold" },
        raw: { fontFamily: "mono", textTransform: "none", letterSpacing: "0" },
      },
    },
    defaultVariants: { size: "sm", variant: "plain" },
  }),
  // Provenance and output: vinyl/digital, web/CLI/MCP/API, auto/manual. The
  // value is the border style or an ink fill, so it reads without colour.
  sourceTag: defineRecipe({
    className: "source-tag",
    base: {
      ...tagBase,
      borderWidth: "outline",
      bg: "transparent",
      color: "fg",
      borderColor: "fg",
      fontSize: "10px",
      fontWeight: "semibold",
      letterSpacing: "0.08em",
    },
    variants: {
      size: {
        sm: { ...tagSizes(2).sm, fontSize: "10px" },
        xs: { ...tagSizes(2).xs, fontSize: "10px" },
      },
      stroke: {
        solid: {},
        dotted: { borderStyle: "dotted" },
        dashed: { borderStyle: "dashed" },
        double: { borderStyle: "double", borderWidth: "3px" },
        fill: { bg: "fg", color: "bg" },
      },
      // On an ink-filled surface (the just-saved care-log card).
      inverted: { true: { color: "bg", borderColor: "bg" }, false: {} },
    },
    compoundVariants: [
      { stroke: "double", size: "sm", css: { px: "5px", lineHeight: "14px" } },
      { stroke: "double", size: "xs", css: { px: "3px", lineHeight: "10px" } },
      { stroke: "fill", inverted: true, css: { bg: "bg", color: "fg" } },
    ],
    defaultVariants: { size: "sm", stroke: "solid", inverted: false },
  }),
  // A bare number. `strong` is the one that matters; `dot` is a notification,
  // the only other use of the accent.
  countTag: defineRecipe({
    className: "count-tag",
    base: {
      ...tagBase,
      justifyContent: "center",
      bg: "bg.muted",
      color: "fg.muted",
      borderColor: "border",
      fontWeight: "semibold",
    },
    variants: {
      size: {
        sm: { ...tagSizes(1).sm, minW: "20px" },
        xs: { ...tagSizes(1).xs, minW: "16px" },
      },
      variant: {
        plain: {},
        strong: { bg: "fg", color: "bg", borderColor: "fg" },
        dot: { bg: "accent.solid", color: "accent.contrast", borderColor: "accent.solid" },
      },
    },
    defaultVariants: { size: "sm", variant: "plain" },
  }),
  // Pressable and removable (#794): an active chip is surface-filled with an
  // ink outline and an x; an inactive one is a quiet outline. 32px, 44px on phones.
  filterChip: defineRecipe({
    className: "filter-chip",
    base: {
      ...filterChipText,
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      flexShrink: 0,
      minH: { base: "44px", md: "32px" },
      maxW: "280px",
      pl: "10px",
      pr: "10px",
      borderWidth: "outline",
      borderStyle: "solid",
      borderRadius: "md",
      borderColor: "border",
      bg: "transparent",
      color: "fg",
      textTransform: "uppercase",
      cursor: "pointer",
      focusVisibleRing: "outside",
      _hover: { bg: "bg.muted" },
    },
    variants: {
      active: {
        true: { pr: "6px", borderColor: "border.ink", bg: "bg.subtle" },
        false: {},
      },
    },
    defaultVariants: { active: false },
  }),
};

// Section type (#991): two components, every in-page section. `SectionHeading`
// is the display face at 18/24 (17/22 on phones); `SectionLabel` is the Labels
// face at 12/16, capitals by CSS. Line heights are explicit on both: Chakra's
// Heading carries a 30px line box that a 12px label used to inherit.
const labelType: SystemStyleObject = {
  m: 0,
  fontFamily: "label",
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: "semibold",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const sectionRecipes = {
  sectionHeading: defineRecipe({
    className: "section-heading",
    base: {
      m: 0,
      minW: 0,
      fontFamily: "heading",
      fontWeight: "semibold",
      fontSize: { base: "17px", md: "18px" },
      lineHeight: { base: "22px", md: "24px" },
    },
  }),
  // A count or summary beside a section heading.
  sectionMeta: defineRecipe({
    className: "section-meta",
    base: {
      fontFamily: "label",
      fontSize: "12px",
      lineHeight: "16px",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "fg.muted",
    },
  }),
  sectionLabel: defineRecipe({
    className: "section-label",
    base: labelType,
    variants: {
      variant: {
        // The ink tab on a rule: 26px, 24px with 11px text on a phone.
        strip: {
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          whiteSpace: "nowrap",
          h: { base: "24px", md: "26px" },
          px: { base: 2, md: 2.5 },
          fontSize: { base: "11px", md: "12px" },
          bg: "fg",
          color: "bg",
          borderTopRadius: "md",
        },
        overline: { fontSize: "11px", color: "fg.muted" },
        // The label inside a linked bar; the bar itself is `sectionBar`.
        bar: {},
      },
    },
    defaultVariants: { variant: "overline" },
  }),
  // A linked ink bar: label at the start, a trailing label at the end.
  sectionBar: defineRecipe({
    className: "section-bar",
    base: {
      ...labelType,
      display: "flex",
      h: "44px",
      px: 3,
      alignItems: "center",
      justifyContent: "space-between",
      bg: "fg",
      color: "bg",
      // Square: the card around it clips it to its corners (Link rounds by default).
      borderRadius: "0",
      textDecoration: "none",
      _hover: { textDecoration: "none" },
    },
  }),
};

export const recipes = {
  ...roleRecipes,
  ...sectionRecipes,
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
        ghost: { ...buttonLabel, boxShadow: "none" },
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

const container: SystemStyleObject = {
  borderWidth: "outline",
  borderColor: "border.ink",
  boxShadow: "md",
};

// The centred modal (`RetroDialog`, #735): an ink scrim under a 4px halftone dot
// pattern instead of a blur, and a scale-in that is quick and absent for
// reduced motion. The positioner leaves 22px on the right for the 6px shadow
// and keeps clear of the notch and home indicator.
export const retroDialog = {
  positioner: {
    pt: "calc(env(safe-area-inset-top, 0px) + 16px)",
    pb: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
    pl: "16px",
    pr: "22px",
  },
  backdrop: {
    bg: "color-mix(in srgb, var(--gn-ink) 38%, transparent)",
    backgroundImage:
      "radial-gradient(color-mix(in srgb, var(--gn-ink) 55%, transparent) 1px, transparent 1.6px)",
    backgroundSize: "4px 4px",
    backdropFilter: "none",
    animationDuration: "100ms",
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  },
  content: {
    ...container,
    bg: "bg",
    m: 0,
    maxH: "100%",
    maxW: "sm",
    animationDuration: "100ms",
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  },
} satisfies Record<string, SystemStyleObject>;

// Diagonal stripes for a disabled control: readable without colour.
const disabledHatch =
  "repeating-linear-gradient(135deg, var(--gn-border) 0 2px, transparent 2px 6px)";

export const slotRecipes = {
  card: defineSlotRecipe({
    slots: cardAnatomy.keys(),
    variants: {
      variant: {
        outline: { root: container },
        elevated: { root: container },
        subtle: { root: container },
      },
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
        // The selection is a square fill the root's radius clips to its corners.
        overflow: "hidden",
      },
      indicator: { borderRadius: "0" },
      item: {
        borderRadius: "0",
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
            borderRadius: "md",
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
  // The stock box has a 1px zinc border (about 1.5:1 on the page) and a fixed
  // zinc fill, so it ignored the palette and an unchecked box almost vanished
  // (#687). Same states as the switch: off is an empty 2px ink box, on an
  // accent fill with a check, focus the offset ring, disabled a muted outline
  // over the hatch at full opacity so it never reads as an unchecked box.
  checkbox: defineSlotRecipe({
    slots: checkboxAnatomy.keys(),
    variants: {
      variant: {
        solid: {
          control: {
            borderWidth: "outline",
            borderColor: "border.ink",
            borderRadius: "sm",
            bg: "bg.panel",
            color: "accent.contrast",
            focusVisibleRing: "outside",
            _checked: {
              bg: "accent.solid",
              borderColor: "border.ink",
              color: "accent.contrast",
              _disabled: { bg: "bg.panel", color: "fg.muted", bgImage: disabledHatch },
            },
            _disabled: {
              opacity: "1",
              borderColor: "fg.muted",
              bgImage: disabledHatch,
            },
          },
        },
      },
    },
  }),
  // A square toggle (#899). Off: an empty outlined box with a small hollow
  // knob inset on the left. On: an accent fill with a solid knob on the right
  // carrying a check mark, so the state reads from shape, not colour alone
  // (Mono's accent is near its ink). Disabled is hatched. The outline is an
  // inset shadow, not a border, so the thumb's travel keeps its sums.
  switch: defineSlotRecipe({
    slots: switchAnatomy.keys(),
    base: {
      label: { fontFamily: "label", fontSize: "13px", fontWeight: "semibold" },
      control: { alignItems: "center" },
    },
    variants: {
      variant: {
        solid: {
          root: { "--switch-inset": "6px", _checked: { "--switch-inset": "4px" } },
          control: {
            borderRadius: "md",
            bg: "bg.panel",
            boxShadow: "inset 0 0 0 2px var(--gn-ink)",
            focusVisibleRing: "outside",
            // Chakra's own `_checked` sets the `bg` shorthand, which resets
            // the hatch, so a disabled checked switch repeats it.
            _checked: { bg: "accent.solid", _disabled: { bgImage: disabledHatch } },
            _disabled: {
              opacity: "1",
              boxShadow: "inset 0 0 0 2px var(--gn-ink-muted)",
              bgImage: disabledHatch,
            },
          },
          thumb: {
            position: "relative",
            borderRadius: "md",
            width: "calc(var(--switch-height) - 2 * var(--switch-inset))",
            height: "calc(var(--switch-height) - 2 * var(--switch-inset))",
            ms: "var(--switch-inset)",
            scale: "1",
            bg: "transparent",
            boxShadow: "inset 0 0 0 2px var(--gn-ink)",
            _checked: {
              bg: "accent.contrast",
              boxShadow: "none",
              // The check mark: two sides of a box, turned 45°.
              _after: {
                content: '""',
                position: "absolute",
                left: "50%",
                top: "45%",
                width: "30%",
                height: "55%",
                borderRightWidth: "2px",
                borderBottomWidth: "2px",
                borderColor: "accent.solid",
                transform: "translate(-50%, -50%) rotate(45deg)",
              },
            },
            _disabled: { boxShadow: "inset 0 0 0 2px var(--gn-ink-muted)", bg: "bg.panel" },
          },
        },
      },
      // Big enough for an inset knob and a legible check at 13px labels.
      size: {
        sm: { root: { "--switch-width": "40px", "--switch-height": "22px" } },
        md: { root: { "--switch-width": "48px", "--switch-height": "26px" } },
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
          input: {
            ...fieldStates(outsideRing).outline,
            ...buttonLabel,
            fontSize: { base: "16px", md: "13px" },
          },
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
  // The bottom chrome the shell publishes, so content padding, the toaster and
  // the floating player agree on one number. Mobile: the tab bar (56px row, 2px
  // rule, home-indicator inset) plus the mini player (2px rule, 4px progress
  // line, 68px row). Desktop has no tab bar and a 92px docked bar. `data-player`
  // is set while a queue is loaded; `data-tabbar-hidden` on fullscreen edit
  // routes; `data-queue-panel` while the desktop queue panel is open, which
  // the content makes room for (`--queue-w`).
  html: {
    "--safe-top": "env(safe-area-inset-top, 0px)",
    "--safe-bottom": "env(safe-area-inset-bottom, 0px)",
    "--tabbar-h": "calc(58px + var(--safe-bottom))",
    "--player-h": "0px",
    "--chrome-bottom": "calc(var(--tabbar-h) + var(--player-h))",
    "--queue-w": "0px",
    // PageHeader (phones): the sticky bar's height, and the shell's top padding,
    // which the bar replaces once a page mounts one (`data-page-header`).
    "--header-h": "52px",
    "--content-pt": "calc(var(--safe-top) + 28px)",
    "&[data-page-header]": { "--content-pt": "var(--safe-top)" },
    scrollPaddingTop: "calc(var(--safe-top) + var(--header-h))",
    "&[data-player]": { "--player-h": "74px" },
    "&[data-tabbar-hidden]": { "--tabbar-h": "0px" },
    "@media (min-width: 768px)": {
      "--tabbar-h": "0px",
      "&[data-player]": { "--player-h": "92px" },
      "&[data-queue-panel]": { "--queue-w": "400px" },
    },
  },
  ":focus-visible": {
    outline: `${focusRing.width} solid ${focusRing.color}`,
    outlineOffset: focusRing.offset,
  },
};
