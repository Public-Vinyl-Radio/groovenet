// Pairs a `-light.png` screenshot with its `-dark.png` sibling (#939).
//
// Docs stay plain Markdown, `![alt](…/x-light.png)`, so they read on GitHub.
// When the dark file exists, a second image node follows the first, and
// docs.css shows whichever matches Starlight's `:root[data-theme]`. Both stay
// ordinary mdast images, so Astro still optimises them (srcset and all). Both
// carry the alt text: which one is visible depends on the theme, and the other
// is `display: none`, so it is out of the accessibility tree and the zoom
// caption is right in either theme.
//
// A Sätteri mdast plugin (Astro 7's default Markdown processor), not remark.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIGHT = /-light\.png$/;
const NOT_RELATIVE = /^(?:[a-z][a-z\d+.-]*:|\/|#)/i;

const isLight = (url) => typeof url === "string" && !NOT_RELATIVE.test(url) && LIGHT.test(url);
const darkUrl = (url) => url.replace(LIGHT, "-dark.png");
// Astro's markdown images get no srcset by default. These reach getImage as
// props: up to 1520px (2x of the 760px a docs column shows), with the full-size
// file as the fallback `src`, which is what the zoom clones. Set in the hast
// step: an array doesn't survive an mdast `hProperties`.
export const RESPONSIVE = { widths: [640, 960, 1280, 1520], sizes: "(max-width: 800px) 100vw, 784px" };
const withProps = (data, properties) => ({
  ...data,
  hProperties: { ...data?.hProperties, ...properties },
});

export function themeScreenshots({ exists = existsSync } = {}) {
  return {
    name: "theme-screenshots",
    image(node, ctx) {
      if (!isLight(node.url)) return;
      const dark = darkUrl(node.url);
      const base = ctx.fileURL ? path.dirname(fileURLToPath(ctx.fileURL)) : process.cwd();
      if (!exists(path.resolve(base, dark))) return;
      ctx.setProperty(node, "data", withProps(node.data, { class: "shot shot-light" }));
      ctx.insertAfter(node, {
        type: "image",
        url: dark,
        alt: node.alt,
        title: null,
        data: withProps(undefined, { class: "shot shot-dark" }),
      });
      // Astro's image collector may not visit a node inserted mid-walk.
      ctx.data.astro?.localImagePaths.add(dark);
    },
  };
}

// A hast step, because Astro's image marker (which runs after user plugins)
// only keeps the properties it finds on the node.
export function responsiveThemeShots() {
  return {
    name: "responsive-theme-shots",
    element: {
      filter: ["img"],
      visit(node, ctx) {
        const classes = [node.properties?.className].flat().join(" ");
        if (!/\bshot\b/.test(classes)) return;
        for (const [key, value] of Object.entries(RESPONSIVE)) ctx.setProperty(node, key, value);
      },
    },
  };
}
