import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box } from "@chakra-ui/react";
import FileInfo, { FileInfoDetails } from "@/components/player/FileInfo";
import { sampleTrack } from "./fixtures/track";

const apple = {
  ...sampleTrack,
  local_audio_url: "/audio/Artist/Album/Track.m4a",
  audio_source: "apple_music" as const,
  audio_codec: "alac",
  audio_container: "m4a",
  audio_lossless: true,
  audio_sample_rate: 96000,
  audio_bit_depth: 24,
  audio_bitrate: 2800000,
  audio_channels: 2,
  audio_size_bytes: 125000000,
  audio_probed_at: "2026-11-06T10:00:00Z",
};
const meta: Meta<typeof FileInfo> = {
  title: "Components/File info",
  component: FileInfo,
  args: { track: apple },
  decorators: [
    (Story) => (
      <Box minH="600px" display="flex" alignItems="end" p={4}>
        <Story />
      </Box>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof FileInfo>;
export const AppleLossless: Story = {};
export const YouTube: Story = {
  args: {
    track: {
      ...apple,
      audio_source: "youtube",
      audio_codec: "opus",
      audio_container: "webm",
      audio_lossless: false,
      audio_bit_depth: null,
      audio_sample_rate: 48000,
      audio_bitrate: 160000,
    },
  },
};
export const Upload: Story = {
  args: {
    track: {
      ...apple,
      audio_source: "upload",
      audio_codec: "flac",
      audio_container: "flac",
      audio_bit_depth: 16,
      audio_sample_rate: 44100,
    },
  },
};
export const Stream: Story = {
  args: {
    track: {
      ...sampleTrack,
      local_audio_url: undefined,
      apple_music_url: "https://music.apple.com/track",
    },
  },
};
export const NoMetadataYet: Story = {
  args: { track: { ...sampleTrack, local_audio_url: "/audio/old-file.mp3" } },
};
export const Phone: Story = {
  args: { mobile: true },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const TrackFile: Story = {
  render: (args) => (
    <Box w="100%" maxW="390px" alignSelf="start">
      <FileInfoDetails track={args.track} fullPath />
    </Box>
  ),
};
