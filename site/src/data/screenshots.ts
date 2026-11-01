// The product screenshots the landing page shows. #912 generates them with
// Playwright into src/assets/screenshots/; to use one, import the PNG and set
// it as that entry's `image`. Until then each slot renders a labelled
// placeholder. The phone shots are the web app at 390px in an iPhone frame.
import type { ImageMetadata } from "astro";

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
  },
  desktopGenres: {
    label: "Desktop screenshot · Genres",
    alt: "The Genres page in a desktop browser",
  },
  phoneSpins: {
    label: "iPhone screenshot · Spins",
    alt: "The Spins page on a phone",
  },
  phoneSpinsLight: {
    label: "iPhone · Spins · light",
    alt: "The Spins page on a phone, in light mode",
  },
  phoneNowPlayingDark: {
    label: "iPhone · Now playing · dark",
    alt: "Now playing on a phone, in dark mode",
  },
} satisfies Record<string, Shot>;
