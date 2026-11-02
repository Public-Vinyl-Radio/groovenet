// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Raw Chakra scales and literal white/black: fixed whatever the palette or mode.
const COLOUR_PROPS =
  "/^(color|bg|background|backgroundColor|borderColor|border[A-Z][a-z]+Color|outlineColor|fill|stroke)$/";
const RAW_COLOUR =
  "/^((gray|red|blue|green|orange|purple|yellow|cyan|teal|pink)\\.[0-9]{2,3}|(white|black)(Alpha\\.[0-9]+)?)$/";
const RAW_PALETTE = "/^(gray|red|blue|green|orange|purple|yellow|cyan|teal|pink)$/";

const SYNTAX_RULES = [
  {
    // Chakra v3 ignores colorScheme (renamed to colorPalette); catch it before it ships (#482).
    selector: "JSXAttribute[name.name='colorScheme']",
    message: "Chakra v3 has no `colorScheme` prop; use `colorPalette` instead.",
  },
  {
    // Palettes can only recolour what reads a semantic token (#666).
    selector: `JSXAttribute[name.name=${COLOUR_PROPS}] Literal[value=${RAW_COLOUR}]`,
    message:
      "Use a semantic token (fg.muted, bg.subtle, accent.fg, status.*…), not a raw palette colour.",
  },
  {
    selector: `Property[key.name=${COLOUR_PROPS}] > Literal[value=${RAW_COLOUR}]`,
    message:
      "Use a semantic token (fg.muted, bg.subtle, accent.fg, status.*…), not a raw palette colour.",
  },
  {
    selector: `JSXAttribute[name.name='colorPalette'] Literal[value=${RAW_PALETTE}]`,
    message: "Use colorPalette accent, neutral, danger or status.*, not a raw palette.",
  },
];

// Badges, chips and tags have six roles (#963), rendered by the components in
// src/components/ui: StatusTag, CategoryTag, MetaTag, SourceTag, CountTag and
// FilterChip. Chakra's Badge and Tag, and tags drawn by hand, bring back the
// eighteen looks the roles replaced.
const BADGE_MESSAGE =
  "Use a badge role from @/components/ui/RoleTags (StatusTag, CategoryTag, MetaTag, SourceTag, CountTag) or @/components/ui/FilterChip (#963).";
const BADGE_PATHS = [
  {
    name: "@chakra-ui/react",
    importNames: ["Badge", "BadgeProps", "Tag", "TagRootProps", "TagLabelProps"],
    message: BADGE_MESSAGE,
  },
];
const BADGE_SYNTAX_RULES = [
  {
    // A hand-built tag: text in a ring at a tag's height (16 to 24px). A
    // keyboard hint (`as="kbd"`) is not a tag.
    selector: [
      "JSXOpeningElement",
      ":has(> JSXAttribute[name.name=/^(h|height)$/]:has(Literal[value=/^(1[6-9]|2[0-4])px$/]))",
      ":has(> JSXAttribute[name.name=/^border(Width)?$/])",
      ":has(> JSXAttribute[name.name='fontSize'])",
      ":not(:has(> JSXAttribute[name.name='as'][value.value='kbd']))",
    ].join(""),
    message: BADGE_MESSAGE,
  },
];

const ANALYTICS_MESSAGE = "Use @/lib/analytics/client or @/lib/analytics/server instead.";
const ANALYTICS_PATHS = ["posthog-js", "posthog-node"].map((name) => ({
  name,
  message: ANALYTICS_MESSAGE,
}));
const ANALYTICS_PATTERNS = [
  { group: ["posthog-js/*", "posthog-node/*"], message: ANALYTICS_MESSAGE },
];

// Files that predate the roles; PR 2 of #963 migrates each one and removes the list.
// Route segments are escaped: `[id]` is a glob character class.
const LEGACY_BADGE_FILES = [
  "src/app/albums/\\[releaseId\\]/page.tsx",
  "src/app/albums/artwork/page.tsx",
  "src/app/genres/\\[slug\\]/page.tsx",
  "src/app/jobs/page.tsx",
  "src/app/tracks/\\[id\\]/edit/page.tsx",
  "src/app/vinyl/VinylPipelineView.tsx",
  "src/components/AlbumArtworkDialog.tsx",
  "src/components/AlbumResult.tsx",
  "src/components/AlbumSearchMenu.tsx",
  "src/components/GenreBadge.tsx",
  "src/components/GenrePicker.tsx",
  "src/components/PlaylistRecommendations.tsx",
  "src/components/PlaylistStatsPanel.tsx",
  "src/components/PlaylistViewer.tsx",
  "src/components/RelatedTrackRows.tsx",
  "src/components/SimilarTracks.tsx",
  "src/components/SimilarVibeTracks.tsx",
  "src/components/TrackPlaylistUsage.tsx",
  "src/components/TrackResult.tsx",
  "src/components/TrackSearchMenu.tsx",
  "src/components/chores/ChoreGroup.tsx",
  "src/components/chores/ChoresCareLog.tsx",
  "src/components/enrichment/EnrichmentTrackStep.tsx",
  "src/components/enrichment/EnrichmentWizard.tsx",
  "src/components/genres/GenreLinkList.tsx",
  "src/components/home/NewArrivals.tsx",
  "src/components/home/NowPlayingCard.tsx",
  "src/components/jobs/EmbeddingQueueSection.tsx",
  "src/components/records/RecordCopyCard.tsx",
  "src/components/settings/AboutSection.tsx",
  "src/components/settings/BackupStatusSection.tsx",
  "src/components/settings/CustomPaletteEditor.tsx",
  "src/components/settings/FriendsDiscogsSection.tsx",
  "src/components/settings/GamdlCookieManager.tsx",
  "src/components/settings/GamdlTestConnection.tsx",
  "src/components/spins/AlbumSpinPanel.tsx",
  "src/components/spins/SpinFormDialog.tsx",
  "src/components/spins/SpinRecapCharts.tsx",
  "src/components/spins/SpinRow.tsx",
  "src/components/spins/listeningLogParts.tsx",
  "src/components/track-detail/AudioMetadataSection.tsx",
  "src/components/track-detail/AudioVibeEmbeddingSection.tsx",
  "src/components/track-detail/ContextEmbeddingSection.tsx",
  "src/components/track-detail/EssentiaSection.tsx",
  "src/components/track-detail/IdentityEmbeddingSection.tsx",
  "src/components/track-detail/TrackGenresSection.tsx",
  "src/components/track-detail/TrackHeader.tsx",
  "src/components/track-detail/TrackPlaylistsSection.tsx",
  "src/components/track-edit/TrackEditFormFields.tsx",
  "src/stories/AuditBadges.stories.tsx",
];

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Existing codebase has broad `any` usage and migration debt.
      "@typescript-eslint/no-explicit-any": "off",
      // New React hook safety rules are useful but too disruptive as an immediate baseline.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      // `const { field, ...rest } = obj` to omit a field is an established
      // pattern here (e.g. dropping local_tags before returning a track);
      // the unused destructured sibling isn't a real unused variable.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
      "no-restricted-syntax": ["error", ...SYNTAX_RULES, ...BADGE_SYNTAX_RULES],
    },
  },
  {
    // Analytics goes through src/lib/analytics (#338); only its providers may
    // talk to a vendor SDK.
    ignores: ["src/lib/analytics/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...ANALYTICS_PATHS, ...BADGE_PATHS], patterns: ANALYTICS_PATTERNS },
      ],
    },
  },
  {
    // Not yet on the badge roles: PR 2 of #963 migrates these and deletes the list.
    files: LEGACY_BADGE_FILES,
    rules: {
      "no-restricted-syntax": ["error", ...SYNTAX_RULES],
      "no-restricted-imports": ["error", { paths: ANALYTICS_PATHS, patterns: ANALYTICS_PATTERNS }],
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "public/storybook/**",
      "tmp/**",
      "*.min.js",
    ],
  },
  ...storybook.configs["flat/recommended"],
  // Last, so Prettier owns layout.
  prettier,
];

export default eslintConfig;
