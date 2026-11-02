import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const stack = { id: 31, friend_id: 1, stack_no: 2, status: "open", items: [] };
const session = { ...stack, status: "logged" };
const summary = {
  total: 414,
  never_cleaned: 400,
  overdue: 0,
  needs_sleeve: 10,
  by_sleeve_type: {},
};
const progress = {
  cleaned: 14,
  total: 414,
  stack_size: 10,
  stacks_total: 42,
  stacks_done: 1,
  next_stack_no: 2,
  pace: { stacks_per_week: 3.5, projected_finish_date: "2027-03-01T00:00:00.000Z" },
  this_month: null,
  by_sleeve_type: {},
};

describe("care session tools over MCP stdio", { timeout: 15_000 }, () => {
  let client;
  let api;
  let openStacks;
  const requests = [];

  before(async () => {
    api = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const url = new URL(req.url, "http://x");
        requests.push({
          method: req.method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          source: req.headers["x-groovenet-client"],
          body: body ? JSON.parse(body) : undefined,
        });
        const route = `${req.method} ${url.pathname}`;
        const send = (value) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(value));
        };
        if (route === "GET /api/record-care/stacks")
          send({ items: openStacks, limit: 20, offset: 0 });
        else if (route === "POST /api/record-care/stacks") send({ stack, created: true });
        else if (route === "DELETE /api/record-care/stacks/31")
          send({ stack: { ...stack, status: "discarded" }, success: true });
        else if (route === "POST /api/record-care/sessions")
          send({ session, actions: [], copies: [] });
        else if (route === "POST /api/record-care/sessions/31/void")
          send({ session: stack, actions: [], copies: [], success: true });
        else if (route === "GET /api/record-care/sessions") send({ items: [], total: 0 });
        else if (route === "GET /api/record-care/queue") send({ backlog: { items: [] } });
        else if (route === "GET /api/record-copies/care/summary") send(summary);
        else if (route === "GET /api/record-care/progress") send(progress);
        else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "not found" }));
        }
      });
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "care-sessions-test", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL("../build/index.js", import.meta.url))],
        env: {
          ...process.env,
          API_BASE: `http://127.0.0.1:${api.address().port}/api`,
          API_KEY: "",
          DEFAULT_FRIEND_ID: "1",
        },
        stderr: "pipe",
      }),
    );
  });

  after(async () => {
    await client?.close();
    if (api?.listening)
      await new Promise((resolve, reject) => api.close((err) => (err ? reject(err) : resolve())));
  });

  beforeEach(() => {
    requests.length = 0;
    openStacks = [stack];
  });

  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    return { ...result, data: result.isError ? undefined : JSON.parse(result.content[0].text) };
  };
  const lastBody = () => requests.at(-1).body;

  it("tells an agent when to use the session tool", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const name of [
      "log_care_session",
      "get_care_queue",
      "pull_care_stack",
      "discard_care_stack",
      "list_care_sessions",
      "void_care_session",
    ])
      assert.ok(names.includes(name), name);
    const session = tools.find((t) => t.name === "log_care_session");
    assert.match(session.description, /log_record_action/);
    assert.deepEqual(session.inputSchema.required, ["action_types"]);
  });

  it("logs a stack by its number with source mcp", async () => {
    const { data } = await call("log_care_session", {
      stack: 2,
      action_types: ["cleaned", "sleeved"],
      sleeve_type: "poly",
      method: "vacuum",
      notes: "done",
      occurred_at: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(data.session.id, 31);
    assert.deepEqual(requests[0].query, {
      friend_id: "1",
      status: "open",
      limit: "20",
      offset: "0",
    });
    assert.deepEqual(lastBody(), {
      friend_id: 1,
      stack_id: 31,
      action_types: ["cleaned", "sleeved"],
      source: "mcp",
      occurred_at: "2026-10-01T00:00:00.000Z",
      notes: "done",
      sleeve_type: "poly",
      details: { method: "vacuum" },
    });
    assert.equal(requests.at(-1).source, "mcp");
  });

  it("logs an explicit copies list without resolving a stack", async () => {
    const copies = [{ copy_id: 7 }, { release_id: "123" }];
    await call("log_care_session", { copies, action_types: ["inspected"], friend_id: 4 });
    assert.equal(requests.length, 1);
    assert.deepEqual(lastBody(), {
      friend_id: 4,
      copies,
      action_types: ["inspected"],
      source: "mcp",
    });
  });

  it("rejects both or neither of stack and copies, and unknown stacks", async () => {
    const both = await call("log_care_session", {
      stack: 2,
      copies: [{ copy_id: 7 }],
      action_types: ["cleaned"],
    });
    assert.ok(both.isError);
    assert.match(both.content[0].text, /exactly one of stack or copies/);
    const neither = await call("log_care_session", { action_types: ["cleaned"] });
    assert.ok(neither.isError);
    const wrong = await call("log_care_session", { stack: 5, action_types: ["cleaned"] });
    assert.match(wrong.content[0].text, /the open stack is 2/);
    openStacks = [];
    const none = await call("log_care_session", { stack: 5, action_types: ["cleaned"] });
    assert.match(none.content[0].text, /call pull_care_stack first/);
    assert.ok(requests.every((r) => r.method === "GET"));
  });

  it("gets the queue, pulls a stack and lists sessions", async () => {
    await call("get_care_queue", { limit: 5, offset: 10 });
    assert.deepEqual(requests.at(-1).query, { friend_id: "1", limit: "5", offset: "10" });
    const pulled = await call("pull_care_stack", { size: 5 });
    assert.equal(pulled.data.created, true);
    assert.deepEqual(lastBody(), { friend_id: 1, size: 5, source: "mcp" });
    await call("pull_care_stack", {});
    assert.deepEqual(lastBody(), { friend_id: 1, source: "mcp" });
    await call("list_care_sessions", { limit: 3 });
    assert.deepEqual(requests.at(-1).query, { friend_id: "1", limit: "3", offset: "0" });
  });

  it("discards the open stack, or fails when none is open", async () => {
    const done = await call("discard_care_stack", {});
    assert.equal(done.data.status, "discarded");
    assert.equal(requests.at(-1).method, "DELETE");
    requests.length = 0;
    openStacks = [];
    const none = await call("discard_care_stack", {});
    assert.ok(none.isError);
    assert.match(none.content[0].text, /No open stack to discard/);
    assert.equal(requests.length, 1);
  });

  it("voids a session", async () => {
    await call("void_care_session", { session_id: 31 });
    assert.equal(requests.at(-1).path, "/api/record-care/sessions/31/void");
    assert.deepEqual(lastBody(), { friend_id: 1 });
  });

  it("adds progress and pace to the care summary", async () => {
    const { data } = await call("get_record_care_summary", {});
    assert.equal(data.never_cleaned, 400);
    assert.equal(data.progress.cleaned, 14);
    assert.equal(data.progress.next_stack_no, 2);
    assert.equal(data.progress.pace, undefined);
    assert.equal(data.pace.stacks_per_week, 3.5);
  });
});
