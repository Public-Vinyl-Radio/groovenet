import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { file, glob } from "astro/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { readFile } from "node:fs/promises";

const roadmap = defineCollection({
  loader: file("src/data/roadmap.yml"),
  schema: z.object({
    label: z.string(),
    items: z.array(z.object({ title: z.string(), note: z.string() })).min(1),
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
