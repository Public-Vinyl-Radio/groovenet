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

const spaceGrotesk = localFont({
  src: [
    { path: "./fonts/SpaceGrotesk-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/SpaceGrotesk-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/SpaceGrotesk-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--face-space-grotesk",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

// Proportional (Charon Mono is its fixed-width sibling). Ships 400, 500 and 700: a
// 600 request takes the real 700 cut, never a synthesised one.
const iosevkaCharon = localFont({
  src: [
    { path: "./fonts/IosevkaCharon-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IosevkaCharon-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IosevkaCharon-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--face-iosevka-charon",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

// Only 400 and 700 exist. The browser picks the nearest real cut for a request:
// 500 takes 400 and 600 takes 700, so there is no faux bold.
const spaceMono = localFont({
  src: [
    { path: "./fonts/SpaceMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/SpaceMono-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--face-space-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

// The standard (not Term or Aile) Iosevka.
const iosevka = localFont({
  src: [
    { path: "./fonts/Iosevka-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Iosevka-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Iosevka-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--face-iosevka",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

// Ships 400, 500 and 700 (no 600 exists): 600 takes the real 700 cut.
const iosevkaCharonMono = localFont({
  src: [
    { path: "./fonts/IosevkaCharonMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IosevkaCharonMono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IosevkaCharonMono-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--face-iosevka-charon-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

// Variable source, instanced at normal width for each weight.
const martianMono = localFont({
  src: [
    { path: "./fonts/MartianMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/MartianMono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/MartianMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--face-martian-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

// The slab-serif Monaspace.
const monaspaceXenon = localFont({
  src: [
    { path: "./fonts/MonaspaceXenon-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/MonaspaceXenon-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/MonaspaceXenon-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--face-monaspace-xenon",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

const commitMono = localFont({
  src: [
    { path: "./fonts/CommitMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/CommitMono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/CommitMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--face-commit-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

// Only 400 and 700 exist: 500 takes 400, 600 takes 700 (no faux bold).
const courierPrime = localFont({
  src: [
    { path: "./fonts/CourierPrime-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/CourierPrime-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--face-courier-prime",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

// Ships 300, 400 and 500 (no 600 or 700): we keep 400 and 500, so a heavier
// request takes the real 500 cut and is never synthesised bold.
const dmMono = localFont({
  src: [
    { path: "./fonts/DMMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/DMMono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--face-dm-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

/** Class names that define the `--face-*` variables; put them on <html>. */
export const fontClassName = [
  plexSans,
  plexMono,
  barlowCondensed,
  zillaSlab,
  inter,
  jetbrainsMono,
  spaceGrotesk,
  iosevkaCharon,
  spaceMono,
  iosevka,
  iosevkaCharonMono,
  martianMono,
  monaspaceXenon,
  commitMono,
  courierPrime,
  dmMono,
]
  .map((font) => font.variable)
  .join(" ");
