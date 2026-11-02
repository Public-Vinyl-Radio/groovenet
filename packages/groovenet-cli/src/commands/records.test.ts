import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());
vi.mock("@groovenet/client", () => ({ loadConfig, GroovenetClient: GroovenetClientMock }));

import { addRecordsCommands } from "./records.js";

const copy = {
  id: 7,
  release_id: "123",
  label: "DJ copy",
  is_default: true,
  inner_sleeve_type: null,
  last_cleaned_at: null,
};
const action = {
  id: 9,
  copy_id: 7,
  action_type: "cleaned",
  occurred_at: "2026-09-01T00:00:00.000Z",
  notes: null,
  sleeve_type: null,
  details: {},
  voided_at: null,
};
const api = {
  logRecordAction: vi.fn(),
  listRecordCopies: vi.fn(),
  createRecordCopy: vi.fn(),
  updateDefaultRecordCopy: vi.fn(),
  updateRecordCopy: vi.fn(),
  deleteRecordCopy: vi.fn(),
  listRecordActions: vi.fn(),
  voidRecordAction: vi.fn(),
  listRecordCare: vi.fn(),
  getRecordCareSummary: vi.fn(),
  getRecordCareQueue: vi.fn(),
  getRecordCareProgress: vi.fn(),
  pullRecordCareStack: vi.fn(),
  listRecordCareStacks: vi.fn(),
  discardRecordCareStack: vi.fn(),
  logRecordCareSession: vi.fn(),
  voidRecordCareSession: vi.fn(),
  listRecordCareLog: vi.fn(),
};

const stackItem = {
  position: 1,
  copy_id: null,
  release_id: "123",
  album_title: "Album",
  album_artist: "Artist",
  album_thumbnail: null,
  inner_sleeve_type: null,
  last_cleaned_at: null,
};
const stack = {
  id: 31,
  friend_id: 2,
  stack_no: 2,
  source: "cli",
  status: "open",
  created_at: "2026-10-01T00:00:00.000Z",
  logged_at: null,
  voided_at: null,
  items: [
    stackItem,
    { ...stackItem, position: 2, copy_id: 7, album_title: null, album_artist: null },
  ],
};
const mutation = { session: { ...stack, status: "logged" }, actions: [action, action], copies: [] };
const queueItem = {
  copy_id: null,
  release_id: "123",
  title: "Album",
  artist: "Artist",
  thumbnail: null,
  inner_sleeve_type: null,
  added_at: "2026-10-02T00:00:00.000Z",
};
const queue = {
  spun_recently: {
    month: "2026-10",
    window_label: "this month",
    items: [
      {
        ...queueItem,
        spin_count: 3,
        last_spin_at: "2026-10-03T00:00:00.000Z",
        window_label: "this month",
      },
    ],
  },
  new_arrivals: {
    window_days: 30,
    items: [queueItem, { ...queueItem, release_id: "456", added_at: null }],
  },
  backlog: { items: [{ ...queueItem, release_id: "789" }], total: 1, limit: 50, offset: 0 },
};
const progress = {
  cleaned: 10,
  total: 414,
  stack_size: 10,
  stacks_total: 42,
  stacks_done: 1,
  next_stack_no: 2,
  pace: { stacks_per_week: 3.46, projected_finish_date: "2027-03-01T00:00:00.000Z" },
  this_month: null,
  by_sleeve_type: {},
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
  let errors: string[];
  beforeEach(() => {
    output = [];
    raw = [];
    errors = [];
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
    api.listRecordCare.mockResolvedValue({
      items: [{ ...copy, copy_id: 7, album_title: "Album", album_artist: "Artist" }],
      total: 1,
    });
    api.getRecordCareSummary.mockResolvedValue({
      total: 1,
      never_cleaned: 1,
      overdue: 0,
      needs_sleeve: 1,
      by_sleeve_type: { unknown: 1 },
    });
    api.listRecordCareStacks.mockResolvedValue({ items: [stack], limit: 20, offset: 0 });
    api.logRecordCareSession.mockResolvedValue(mutation);
    api.voidRecordCareSession.mockResolvedValue({
      ...mutation,
      session: { ...stack, status: "open" },
    });
    api.pullRecordCareStack.mockResolvedValue({ stack, created: true });
    api.discardRecordCareStack.mockResolvedValue({ ...stack, status: "discarded" });
    api.getRecordCareQueue.mockResolvedValue(queue);
    api.getRecordCareProgress.mockResolvedValue(progress);
    api.listRecordCareLog.mockResolvedValue({
      items: [
        {
          kind: "session",
          session_id: 31,
          action_id: null,
          stack_no: 2,
          source: "cli",
          action_types: ["cleaned", "sleeved"],
          record_count: 10,
          method: null,
          sleeve_type: "poly",
          notes: null,
          occurred_at: "2026-10-04T00:00:00.000Z",
          voided: true,
          thumbnails: [],
        },
        {
          kind: "action",
          session_id: null,
          action_id: 9,
          stack_no: null,
          source: "web",
          action_types: ["cleaned"],
          record_count: 1,
          method: null,
          sleeve_type: null,
          notes: null,
          occurred_at: "2026-10-05T00:00:00.000Z",
          voided: false,
          thumbnails: [],
        },
      ],
      total: 2,
      limit: 20,
      offset: 0,
    });
    GroovenetClientMock.mockImplementation(function () {
      return api;
    });
    vi.spyOn(console, "log").mockImplementation((value: unknown) => {
      output.push(String(value));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(((value: string) => {
      raw.push(String(value));
      return true;
    }) as never);
    vi.spyOn(process.stderr, "write").mockImplementation(((value: string) => {
      errors.push(String(value));
      return true;
    }) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("logs cleaning on a release with a backdated method and notes", async () => {
    await parse(
      "clean",
      "123",
      "--at",
      "2026-09-01",
      "--method",
      "ultrasonic",
      "--note",
      "dusty",
      "--json",
    );
    expect(api.logRecordAction).toHaveBeenCalledWith({
      friend_id: 2,
      release_id: "123",
      action_type: "cleaned",
      occurred_at: "2026-09-01T00:00:00.000Z",
      notes: "dusty",
      details: { method: "ultrasonic" },
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
    expect(api.logRecordAction).toHaveBeenCalledWith({
      friend_id: 4,
      copy_id: 7,
      action_type: "sleeved",
      sleeve_type: "poly-rice-paper-poly",
    });
    await parse("log", "123", "repaired", "--note", "hinge fixed");
    expect(api.logRecordAction).toHaveBeenLastCalledWith({
      friend_id: 2,
      release_id: "123",
      action_type: "repaired",
      notes: "hinge fixed",
    });
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
    expect(api.createRecordCopy).toHaveBeenCalledWith({
      friend_id: 2,
      release_id: "123",
      label: "Backup",
      notes: undefined,
    });
    await parse("copies", "label", "123", "Main");
    expect(api.updateDefaultRecordCopy).toHaveBeenCalledWith({
      friend_id: 2,
      release_id: "123",
      label: "Main",
    });
    await parse("copies", "label", "123", "Spare", "--copy", "7");
    expect(api.listRecordCopies).toHaveBeenLastCalledWith(2, "123");
    expect(api.updateRecordCopy).toHaveBeenCalledWith(7, { friend_id: 2, label: "Spare" });
    await parse("copies", "remove", "7");
    expect(api.deleteRecordCopy).toHaveBeenCalledWith(7, 2);
  });

  it("shows an implicit copy and an empty copy list clearly", async () => {
    api.listRecordCopies.mockResolvedValueOnce([
      { ...copy, id: null, label: null, inner_sleeve_type: null, last_cleaned_at: null },
    ]);
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
    expect(api.createRecordCopy).toHaveBeenCalledWith({
      friend_id: 4,
      release_id: "123",
      label: undefined,
      notes: "backup",
    });
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
    expect(api.listRecordActions).toHaveBeenCalledWith(7, {
      friend_id: 2,
      include_voided: true,
      limit: 10,
      offset: 5,
    });
    await parse("void", "9");
    expect(api.voidRecordAction).toHaveBeenCalledWith(9, 2);
  });

  it("exposes action details and raw history for scripts", async () => {
    const sleeved = {
      ...action,
      sleeve_type: "poly",
      notes: "fresh",
      voided_at: "2026-09-02T00:00:00.000Z",
    };
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
    await parse(
      "care",
      "--status",
      "needs_sleeve",
      "--needs-sleeve",
      "poly",
      "--overdue-days",
      "180",
    );
    expect(api.listRecordCare).toHaveBeenCalledWith({
      friend_id: 2,
      status: "needs_sleeve",
      needs_sleeve: "poly",
      overdue_days: 180,
      limit: 50,
      offset: 0,
    });
    await parse("care", "--summary", "--json");
    expect(api.getRecordCareSummary).toHaveBeenCalledWith({
      friend_id: 2,
      overdue_days: undefined,
      needs_sleeve: undefined,
    });
    expect(JSON.parse(raw.join(""))).toMatchObject({ never_cleaned: 1 });
  });

  it("prints a readable summary and preserves the complete care list as JSON", async () => {
    await parse("care", "--summary");
    expect(output.join("\n")).toContain("Never cleaned");
    const care = {
      items: [
        {
          release_id: "123",
          album_title: "Album",
          album_artist: "Artist",
          copy_id: null,
          inner_sleeve_type: null,
          last_cleaned_at: null,
        },
      ],
      total: 1,
    };
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

  describe("care stacks", () => {
    const logged = () => output.join("\n");

    it("cleans a whole stack by its number with source cli", async () => {
      await parse(
        "clean",
        "--stack",
        "2",
        "--method",
        "vacuum",
        "--note",
        "n",
        "--at",
        "2026-09-01",
      );
      expect(api.listRecordCareStacks).toHaveBeenCalledWith({ friend_id: 2, status: "open" });
      expect(api.logRecordCareSession).toHaveBeenCalledWith({
        friend_id: 2,
        stack_id: 31,
        action_types: ["cleaned"],
        source: "cli",
        occurred_at: "2026-09-01T00:00:00.000Z",
        notes: "n",
        details: { method: "vacuum" },
      });
      expect(api.logRecordAction).not.toHaveBeenCalled();
      expect(logged()).toContain("Logged cleaned for stack 2 (2 records, session 31).");
    });

    it("logs cleaned and sleeved together with --sleeve", async () => {
      await parse("clean", "--stack", "2", "--sleeve", "poly-rice-paper-poly", "--json");
      expect(api.logRecordCareSession).toHaveBeenCalledWith({
        friend_id: 2,
        stack_id: 31,
        action_types: ["cleaned", "sleeved"],
        source: "cli",
        sleeve_type: "poly-rice-paper-poly",
      });
      expect(JSON.parse(raw.join(""))).toMatchObject({ session: { id: 31 } });
    });

    it("sleeves and logs a stack with the type as the only argument", async () => {
      await parse("sleeve", "--stack", "2", "poly");
      expect(api.logRecordCareSession).toHaveBeenLastCalledWith({
        friend_id: 2,
        stack_id: 31,
        action_types: ["sleeved"],
        source: "cli",
        sleeve_type: "poly",
      });
      await parse("log", "--stack", "2", "inspected", "--friend-id", "2");
      expect(api.logRecordCareSession).toHaveBeenLastCalledWith({
        friend_id: 2,
        stack_id: 31,
        action_types: ["inspected"],
        source: "cli",
      });
    });

    it("names the open stack when the number is wrong, or says to pull one", async () => {
      await parse("clean", "--stack", "5");
      expect(api.logRecordCareSession).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(errors.join("")).toContain("No open stack 5. The open stack is 2.");
      errors.length = 0;
      api.listRecordCareStacks.mockResolvedValueOnce({ items: [], limit: 20, offset: 0 });
      await parse("clean", "--stack", "5");
      expect(api.logRecordCareSession).not.toHaveBeenCalled();
      expect(errors.join("")).toContain("Pull one with `records stack`");
    });

    it("needs exactly one of a release or --stack", async () => {
      for (const args of [
        ["clean"],
        ["clean", "123", "--stack", "2"],
        ["clean", "--stack", "2", "--copy", "7"],
        ["clean", "123", "--sleeve", "poly"],
        ["sleeve", "123", "poly", "--stack", "2"],
        ["sleeve", "123"],
        ["sleeve", "--stack", "2"],
        ["log", "--stack", "2"],
        ["log"],
      ]) {
        process.exitCode = undefined;
        await parse(...args);
        expect(process.exitCode, args.join(" ")).toBe(1);
      }
      expect(api.logRecordCareSession).not.toHaveBeenCalled();
      expect(api.logRecordAction).not.toHaveBeenCalled();
    });

    it("pulls a stack as a numbered list, and shows an open one", async () => {
      await parse("stack", "--size", "5");
      expect(api.pullRecordCareStack).toHaveBeenCalledWith({
        friend_id: 2,
        size: 5,
        source: "cli",
      });
      expect(logged()).toContain("Stack 2 (pulled), 2 records:");
      expect(logged()).toContain("groovenet records clean --stack 2");
      output.length = 0;
      api.pullRecordCareStack.mockResolvedValueOnce({ stack, created: false });
      await parse("stack");
      expect(api.pullRecordCareStack).toHaveBeenLastCalledWith({ friend_id: 2, source: "cli" });
      expect(logged()).toContain("already open");
      await parse("stack", "--json");
      expect(JSON.parse(raw.join(""))).toEqual({ stack, created: true });
    });

    it("discards the open stack", async () => {
      await parse("stack", "--discard");
      expect(api.discardRecordCareStack).toHaveBeenCalledWith(31, 2);
      expect(logged()).toContain("Discarded stack 2.");
      await parse("stack", "--discard", "--json");
      expect(JSON.parse(raw.join(""))).toMatchObject({ status: "discarded" });
    });

    it("refuses to discard with no open stack or with --size", async () => {
      api.listRecordCareStacks.mockResolvedValueOnce({ items: [], limit: 20, offset: 0 });
      await parse("stack", "--discard");
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
      await parse("stack", "--discard", "--size", "3");
      expect(process.exitCode).toBe(1);
      expect(api.discardRecordCareStack).not.toHaveBeenCalled();
    });

    it("shows the queue by group and passes the limit", async () => {
      await parse("queue", "--limit", "1");
      expect(api.getRecordCareQueue).toHaveBeenCalledWith({ friend_id: 2, limit: 1 });
      expect(logged()).toContain("3 spins, this month");
      expect(logged()).toContain("added 2026-10-02");
      expect(logged()).not.toContain("456");
      output.length = 0;
      await parse("queue", "--group", "backlog");
      expect(api.getRecordCareQueue).toHaveBeenLastCalledWith({ friend_id: 2 });
      expect(logged()).toContain("789");
      expect(logged()).not.toContain("spins");
      await parse("queue", "--group", "new", "--json");
      expect(JSON.parse(raw.join(""))).toEqual(queue.new_arrivals);
      raw.length = 0;
      await parse("queue", "--json");
      expect(JSON.parse(raw.join(""))).toEqual(queue);
    });

    it("lists the care log and voids a whole session", async () => {
      await parse("sessions", "--limit", "5");
      expect(api.listRecordCareLog).toHaveBeenCalledWith({ friend_id: 2, limit: 5 });
      expect(logged()).toContain("cleaned + sleeved");
      await parse("sessions", "--json");
      expect(JSON.parse(raw.join(""))).toMatchObject({ total: 2 });
      raw.length = 0;
      output.length = 0;
      await parse("void", "--session", "31");
      expect(api.voidRecordCareSession).toHaveBeenCalledWith(31, 2);
      expect(logged()).toContain("Voided session 31 (2 actions); stack 2 is open again.");
      api.voidRecordCareSession.mockResolvedValueOnce({
        ...mutation,
        session: { ...stack, stack_no: null, status: "logged" },
      });
      output.length = 0;
      await parse("void", "--session", "31");
      expect(logged()).toBe("Voided session 31 (2 actions).");
      await parse("void", "--session", "31", "--json");
      expect(JSON.parse(raw.join(""))).toMatchObject({ actions: [action, action] });
      expect(api.voidRecordAction).not.toHaveBeenCalled();
    });

    it("needs exactly one of an action ID or --session to void", async () => {
      await parse("void");
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
      await parse("void", "9", "--session", "31");
      expect(process.exitCode).toBe(1);
      expect(api.voidRecordAction).not.toHaveBeenCalled();
      expect(api.voidRecordCareSession).not.toHaveBeenCalled();
    });

    it("prints progress, hiding pace when null and the next stack when done", async () => {
      await parse("progress");
      expect(logged()).toBe("10 / 414 cleaned · stack 2 of 42 next · 3.5 stacks/week → 2027-03-01");
      output.length = 0;
      api.getRecordCareProgress.mockResolvedValueOnce({ ...progress, pace: null });
      await parse("progress");
      expect(logged()).toBe("10 / 414 cleaned · stack 2 of 42 next");
      output.length = 0;
      api.getRecordCareProgress.mockResolvedValueOnce({
        ...progress,
        cleaned: 414,
        next_stack_no: null,
        pace: null,
      });
      await parse("progress");
      expect(logged()).toBe("414 / 414 cleaned · library complete");
      output.length = 0;
      api.getRecordCareProgress.mockResolvedValueOnce({
        ...progress,
        cleaned: 0,
        total: 0,
        next_stack_no: null,
        pace: null,
      });
      await parse("progress");
      expect(logged()).toBe("0 / 0 cleaned");
      await parse("progress", "--json");
      expect(JSON.parse(raw.join(""))).toEqual(progress);
    });
  });
});
