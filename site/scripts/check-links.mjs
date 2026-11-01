import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";

const origin = "https://groovenet.publicvinylradio.com";

/** Check rendered HTML so Markdown, component and generated-page links agree. */
export async function checkLinks(directory) {
  const root = resolve(directory);
  const pages = new Map();
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (entry.name.endsWith(".html")) {
        const ids = new Set();
        const links = [];
        function visit(node) {
          for (const attr of node.attrs ?? []) {
            if (attr.name === "id") ids.add(attr.value);
            if ((attr.name === "href" && (node.tagName === "a" ||
                (node.tagName === "link" && node.attrs.some((a) => a.name === "rel" && a.value === "stylesheet")))) ||
                (attr.name === "src" && ["img", "script"].includes(node.tagName))) links.push(attr.value);
          }
          for (const child of node.childNodes ?? []) visit(child);
        }
        visit(parse(await readFile(path, "utf8")));
        pages.set(path, { ids, links });
      }
    }
  }
  await scan(root);
  const errors = [];
  for (const [path, { links }] of pages) {
    const route = "/" + relative(root, path).replace(/index\.html$/, "");
    for (const href of links) {
      const url = new URL(href, origin + route);
      if (url.origin !== origin) continue;
      let target = resolve(root, "." + decodeURIComponent(url.pathname));
      if (relative(root, target).startsWith("..")) {
        errors.push(`${route}: ${href} escapes the build directory`);
        continue;
      }
      try {
        if ((await stat(target)).isDirectory()) target = join(target, "index.html");
        await stat(target);
      } catch {
        errors.push(`${route}: missing ${href}`);
        continue;
      }
      if (url.hash && pages.has(target) && !pages.get(target).ids.has(decodeURIComponent(url.hash.slice(1)))) {
        errors.push(`${route}: missing anchor ${href}`);
      }
    }
  }
  if (errors.length) throw new Error(`Broken site links:\n${errors.join("\n")}`);
  return pages.size;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const count = await checkLinks(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "../dist"));
  console.log(`Checked internal links and anchors in ${count} pages.`);
}
