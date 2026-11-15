/**
 * Imports the app's own pure TypeScript modules (#1196), so this harness
 * measures with `orderingMetrics.ts` and `mixCompat.ts` rather than copies.
 * Node 26 strips the types; this hook maps the app's `@/` alias onto
 * `my-collection-search/src` and adds the `.ts` extension the app omits.
 * Only modules whose runtime imports are themselves pure work this way.
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP_SRC = fileURLToPath(new URL("../../my-collection-search/src/", import.meta.url));

/** The file a specifier names, or null when the default resolver should handle it. */
export function resolveAppSpecifier(specifier, parentURL) {
  let base = null;
  if (specifier.startsWith("@/")) base = APP_SRC + specifier.slice(2);
  else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    parentURL?.startsWith(pathToFileURL(APP_SRC).href)
  )
    base = fileURLToPath(new URL(specifier, parentURL));
  if (base === null) return null;
  const candidates = /\.[cm]?ts$/.test(base) ? [base] : [`${base}.ts`, `${base}/index.ts`];
  const found = candidates.find((candidate) => existsSync(candidate));
  return found ? pathToFileURL(found).href : null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = resolveAppSpecifier(specifier, context.parentURL);
    return url
      ? { url, shortCircuit: true, format: "module-typescript" }
      : nextResolve(specifier, context);
  },
});

const metrics = await import("@/lib/ranking/orderingMetrics");
const mix = await import("@/lib/mixCompat");

export const { bpmJumpTotal, keyClashCount, vibeDistanceTotal, orderingMetrics } = metrics;
export const { parseBpm, camelotOf, describeMix } = mix;
