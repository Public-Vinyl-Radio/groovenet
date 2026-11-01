import { defineCollection, z } from "astro:content";
import { file } from "astro/loaders";
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

export const collections = { roadmap };
