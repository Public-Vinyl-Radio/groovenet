import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const baseUrl = new URL("https://storybook.invalid/storybook/");

// Check the emitted manager, preview and their local dependency graph. Resolving
// URLs under /storybook/ also catches accidentally emitted root-relative assets.
export function checkStorybook(directory) {
  const pending = ["index.html", "iframe.html", "index.json"];
  const checked = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (checked.has(file)) continue;
    const content = readFileSync(resolve(directory, file), "utf8");
    if (!content.length) throw new Error(`Empty Storybook asset: ${file}`);
    checked.add(file);

    if (file === "index.json") {
      const index = JSON.parse(content);
      if (!Object.values(index.entries ?? {}).some((entry) => entry.type === "story")) {
        throw new Error("Storybook index contains no stories");
      }
    }

    const references = [];
    if (file.endsWith(".html")) {
      for (const tag of content.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
        for (const attribute of tag[0].matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
          references.push(attribute[1]);
        }
      }
      if (!references.some((reference) => /\.js(?:[?#]|$)/.test(reference))) {
        throw new Error(`Storybook page has no JavaScript assets: ${file}`);
      }
    }
    if (file.endsWith(".js")) {
      // Parse actual imports, avoiding code examples embedded in manager strings.
      // TypeScript is already a pinned build dependency; it stays out of runner.
      const source = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        false,
        ts.ScriptKind.JS,
      );
      const visit = (node) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          const specifier = node.moduleSpecifier;
          if (specifier && ts.isStringLiteralLike(specifier)) references.push(specifier.text);
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const [specifier] = node.arguments;
          if (specifier && ts.isStringLiteralLike(specifier)) references.push(specifier.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    if (file.endsWith(".html") || file.endsWith(".css")) {
      for (const match of content.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
        references.push(match[1]);
      }
    }
    for (const reference of references) {
      // Bare module imports and computed paths aren't emitted local assets.
      if (file.endsWith(".js") && !reference.startsWith(".") && !reference.startsWith("/"))
        continue;
      const url = new URL(reference, new URL(file, baseUrl));
      if (url.origin !== baseUrl.origin) continue;
      if (!url.pathname.startsWith(baseUrl.pathname)) {
        throw new Error(`Storybook asset escapes /storybook/: ${reference} in ${file}`);
      }
      pending.push(decodeURIComponent(url.pathname.slice(baseUrl.pathname.length)));
    }
  }
  return checked.size;
}

if (import.meta.main) {
  const directory =
    process.argv[2] ?? fileURLToPath(new URL("../public/storybook/", import.meta.url));
  console.log(`Storybook verified: ${checkStorybook(directory)} files in ${directory}`);
}
