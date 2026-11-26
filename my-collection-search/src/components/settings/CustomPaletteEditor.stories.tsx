import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { customFromPreset, type CustomPalette } from "@/app/palettes/custom";
import CustomPaletteEditor from "./CustomPaletteEditor";

// Ink is text and Outline is the line round buttons, cards, inputs and chips.
// Edit Outline to watch the preview's outlines change while its text stays put.
const meta: Meta<typeof CustomPaletteEditor> = {
  title: "Settings/CustomPaletteEditor",
  component: CustomPaletteEditor,
  args: {
    saved: null,
    initialBase: "sleeve",
    saving: false,
    onSave: () => {},
    onDelete: () => {},
    onClose: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof CustomPaletteEditor>;

const sleeve = customFromPreset("sleeve");

/** A new palette: Outline starts equal to Ink, as in every built-in palette. */
export const Default: Story = {};

/** Cream-on-ink text with a clearly different, passing outline in each mode. */
export const SplitOutline: Story = {
  args: {
    saved: {
      ...sleeve,
      light: { ...sleeve.light, outline: "#1d4e89" },
      dark: { ...sleeve.dark, outline: "#e8573a" },
    } satisfies CustomPalette,
  },
};

/** An outline too close to the ground: it fails 3:1 and is warned about, not changed. */
export const WeakOutline: Story = {
  args: {
    saved: {
      ...sleeve,
      light: { ...sleeve.light, outline: "#e6dccb" },
    } satisfies CustomPalette,
  },
};
