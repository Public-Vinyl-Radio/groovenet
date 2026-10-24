// Self-hosted faces (latin-subset woff2 under ./fonts, an OFL licence per
// family alongside), loaded through next/font so they are fingerprinted and
// need no network at build time. Each face defines its own `--face-<id>`
// variable and nothing else: the theme maps a role's `--gn-font-*` variable to
// a face from the `data-font-<role>` attribute (see fontChoices.ts and
// chakraTheme.ts). Don't set a `--gn-font-*` variable here: the class next/font
// emits would tie with the attribute rules on <html> and win by stylesheet order.
//
// The default faces preload. The alternatives set `preload: false`, so a face
// nobody picked is never requested: the browser fetches a woff2 only when a
// rule applies it (the selected choice, or the Settings picker's cards).
// next/font options must be literals, so a new face is written out here;
// fonts.test.ts checks each registry face is declared with files and a licence.
import localFont from "next/font/local";

const plexSans = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--face-plex-sans",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

// A slab mono, for labels, IDs and paths.
const plexMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--face-plex-mono",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

// Display faces carry one weight: headings are semibold.
const barlowCondensed = localFont({
  src: [{ path: "./fonts/BarlowCondensed-600.woff2", weight: "600", style: "normal" }],
  variable: "--face-barlow-condensed",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

const zillaSlab = localFont({
  src: [{ path: "./fonts/ZillaSlab-600.woff2", weight: "600", style: "normal" }],
  variable: "--face-zilla-slab",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const inter = localFont({
  src: [
    { path: "./fonts/Inter-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Inter-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Inter-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--face-inter",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

const jetbrainsMono = localFont({
  src: [
    { path: "./fonts/JetBrainsMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/JetBrainsMono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/JetBrainsMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--face-jetbrains-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

/** Class names that define the `--face-*` variables; put them on <html>. */
export const fontClassName = [plexSans, plexMono, barlowCondensed, zillaSlab, inter, jetbrainsMono]
  .map((font) => font.variable)
  .join(" ");
