import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("../build/index.js", import.meta.url));

describe("GROOVENET_CA_CERT", { timeout: 60_000 }, () => {
  let dir;
  let api;
  let ca;
  let otherCa;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "groovenet-mcp-ca-"));
    const openssl = (...args) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
    const caSubject = ["-days", "1", "-subj", "/CN=Groovenet Test CA"];
    openssl(
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "ca.key",
      "-out",
      "ca.pem",
      ...caSubject,
    );
    openssl(
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "o.key",
      "-out",
      "other.pem",
      "-days",
      "1",
      "-subj",
      "/CN=Other CA",
    );
    openssl(
      "req",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "leaf.key",
      "-out",
      "leaf.csr",
      "-subj",
      "/CN=127.0.0.1",
    );
    writeFileSync(join(dir, "ext.cnf"), "subjectAltName=IP:127.0.0.1\n");
    openssl(
      "x509",
      "-req",
      "-in",
      "leaf.csr",
      "-CA",
      "ca.pem",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      "leaf.pem",
      "-days",
      "1",
      "-extfile",
      "ext.cnf",
    );
    ca = join(dir, "ca.pem");
    otherCa = join(dir, "other.pem");
    api = createServer(
      { key: readFileSync(join(dir, "leaf.key")), cert: readFileSync(join(dir, "leaf.pem")) },
      (req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0, query: "" }));
      },
    );
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
  });

  after(async () => {
    if (api?.listening) await new Promise((resolve) => api.close(resolve));
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function searchWith(caCert) {
    const env = {
      ...process.env,
      API_BASE: `https://127.0.0.1:${api.address().port}/api`,
      API_KEY: "",
    };
    delete env.NODE_EXTRA_CA_CERTS;
    delete env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (caCert) env.GROOVENET_CA_CERT = caCert;
    const client = new Client({ name: "ca-test", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [SERVER], env, stderr: "pipe" }),
    );
    try {
      return await client.callTool({ name: "search_artists", arguments: { query: "x" } });
    } finally {
      await client.close();
    }
  }

  it("verifies the server against the configured CA", async () => {
    const result = await searchWith(ca);
    assert.notEqual(result.isError, true, result.content[0].text);
  });

  it("still rejects the certificate without the CA", async () => {
    const result = await searchWith(undefined);
    assert.equal(result.isError, true);
  });

  it("still rejects a certificate the configured CA did not sign", async () => {
    const result = await searchWith(otherCa);
    assert.equal(result.isError, true);
  });

  it("fails at startup, naming the path, when the bundle is unreadable", () => {
    const missing = join(dir, "missing.pem");
    const run = spawnSync(process.execPath, [SERVER], {
      env: { ...process.env, API_BASE: "https://127.0.0.1:1/api", GROOVENET_CA_CERT: missing },
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, new RegExp(`Cannot read CA certificate file "${missing}"`));
  });
});
