export type { GamdlSettings } from "@groovenet/contracts";

export interface CookieFileInfo {
  exists: boolean;
  filename?: string;
  size?: number;
  lastModified?: Date;
  domains?: string[];
  cookieCount?: number;
  hasAppleMusic?: boolean;
  expiryDates?: Date[];
  isValid?: boolean;
  validationErrors?: string[];
}

export type {
  GamdlConnectionTestDetails,
  GamdlConnectionTestResponse as GamdlConnectionTestResult,
  GamdlSettingsChanges as GamdlSettingsUpdate,
} from "@groovenet/contracts";

export const AUDIO_QUALITY_OPTIONS = [
  { value: "best", label: "Best Available", description: "Highest quality available" },
  { value: "lossless", label: "Lossless", description: "ALAC lossless (if available)" },
  { value: "high", label: "High (256kbps)", description: "AAC 256kbps" },
  { value: "standard", label: "Standard", description: "Lower quality for faster downloads" },
] as const;

export const AUDIO_FORMAT_OPTIONS = [
  { value: "m4a", label: "M4A (AAC)", description: "Apple's native format, best compatibility" },
  { value: "mp3", label: "MP3", description: "Universal compatibility" },
  { value: "aac", label: "AAC", description: "Advanced Audio Codec" },
  { value: "flac", label: "FLAC", description: "Lossless compression (if available)" },
] as const;

export const COVER_FORMAT_OPTIONS = [
  { value: "jpg", label: "JPEG", description: "Standard compressed format" },
  { value: "png", label: "PNG", description: "Lossless image format" },
  { value: "raw", label: "Raw", description: "Original format without processing" },
] as const;

export const LYRICS_FORMAT_OPTIONS = [
  { value: "lrc", label: "LRC", description: "Lightweight and widely supported" },
  { value: "srt", label: "SRT", description: "SubRip format with accurate timestamps" },
  { value: "ttml", label: "TTML", description: "Native Apple Music format" },
] as const;
