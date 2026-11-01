// Writes the marketing site's copy of the palettes and fonts (#914). Run it
// through `just site-tokens` after changing a palette or a font choice;
// src/app/siteTokens.test.ts fails until the output is committed.
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildSiteTokens,
  fontsDir,
  serializeSiteTokens,
  siteFontFiles,
  siteFontsDir,
  siteTokensPath,
} from "../src/app/siteTokens";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const tokens = buildSiteTokens();

writeFileSync(path.join(repoRoot, siteTokensPath), serializeSiteTokens(tokens));

// Replace the directory, so a face the app drops leaves the site too.
const fontsOut = path.join(repoRoot, siteFontsDir);
rmSync(fontsOut, { recursive: true, force: true });
mkdirSync(fontsOut, { recursive: true });
for (const file of siteFontFiles(tokens))
  copyFileSync(path.join(fontsDir, file), path.join(fontsOut, file));

console.log(
  `Wrote ${siteTokensPath} (${tokens.palettes.length} palettes) and ${readdirSync(fontsOut).length} files to ${siteFontsDir}.`,
);
