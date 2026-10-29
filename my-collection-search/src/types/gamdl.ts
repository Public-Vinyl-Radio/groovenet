export interface GamdlSettings {
  id: number;
  friend_id: number;
  audio_quality: "best" | "high" | "standard" | "lossless";
  audio_format: "m4a" | "mp3" | "aac" | "flac";
  save_cover: boolean;
  cover_format: "jpg" | "png" | "raw";
  save_lyrics: boolean;
  lyrics_format: "lrc" | "srt" | "ttml";
  overwrite_existing: boolean;
  skip_music_videos: boolean;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

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

export interface GamdlConnectionTestDetails {
  gamdl_available: boolean;
  cookie_file_exists: boolean;
  cookie_file_valid: boolean;
  test_download_attempted: boolean;
  test_download_success: boolean;
  error_type?: string;
}

export interface GamdlConnectionTestResult {
  success: boolean;
  message: string;
  details: GamdlConnectionTestDetails;
}

export interface GamdlSettingsUpdate {
  audio_quality?: "best" | "high" | "standard" | "lossless";
  audio_format?: "m4a" | "mp3" | "aac" | "flac";
  save_cover?: boolean;
  cover_format?: "jpg" | "png" | "raw";
  save_lyrics?: boolean;
  lyrics_format?: "lrc" | "srt" | "ttml";
  overwrite_existing?: boolean;
  skip_music_videos?: boolean;
  max_retries?: number;
}

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
