// The product screenshots the landing page shows: 2x PNGs that
// `just site-screenshots` takes with Playwright (#912) into
// src/assets/screenshots/. A slot without an `image` renders a labelled
// placeholder. The phone shots are the web app at 390px in an iPhone frame.
import type { ImageMetadata } from "astro";
import genresDesktop from "../assets/screenshots/genres-desktop-light.png";
import homeDesktop from "../assets/screenshots/home-desktop-light.png";
import nowPlayingPhoneDark from "../assets/screenshots/now-playing-phone-dark.png";
import spinsPhoneDark from "../assets/screenshots/spins-phone-dark.png";
import spinsPhoneLight from "../assets/screenshots/spins-phone-light.png";

export interface Shot {
  /** Shown on the placeholder while there is no image. */
  label: string;
  alt: string;
  image?: ImageMetadata;
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
} satisfies Record<string, Shot>;
