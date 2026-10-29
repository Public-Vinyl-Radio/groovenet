import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box } from "@chakra-ui/react";
import ExpandableMarkdown from "@/components/ExpandableMarkdown";

const meta: Meta<typeof ExpandableMarkdown> = {
  title: "Components/ExpandableMarkdown",
  component: ExpandableMarkdown,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Box maxW="600px" mx="auto">
        <Story />
      </Box>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ExpandableMarkdown>;

const shortNote = '"Cumbia 73" brings vintage electric guitar and tight rhythm—solid mid-set pick.';

const longNote = `"Cumbia Pop" by Los Beltons is a vibrant, guitar-forward chicha track—fuzzed riffs, bouncy percussion, and melodic hooks. Use it early-mid set to inject upbeat energy and modern nostalgia. Its surf-influenced undercurrent fits well transitioning into tropical funk or nu-chicha cuts.

The guitar tone in particular is distinctive: heavily fuzzed but melodic. Good for segueing from raw funk or salsa-inflected cuts to give the floor a tasteful retro vibe.`;

const markdownNote = `**"Baila Mi Cumbia"** by Carlos Pickling y Su Orquesta is concise and hook-heavy.

- Closes or restarts sets with upbeat momentum
- Perfect for encore transitions
- BPM: 97 — pairs well with 95–100 BPM tracks

> Use a strong fade or drop to link into the next segment.`;

export const Short: Story = {
  name: "Short (no expand needed)",
  args: {
    text: shortNote,
    maxLength: 100,
  },
};

export const Long: Story = {
  name: "Long (truncated, expandable)",
  args: {
    text: longNote,
    maxLength: 100,
  },
};

export const WithMarkdown: Story = {
  name: "With markdown formatting",
  args: {
    text: markdownNote,
    maxLength: 80,
  },
};

export const CustomMaxLength: Story = {
  name: "Custom max length (200 chars)",
  args: {
    text: longNote,
    maxLength: 200,
  },
};
