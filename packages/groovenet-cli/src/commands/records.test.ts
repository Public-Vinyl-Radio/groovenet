import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());
vi.mock("@groovenet/client", () => ({ loadConfig, GroovenetClient: GroovenetClientMock }));

import { addRecordsCommands } from "./records.js";

const copy = { id: 7, release_id: "123", label: "DJ copy", is_default: true, inner_sleeve_type: null, last_cleaned_at: null };
const action = { id: 9, copy_id: 7, action_type: "cleaned", occurred_at: "2026-09-01T00:00:00.000Z", notes: null, sleeve_type: null, details: {}, voided_at: null };
const api = {
  logRecordAction: vi.fn(), listRecordCopies: vi.fn(), createRecordCopy: vi.fn(),
  updateDefaultRecordCopy: vi.fn(), updateRecordCopy: vi.fn(), deleteRecordCopy: vi.fn(),
  listRecordActions: vi.fn(), voidRecordAction: vi.fn(), listRecordCare: vi.fn(), getRecordCareSummary: vi.fn(),
};

async function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  addRecordsCommands(program);
  await program.parseAsync(["node", "groovenet", "records", ...args]);
}

describe("records commands", () => {
  let output: string[];
  let raw: string[];
  beforeEach(() => {
    output = [];
    raw = [];
    loadConfig.mockReturnValue({ api_base: "http://localhost/api", default_friend_id: 2 });
    for (const mock of Object.values(api)) mock.mockReset();
    api.logRecordAction.mockResolvedValue({ action, copy });
    api.listRecordCopies.mockResolvedValue([copy]);
    api.createRecordCopy.mockResolvedValue(copy);
    api.updateDefaultRecordCopy.mockResolvedValue(copy);
    api.updateRecordCopy.mockResolvedValue(copy);
    api.deleteRecordCopy.mockResolvedValue(copy);
    api.listRecordActions.mockResolvedValue({ items: [action], limit: 50, offset: 0 });
    api.voidRecordAction.mockResolvedValue({ action, copy });
    api.listRecordCare.mockResolvedValue({ items: [{ ...copy, copy_id: 7, album_title: "Album", album_artist: "Artist" }], total: 1 });
    api.getRecordCareSummary.mockResolvedValue({ total: 1, never_cleaned: 1, overdue: 0, needs_sleeve: 1, by_sleeve_type: { unknown: 1 } });
    GroovenetClientMock.mockImplementation(function () { return api; });
    vi.spyOn(console, "log").mockImplementation((value: unknown) => { output.push(String(value)); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(((value: string) => { raw.push(String(value)); return true; }) as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });

  it("logs cleaning on a release with a backdated method and notes", async () => {
    await parse("clean", "123", "--at", "2026-09-01", "--method", "ultrasonic", "--note", "dusty", "--json");
    expect(api.logRecordAction).toHaveBeenCalledWith({
      friend_id: 2, release_id: "123", action_type: "cleaned",
      occurred_at: "2026-09-01T00:00:00.000Z", notes: "dusty", details: { method: "ultrasonic" },
    });
    expect(JSON.parse(raw.join(""))).toEqual({ action, copy });
  });

  it("rejects an invalid care date before sending a request", async () => {
    await expect(parse("clean", "123", "--at", "not-a-date")).rejects.toThrow();
    expect(api.logRecordAction).not.toHaveBeenCalled();
  });

  it("prints ordinary and JSON confirmations for care actions", async () => {
    await parse("clean", "123");
    expect(output.join("\n")).toContain("Cleaned 123 (copy 7, action 9)");
    await parse("sleeve", "123", "paper", "--json");
    expect(JSON.parse(raw.join(""))).toEqual({ action, copy });
    raw.length = 0;
    await parse("log", "123", "inspected", "--json");
    expect(JSON.parse(raw.join(""))).toEqual({ action, copy });
  });

  it("logs sleeve and repair against a specified copy", async () => {
    await parse("sleeve", "123", "poly-rice-paper-poly", "--copy", "7", "--friend-id", "4");
    expect(api.listRecordCopies).toHaveBeenCalledWith(4, "123");
    expect(api.logRecordAction).toHaveBeenCalledWith({ friend_id: 4, copy_id: 7, action_type: "sleeved", sleeve_type: "poly-rice-paper-poly" });
    await parse("log", "123", "repaired", "--note", "hinge fixed");
    expect(api.logRecordAction).toHaveBeenLastCalledWith({ friend_id: 2, release_id: "123", action_type: "repaired", notes: "hinge fixed" });
  });

  it("refuses to log an action against a copy on another release", async () => {
    api.listRecordCopies.mockResolvedValueOnce([]);
    await parse("clean", "123", "--copy", "7");
    expect(api.logRecordAction).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("manages copies, including an implicit default", async () => {
    await parse("copies", "123");
    expect(api.listRecordCopies).toHaveBeenCalledWith(2, "123");
    await parse("copies", "add", "123", "--label", "Backup");
    expect(api.createRecordCopy).toHaveBeenCalledWith({ friend_id: 2, release_id: "123", label: "Backup", notes: undefined });
    await parse("copies", "label", "123", "Main");
    expect(api.updateDefaultRecordCopy).toHaveBeenCalledWith({ friend_id: 2, release_id: "123", label: "Main" });
    await parse("copies", "label", "123", "Spare", "--copy", "7");
    expect(api.listRecordCopies).toHaveBeenLastCalledWith(2, "123");
    expect(api.updateRecordCopy).toHaveBeenCalledWith(7, { friend_id: 2, label: "Spare" });
    await parse("copies", "remove", "7");
    expect(api.deleteRecordCopy).toHaveBeenCalledWith(7, 2);
  });

  it("shows an implicit copy and an empty copy list clearly", async () => {
    api.listRecordCopies.mockResolvedValueOnce([{ ...copy, id: null, label: null, inner_sleeve_type: null, last_cleaned_at: null }]);
    await parse("copies", "123");
    expect(output.join("\n")).toContain("Default");
    api.listRecordCopies.mockResolvedValueOnce([]);
    await parse("copies", "123");
    expect(output.at(-1)).toBe("No records found.");
    output.length = 0;
    await parse("copies");
    expect(process.exitCode).toBe(1);
    expect(api.listRecordCopies).toHaveBeenCalledTimes(2);
  });

  it("prints raw API responses for copy changes", async () => {
    await parse("copies", "add", "123", "--note", "backup", "--friend-id", "4", "--json");
    expect(api.createRecordCopy).toHaveBeenCalledWith({ friend_id: 4, release_id: "123", label: undefined, notes: "backup" });
    expect(JSON.parse(raw.join(""))).toEqual(copy);
    raw.length = 0;
    await parse("copies", "label", "123", "Main", "--json");
    expect(JSON.parse(raw.join(""))).toEqual(copy);
    raw.length = 0;
    await parse("copies", "remove", "7", "--json");
    expect(JSON.parse(raw.join(""))).toEqual(copy);
  });

  it("does not label a copy on a different release", async () => {
    api.listRecordCopies.mockResolvedValueOnce([]);
    await parse("copies", "label", "123", "Wrong", "--copy", "7");
    expect(api.updateRecordCopy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("lists history including voided actions, and voids a mistake", async () => {
    await parse("history", "7", "--include-voided", "--limit", "10", "--offset", "5");
    expect(api.listRecordActions).toHaveBeenCalledWith(7, { friend_id: 2, include_voided: true, limit: 10, offset: 5 });
    await parse("void", "9");
    expect(api.voidRecordAction).toHaveBeenCalledWith(9, 2);
  });

  it("exposes action details and raw history for scripts", async () => {
    const sleeved = { ...action, sleeve_type: "poly", notes: "fresh", voided_at: "2026-09-02T00:00:00.000Z" };
    api.listRecordActions.mockResolvedValueOnce({ items: [sleeved], limit: 50, offset: 0 });
    await parse("history", "7");
    expect(output.join("\n")).toContain("fresh");
    await parse("history", "7", "--json");
    expect(JSON.parse(raw.join(""))).toMatchObject({ items: [action] });
    raw.length = 0;
    await parse("void", "9", "--json");
    expect(JSON.parse(raw.join(""))).toEqual({ action, copy });
  });

  it("passes care filters and keeps summary separate from the list", async () => {
    await parse("care", "--status", "needs_sleeve", "--needs-sleeve", "poly", "--overdue-days", "180");
    expect(api.listRecordCare).toHaveBeenCalledWith({ friend_id: 2, status: "needs_sleeve", needs_sleeve: "poly", overdue_days: 180, limit: 50, offset: 0 });
    await parse("care", "--summary", "--json");
    expect(api.getRecordCareSummary).toHaveBeenCalledWith({ friend_id: 2, overdue_days: undefined, needs_sleeve: undefined });
    expect(JSON.parse(raw.join(""))).toMatchObject({ never_cleaned: 1 });
  });

  it("prints a readable summary and preserves the complete care list as JSON", async () => {
    await parse("care", "--summary");
    expect(output.join("\n")).toContain("Never cleaned");
    const care = { items: [{ release_id: "123", album_title: "Album", album_artist: "Artist", copy_id: null, inner_sleeve_type: null, last_cleaned_at: null }], total: 1 };
    api.listRecordCare.mockResolvedValueOnce(care);
    await parse("care", "--json");
    expect(JSON.parse(raw.join(""))).toEqual(care);
    expect(output.join("\n")).not.toContain("copy/copies found");
  });

  it("rejects an unsupported action without writing", async () => {
    await parse("log", "123", "played");
    expect(api.logRecordAction).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
