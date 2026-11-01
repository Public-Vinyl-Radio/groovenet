import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://groovenet.publicvinylradio.com",
  output: "static",
  integrations: [sitemap(), starlight({
    title: "GrooveNet",
    description: "The collection, the set, the next record.",
    favicon: "/favicon.png",
    customCss: ["./src/styles/docs.css"],
    components: {
      Head: "./src/components/docs/Head.astro",
      Header: "./src/components/docs/Header.astro",
      Footer: "./src/components/docs/Footer.astro",
    },
    // Starlight autogeneration matches filePath, relative to site/, not entry IDs.
    sidebar: [
      { label: "Docs", link: "/docs/" },
      { label: "Getting started", items: [{ autogenerate: { directory: "../docs/getting-started" } }] },
      { label: "Configuration", items: [{ autogenerate: { directory: "../docs/configuration" } }] },
      { label: "Using GrooveNet", items: [{ autogenerate: { directory: "../docs/using" } }] },
      { label: "Vinyl tracking", items: [{ autogenerate: { directory: "../docs/vinyl-tracking" } }] },
      { slug: "docs/cli" },
      { slug: "docs/mcp" },
      { slug: "docs/release-notes" },
    ],
  })],
});
