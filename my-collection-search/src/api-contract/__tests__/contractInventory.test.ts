import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  albumJsonSchemas,
  friendJsonSchemas,
  liveSetJsonSchemas,
  playlistJsonSchemas,
  recordCareJsonSchemas,
  spinJsonSchemas,
  playerJsonSchemas,
  trackJsonSchemas,
} from "@groovenet/contracts";
import { getOpenApiDocument } from "../openapi";

// The checked-in inventory of every OpenAPI operation and where its contract
// lives (#552). Kept beside the contracts package it describes.
const INVENTORY_PATH = path.join(
  process.cwd(),
  "..",
  "packages",
  "groovenet-contracts",
  "INVENTORY.md"
);

const STATUSES = ["contracts", "#550", "#551", "#552", "exception"] as const;
type Status = (typeof STATUSES)[number];

type InventoryRow = {
  key: string;
  family: string;
  status: Status;
  notes: string;
};

const ROW = /^\| (GET|POST|PUT|PATCH|DELETE|HEAD) \| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]*) \|$/;

function parseInventory(markdown: string): InventoryRow[] {
  const rows: InventoryRow[] = [];
  for (const line of markdown.split("\n")) {
    const match = ROW.exec(line.trim());
    if (!match) continue;
    const [, method, routePath, family, status, notes] = match;
    rows.push({
      key: `${method.toLowerCase()} ${routePath}`,
      family: family.trim(),
      status: status.trim() as Status,
      notes: notes.trim(),
    });
  }
  return rows;
}

const SHARED_COMPONENTS = new Set(
  Object.keys({
    ...liveSetJsonSchemas,
    ...playlistJsonSchemas,
    ...trackJsonSchemas,
    ...albumJsonSchemas,
    ...friendJsonSchemas,
    ...recordCareJsonSchemas,
    ...spinJsonSchemas,
    ...playerJsonSchemas,
  })
);

function operations(): Map<string, unknown> {
  const doc = getOpenApiDocument();
  const ops = new Map<string, unknown>();
  for (const [routePath, item] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(item)) {
      ops.set(`${method} ${routePath}`, op);
    }
  }
  return ops;
}

function sharedRefs(op: unknown): string[] {
  const refs = JSON.stringify(op).matchAll(/#\/components\/schemas\/(\w+)/g);
  return [...refs].map((m) => m[1]).filter((name) => SHARED_COMPONENTS.has(name));
}

describe("API contract inventory", () => {
  const rows = parseInventory(fs.readFileSync(INVENTORY_PATH, "utf8"));
  const ops = operations();

  it("parses rows with known statuses and no duplicates", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(STATUSES, row.key).toContain(row.status);
    const keys = rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("accounts for every OpenAPI operation, and only those", () => {
    const listed = new Set(rows.map((row) => row.key));
    const published = [...ops.keys()];
    expect(published.filter((key) => !listed.has(key)), "missing from INVENTORY.md").toEqual([]);
    expect([...listed].filter((key) => !ops.has(key)), "stale rows in INVENTORY.md").toEqual([]);
  });

  it("gives every exception a reason", () => {
    for (const row of rows.filter((r) => r.status === "exception")) {
      expect(row.notes, row.key).not.toBe("");
    }
  });

  it("marks an operation as migrated only when it references a shared component", () => {
    for (const row of rows.filter((r) => r.status === "contracts")) {
      expect(sharedRefs(ops.get(row.key)), row.key).not.toEqual([]);
    }
  });
});
