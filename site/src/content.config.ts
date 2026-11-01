import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { file, glob } from "astro/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { readFile } from "node:fs/promises";
import type { Loader } from "astro/loaders";
import { loadRoadmap } from "./lib/roadmap.mjs";

// GitHub issue labels when they yield columns, else the committed YAML (see
// "Roadmap" in CLAUDE.md). The file loader doubles as the fallback.
function roadmapLoader(): Loader {
  const fallback = file("src/data/roadmap.yml");
  return {
    name: "roadmap",
    async load(context) {
      const columns = await loadRoadmap(async () => [], {
        log: (m: string) => context.logger.info(m.replace(/^\[roadmap\] /, "")),
        warn: (m: string) => context.logger.warn(m.replace(/^\[roadmap\] /, "")),
      });
      if (columns.length === 0) return fallback.load(context);
      context.store.clear();
      for (const col of columns) {
        const data = await context.parseData({ id: col.id, data: { label: col.label, items: col.items } });
        context.store.set({ id: col.id, data });
      }
    },
  };
}

const roadmap = defineCollection({
  loader: roadmapLoader(),
  schema: z.object({
    label: z.string(),
    items: z
      .array(z.object({ title: z.string(), note: z.string().default(""), url: z.string().optional() }))
      .min(1),
  }),
});

// IDs carry /docs so Starlight coexists with the custom marketing routes.
const markdown = glob({
  base: "../docs",
  pattern: "**/*.{md,mdx}",
  generateId: ({ entry }) => `docs/${entry.replace(/\.(md|mdx)$/, "").replace(/(^|\/)index$/, "")}`.replace(/\/$/, ""),
});
const changelog = new URL("../../CHANGELOG.md", import.meta.url);
const docs = defineCollection({
  schema: docsSchema({ extend: z.object({ description: z.string().min(1) }) }),
  loader: {
    name: "groovenet-docs",
    async load(context) {
      await markdown.load(context);
      const loadReleases = async () => {
        const id = "docs/release-notes";
        const body = (await readFile(changelog, "utf8")).replace(/^# Changelog\s*/, "");
        const data = await context.parseData({ id, data: {
          title: "Release notes",
          description: "GrooveNet releases, from the repository changelog.",
          editUrl: false,
        } });
        context.store.set({ id, data, body, filePath: "../CHANGELOG.md", rendered: await context.renderMarkdown(body) });
      };
      await loadReleases();
      context.watcher?.add(changelog.pathname);
      context.watcher?.on("change", async (path) => {
        if (path === changelog.pathname) await loadReleases();
      });
    },
  },
});

export const collections = { roadmap, docs };
