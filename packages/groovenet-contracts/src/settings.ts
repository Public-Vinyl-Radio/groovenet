import { z } from "zod";

// Per-library and app-wide settings (#985): the AI metadata prompt, the
// suggestion scope, the appearance and the GAMDL downloader.
//
// The appearance ids mirror the app's registries (`app/palettes`,
// `app/corners.ts`, `app/fontChoices.ts`), which this package cannot import;
// `settingsContract.test.ts` in the app fails when either side drifts.

// ─── AI prompt ───────────────────────────────────────────────────────────────

export const aiPromptSettingsQuerySchema = z.object({
  friend_id: z.number().int().optional(),
});

export const aiPromptSettingsUpdateSchema = z.object({
  friend_id: z.number().int(),
  prompt: z
    .string()
    .optional()
    .default("")
    .meta({ description: "An empty prompt restores the default." }),
});

export const aiPromptSettingsSchema = z.object({
  prompt: z.string(),
  defaultPrompt: z.string(),
  isDefault: z.boolean(),
});

export const aiPromptSettingsUpdateResponseSchema = z.object({
  prompt: z.string(),
  isDefault: z.boolean(),
});

// ─── Recommendation scope ────────────────────────────────────────────────────

export const recommendationScopeSchema = z.enum(["library", "all"]);

export const RECOMMENDATION_SCOPES = recommendationScopeSchema.options;

export const recommendationSettingsQuerySchema = z.object({
  friend_id: z.number().int(),
});

export const recommendationSettingsUpdateSchema = z.object({
  friend_id: z.number().int(),
  scope: recommendationScopeSchema,
});

export const recommendationSettingsSchema = z.object({
  friend_id: z.number().int(),
  scope: recommendationScopeSchema,
  isDefault: z
    .boolean()
    .meta({ description: "True when the library has never chosen, so `scope` is the default." }),
});

// ─── Appearance ──────────────────────────────────────────────────────────────

export const appearancePaletteIdSchema = z.enum(["sleeve", "riso", "midnight", "mono"]);

export const appearancePaletteSchema = z
  .enum([...appearancePaletteIdSchema.options, "custom"])
  .meta({ description: "`custom` only while a custom palette is saved." });

export const appearanceCornersSchema = z
  .enum(["square", "rounded"])
  .meta({ description: "Corner style: `square` (default) or `rounded`." });

export const APPEARANCE_PALETTE_IDS = appearancePaletteIdSchema.options;
export const APPEARANCE_CORNERS = appearanceCornersSchema.options;

// Each role accepts only its own faces, so a slab can't be set as the body font.
export const appearanceDisplayFontSchema = z.enum([
  "default",
  "barlow-condensed",
  "zilla-slab",
  "system",
]);
export const appearanceBodyFontSchema = z.enum(["default", "inter", "system"]);
export const appearanceLabelFontSchema = z.enum(["default", "jetbrains-mono", "system"]);

export const appearanceFontsShape = {
  display: appearanceDisplayFontSchema,
  body: appearanceBodyFontSchema,
  label: appearanceLabelFontSchema,
};

export const APPEARANCE_FONT_CHOICES = {
  display: appearanceDisplayFontSchema.options,
  body: appearanceBodyFontSchema.options,
  label: appearanceLabelFontSchema.options,
};

const hexColour = () =>
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb colour")
    .meta({ example: "#f4ede0" });

const appearanceCustomColoursSchema = z
  .object({
    ground: hexColour(),
    surface: hexColour(),
    ink: hexColour(),
    accent: hexColour(),
    shadow: hexColour(),
  })
  .strict();

export const appearanceCustomPaletteSchema = z
  .object({
    base: appearancePaletteIdSchema,
    light: appearanceCustomColoursSchema,
    dark: appearanceCustomColoursSchema,
  })
  .strict()
  .meta({
    description:
      "The inputs of the one saved custom palette: the preset it started from (it supplies the status colours) and five #rrggbb colours per mode. Everything else is derived when rendering.",
  });

export const appearanceFontsSchema = z.object(appearanceFontsShape).meta({
  description:
    "A face per role. `default` is the app's own face for that role, `system` the platform font.",
});

export const appearanceSettingsSchema = z.object({
  palette: appearancePaletteSchema,
  fonts: appearanceFontsSchema,
  customPalette: appearanceCustomPaletteSchema.nullable(),
  corners: appearanceCornersSchema,
});

// Every field is optional and only the ones sent change, so `{ palette }` still
// works and a font change leaves the palette alone. The route rejects unknown
// fields.
export const appearanceSettingsUpdateObjectSchema = z
  .object({
    palette: appearancePaletteSchema.optional(),
    fonts: z.object(appearanceFontsShape).partial().strict().optional(),
    customPalette: appearanceCustomPaletteSchema.nullable().optional().meta({
      description:
        "Replaces the saved custom palette; null deletes it (and falls back to the default palette if it was in use).",
    }),
    corners: appearanceCornersSchema.optional(),
  })
  .strict();

/** `palette: "custom"` needs a custom palette to point at. */
export const refineAppearanceSettingsUpdate = (body: {
  palette?: string;
  customPalette?: unknown;
}) => !(body.palette === "custom" && body.customPalette === null);

export const appearanceSettingsUpdateSchema = appearanceSettingsUpdateObjectSchema.refine(
  refineAppearanceSettingsUpdate,
  { path: ["palette"], message: "palette custom needs a custom palette" },
);

// ─── GAMDL ───────────────────────────────────────────────────────────────────

export const gamdlAudioQualitySchema = z.enum(["best", "high", "standard", "lossless"]);
export const gamdlAudioFormatSchema = z.enum(["m4a", "mp3", "aac", "flac"]);
export const gamdlCoverFormatSchema = z.enum(["jpg", "png", "raw"]);
export const gamdlLyricsFormatSchema = z.enum(["lrc", "srt", "ttml"]);

export const gamdlSettingsQuerySchema = z.object({
  friend_id: z.number().int(),
});

export const gamdlSettingsSchema = z.object({
  id: z.number().int(),
  friend_id: z.number().int(),
  audio_quality: gamdlAudioQualitySchema,
  audio_format: gamdlAudioFormatSchema,
  save_cover: z.boolean(),
  cover_format: gamdlCoverFormatSchema,
  save_lyrics: z.boolean(),
  lyrics_format: gamdlLyricsFormatSchema,
  overwrite_existing: z.boolean(),
  skip_music_videos: z.boolean(),
  max_retries: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** What can change; the repository drops any other field rather than reject it. */
export const gamdlSettingsChangesSchema = z.object({
  audio_quality: gamdlAudioQualitySchema.optional(),
  audio_format: gamdlAudioFormatSchema.optional(),
  save_cover: z.boolean().optional(),
  cover_format: gamdlCoverFormatSchema.optional(),
  save_lyrics: z.boolean().optional(),
  lyrics_format: gamdlLyricsFormatSchema.optional(),
  overwrite_existing: z.boolean().optional(),
  skip_music_videos: z.boolean().optional(),
  max_retries: z.number().int().optional(),
});

export const gamdlSettingsUpdateSchema = gamdlSettingsChangesSchema.extend({
  friend_id: z.number().int(),
});

export const gamdlSettingsResponseSchema = z.object({
  settings: gamdlSettingsSchema,
});

export const gamdlSettingsUpdateResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  settings: gamdlSettingsSchema,
});

export const gamdlSettingsResetResponseSchema = gamdlSettingsUpdateResponseSchema;

export const gamdlCookieFileInfoSchema = z
  .object({
    exists: z.boolean(),
    filename: z.string().optional(),
    size: z.number().optional(),
    lastModified: z.string().optional(),
    domains: z.array(z.string()).optional(),
    cookieCount: z.number().int().optional(),
    hasAppleMusic: z.boolean().optional(),
    expiryDates: z.array(z.string()).optional(),
    isValid: z.boolean().optional(),
    validationErrors: z.array(z.string()).optional(),
  })
  .passthrough();

export const gamdlCookieUploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  cookieInfo: gamdlCookieFileInfoSchema,
});

export const gamdlCookieDeleteResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const gamdlConnectionTestDetailsSchema = z.object({
  gamdl_available: z.boolean(),
  cookie_file_exists: z.boolean(),
  cookie_file_valid: z.boolean(),
  test_download_attempted: z.boolean(),
  test_download_success: z.boolean(),
  error_type: z.string().optional(),
});

export const gamdlConnectionTestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  details: gamdlConnectionTestDetailsSchema,
});

export const gamdlActionSchema = z.enum([
  "cookie_status",
  "delete_cookie",
  "test_connection",
  "reset_settings",
]);

export const GAMDL_ACTIONS = gamdlActionSchema.options;

export const gamdlActionRequestSchema = z.object({
  action: gamdlActionSchema,
  friend_id: z.number().int().optional().meta({ description: "Required by `reset_settings`." }),
});

/** The result depends on the action: cookie info, a deletion or reset receipt, or a connection test. */
export const gamdlActionResponseSchema = z.union([
  gamdlCookieFileInfoSchema,
  gamdlCookieDeleteResponseSchema,
  gamdlSettingsResetResponseSchema,
  gamdlConnectionTestResponseSchema,
]);

export type AiPromptSettingsQuery = z.infer<typeof aiPromptSettingsQuerySchema>;
export type AiPromptSettingsUpdate = z.input<typeof aiPromptSettingsUpdateSchema>;
export type AiPromptSettings = z.infer<typeof aiPromptSettingsSchema>;
export type AiPromptSettingsUpdateResponse = z.infer<typeof aiPromptSettingsUpdateResponseSchema>;
export type RecommendationScope = z.infer<typeof recommendationScopeSchema>;
export type RecommendationSettingsQuery = z.infer<typeof recommendationSettingsQuerySchema>;
export type RecommendationSettingsUpdate = z.infer<typeof recommendationSettingsUpdateSchema>;
export type RecommendationSettings = z.infer<typeof recommendationSettingsSchema>;
export type AppearancePaletteId = z.infer<typeof appearancePaletteSchema>;
export type AppearanceCorners = z.infer<typeof appearanceCornersSchema>;
export type AppearanceFonts = z.infer<typeof appearanceFontsSchema>;
export type AppearanceFontRole = keyof AppearanceFonts;
export type AppearanceCustomPalette = z.infer<typeof appearanceCustomPaletteSchema>;
export type AppearanceCustomColours = AppearanceCustomPalette["light"];
export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>;
export type AppearanceSettingsUpdate = z.input<typeof appearanceSettingsUpdateSchema>;
export type GamdlSettings = z.infer<typeof gamdlSettingsSchema>;
export type GamdlSettingsChanges = z.infer<typeof gamdlSettingsChangesSchema>;
export type GamdlSettingsUpdate = z.infer<typeof gamdlSettingsUpdateSchema>;
export type GamdlSettingsResponse = z.infer<typeof gamdlSettingsResponseSchema>;
export type GamdlSettingsUpdateResponse = z.infer<typeof gamdlSettingsUpdateResponseSchema>;
export type GamdlCookieFileInfo = z.infer<typeof gamdlCookieFileInfoSchema>;
export type GamdlCookieUploadResponse = z.infer<typeof gamdlCookieUploadResponseSchema>;
export type GamdlCookieDeleteResponse = z.infer<typeof gamdlCookieDeleteResponseSchema>;
export type GamdlConnectionTestDetails = z.infer<typeof gamdlConnectionTestDetailsSchema>;
export type GamdlConnectionTestResponse = z.infer<typeof gamdlConnectionTestResponseSchema>;
export type GamdlAction = z.infer<typeof gamdlActionSchema>;
export type GamdlActionRequest = z.infer<typeof gamdlActionRequestSchema>;
export type GamdlActionResponse = z.infer<typeof gamdlActionResponseSchema>;

// Request bodies publish their input shape: the AI prompt and GAMDL routes
// strip unknown fields, and the appearance body's `additionalProperties: false`
// is real (`.strict()`) and survives either way.
export const settingsJsonSchemas = {
  AiPromptSettings: z.toJSONSchema(aiPromptSettingsSchema),
  AiPromptSettingsUpdate: z.toJSONSchema(aiPromptSettingsUpdateSchema, { io: "input" }),
  AiPromptSettingsUpdateResponse: z.toJSONSchema(aiPromptSettingsUpdateResponseSchema),
  RecommendationSettings: z.toJSONSchema(recommendationSettingsSchema),
  RecommendationSettingsUpdate: z.toJSONSchema(recommendationSettingsUpdateSchema, {
    io: "input",
  }),
  AppearanceSettings: z.toJSONSchema(appearanceSettingsSchema),
  AppearanceSettingsUpdate: z.toJSONSchema(appearanceSettingsUpdateObjectSchema, { io: "input" }),
  GamdlSettings: z.toJSONSchema(gamdlSettingsSchema),
  GamdlSettingsResponse: z.toJSONSchema(gamdlSettingsResponseSchema),
  GamdlSettingsUpdate: z.toJSONSchema(gamdlSettingsUpdateSchema, { io: "input" }),
  GamdlSettingsUpdateResponse: z.toJSONSchema(gamdlSettingsUpdateResponseSchema),
  GamdlCookieFileInfo: z.toJSONSchema(gamdlCookieFileInfoSchema),
  GamdlCookieUploadResponse: z.toJSONSchema(gamdlCookieUploadResponseSchema),
  GamdlActionRequest: z.toJSONSchema(gamdlActionRequestSchema, { io: "input" }),
  GamdlActionResponse: z.toJSONSchema(gamdlActionResponseSchema),
};
