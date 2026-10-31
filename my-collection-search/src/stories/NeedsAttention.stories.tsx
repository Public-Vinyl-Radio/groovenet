import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import NeedsAttention from "@/components/home/NeedsAttention";
const meta: Meta<typeof NeedsAttention> = {
  title: "Home/Needs attention",
  component: NeedsAttention,
  parameters: { layout: "padded" },
  args: {
    attention: { missing_audio: 12, missing_bpm_or_key: 0, due_for_cleaning: 3, failed_jobs: 2 },
  },
};
export default meta;
type Story = StoryObj<typeof NeedsAttention>;
export const MixedCounts: Story = {};
export const Phone: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };
export const AllClear: Story = {
  args: {
    attention: { missing_audio: 0, missing_bpm_or_key: 0, due_for_cleaning: 0, failed_jobs: 0 },
  },
};
export const JobsUnavailable: Story = {
  args: {
    attention: { missing_audio: 0, missing_bpm_or_key: 0, due_for_cleaning: 0, failed_jobs: null },
  },
};
export const Loading: Story = { args: { attention: null } };
export const Error: Story = { args: { attention: null, error: "Summary unavailable" } };
