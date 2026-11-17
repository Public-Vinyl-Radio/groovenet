/**
 * A proposed config for `run.mjs --config name=file.json` (#1196): either a
 * bare `RankingConfig` or an exported `groovenet-ranking-profile` file, read
 * with the contracts package's own parsers so a proposal is exactly what the
 * app would accept.
 */
import {
  parseRankingProfileFile,
  RANKING_SCHEMA_VERSION,
  rankingConfigSchema,
} from "@groovenet/contracts";

export function rankingConfigFor(json, id) {
  if (json?.format === "groovenet-ranking-profile") {
    const { file } = parseRankingProfileFile(json);
    const { weights, base, usePrior, constraints } = file;
    return rankingConfigSchema.parse({
      version: RANKING_SCHEMA_VERSION,
      id,
      weights,
      ...(base ? { base } : {}),
      usePrior,
      constraints,
    });
  }
  // A bare v1 config (the #1196 proposals) is read on today's scale, as a
  // v1 file is imported (#1218): weights kept, version moved on.
  const version = json?.version === 1 ? RANKING_SCHEMA_VERSION : json?.version;
  return rankingConfigSchema.parse({ ...json, version, id });
}
