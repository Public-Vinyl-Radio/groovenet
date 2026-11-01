// The product screenshots the landing page shows: 2x PNGs that
// `just site-screenshots` takes with Playwright (#912) into
// src/assets/screenshots/. A slot without an `image` renders a labelled
// placeholder. The phone shots are the web app at 390px in an iPhone frame.
// A slot with an `imageDark` follows the visitor's light or dark mode.
import type { ImageMetadata } from "astro";
import enrichmentDesktopDark from "../assets/screenshots/enrichment-desktop-dark.png";
import enrichmentDesktop from "../assets/screenshots/enrichment-desktop-light.png";
import genresDesktopDark from "../assets/screenshots/genres-desktop-dark.png";
import genresDesktop from "../assets/screenshots/genres-desktop-light.png";
import homeDesktop from "../assets/screenshots/home-desktop-light.png";
import optimiserDesktopDark from "../assets/screenshots/optimiser-desktop-dark.png";
import optimiserDesktop from "../assets/screenshots/optimiser-desktop-light.png";
import nowPlayingPhoneDark from "../assets/screenshots/now-playing-phone-dark.png";
import spinsPhoneDark from "../assets/screenshots/spins-phone-dark.png";
import spinsPhoneLight from "../assets/screenshots/spins-phone-light.png";

export interface Shot {
  /** Shown on the placeholder while there is no image. */
  label: string;
  alt: string;
  image?: ImageMetadata;
  /** Shown instead of `image` when the visitor's mode is dark. */
  imageDark?: ImageMetadata;
}

export const screenshots = {
  desktopHome: {
    label: "Desktop screenshot · Home",
    alt: "GrooveNet's Home page in a desktop browser",
    image: homeDesktop,
  },
  desktopGenres: {
    label: "Desktop screenshot · Genres",
    alt: "The Genres page in a desktop browser",
    image: genresDesktop,
  },
  phoneSpins: {
    label: "iPhone screenshot · Spins",
    alt: "The Spins page on a phone, in dark mode",
    image: spinsPhoneDark,
  },
  phoneSpinsLight: {
    label: "iPhone · Spins · light",
    alt: "The Spins page on a phone, in light mode",
    image: spinsPhoneLight,
  },
  phoneNowPlayingDark: {
    label: "iPhone · Now playing · dark",
    alt: "Now playing on a phone, in dark mode",
    image: nowPlayingPhoneDark,
  },
  // Features: these follow the page's mode.
  phoneSpinsByMode: {
    label: "iPhone · Spins",
    alt: "The Spins page on a phone: a month of spins, vinyl and digital",
    image: spinsPhoneLight,
    imageDark: spinsPhoneDark,
  },
  desktopOptimiser: {
    label: "Screenshot · Optimiser",
    alt: "A playlist with its sort menu open: greedy order, genetic order and cohesive blocks",
    image: optimiserDesktop,
    imageDark: optimiserDesktopDark,
  },
  desktopGenresByMode: {
    label: "Screenshot · Genres",
    alt: "The Genres page: the collection broken down by genre",
    image: genresDesktop,
    imageDark: genresDesktopDark,
  },
  desktopEnrichment: {
    label: "Screenshot · Enrichment",
    alt: "The enrichment wizard's setup: data sources to fetch for each track",
    image: enrichmentDesktop,
    imageDark: enrichmentDesktopDark,
  },
} satisfies Record<string, Shot>;

export type ScreenshotKey = keyof typeof screenshots;
