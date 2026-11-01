import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLinks } from "./check-links.mjs";

test("checks routes, assets, same-origin URLs and decoded anchors", async () => {
  const root = await mkdtemp(join(tmpdir(), "groovenet-links-"));
  try {
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs/index.html"), '<h1 id="a-b">Docs</h1>');
    await writeFile(join(root, "cover.png"), "image");
    await writeFile(join(root, "index.html"), '<a href="/docs/#a%2Db">Docs</a><img src="/cover.png"><a href="https://example.com/missing">External</a>');
    assert.equal(await checkLinks(root), 2);
    await writeFile(join(root, "index.html"), '<a href="https://groovenet.publicvinylradio.com/docs/#absent">Bad anchor</a><a href="/gone/">Bad page</a><img src="/missing.png">');
    await assert.rejects(checkLinks(root), (error) => {
      assert.match(error.message, /missing anchor/);
      assert.match(error.message, /missing \/gone\//);
      assert.match(error.message, /missing \/missing.png/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
