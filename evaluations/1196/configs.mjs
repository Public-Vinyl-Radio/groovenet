/**
 * A proposed config for `run.mjs --config name=file.json` (#1196): either a
 * bare `RankingConfig` or an exported `groovenet-ranking-profile` file, read
 * with the contracts package's own parsers so a proposal is exactly what the
 * app would accept.
 */
import { parseRankingProfileFile, rankingConfigSchema } from "@groovenet/contracts";

export function rankingConfigFor(json, id) {
  if (json?.format === "groovenet-ranking-profile") {
    const { file } = parseRankingProfileFile(json);
    const { weights, base, usePrior, constraints } = file;
    return rankingConfigSchema.parse({
      version: 1,
      id,
      weights,
      ...(base ? { base } : {}),
      usePrior,
      constraints,
    });
  }
  return rankingConfigSchema.parse({ ...json, id });
}
