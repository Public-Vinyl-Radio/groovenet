import { defineCollection, z } from "astro:content";
import { file } from "astro/loaders";

const roadmap = defineCollection({
  loader: file("src/data/roadmap.yml"),
  schema: z.object({
    label: z.string(),
    items: z.array(z.object({ title: z.string(), note: z.string() })).min(1),
  }),
});

export const collections = { roadmap };
