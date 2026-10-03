import { Command, InvalidArgumentError } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import type { CleaningMethod, RecordActionInput, RecordCareStatus, SleeveType } from "@groovenet/client";
import Table from "cli-table3";
import chalk from "chalk";
import { boundedIntOption } from "../options.js";
import { printError, printJson } from "../output.js";

const positiveInt = boundedIntOption(1);
const sleeveTypes: SleeveType[] = ["original", "paper", "poly-rice-paper-poly", "poly"];
const cleaningMethods: CleaningMethod[] = ["dry-brush", "wet-manual", "vacuum", "ultrasonic", "other"];
const careStatuses: RecordCareStatus[] = ["never_cleaned", "overdue", "needs_sleeve"];

function choice<T extends string>(values: readonly T[]) {
  return (value: string): T => {
    if (!values.includes(value as T)) throw new InvalidArgumentError(`expected one of: ${values.join(", ")}`);
    return value as T;
  };
}

function dateOption(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InvalidArgumentError("expected a date or ISO timestamp");
  return date.toISOString();
}

function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({ baseUrl: cfg.api_base, apiKey: cfg.api_key, insecureTls: cfg.insecure_tls, clientName: "cli" });
}

type Common = { friendId?: number; json?: boolean };
function friendId(opts: Common): number { return opts.friendId ?? loadConfig().default_friend_id; }

function table(head: string[], rows: (string | number)[][]): void {
  if (rows.length === 0) { console.log("No records found."); return; }
  const result = new Table({ head: head.map((h) => chalk.cyan(h)), wordWrap: true });
  for (const row of rows) result.push(row);
  console.log(result.toString());
}

function show(data: unknown, json: boolean, head: string[], rows: (string | number)[][]): void {
  if (json) printJson(data); else table(head, rows);
}

function handle(action: () => Promise<void>): () => Promise<void> {
  return async () => {
    try { await action(); }
    catch (error: unknown) { printError(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
  };
}

const common = <T extends Command>(command: T): T => command
  .option("--friend-id <id>", "Collection owner", positiveInt)
  .option("--json", "Output raw API response as JSON") as T;

type LogOptions = Common & { copy?: number; at?: string; method?: CleaningMethod; note?: string };
export function actionInput(release: string, actionType: RecordActionInput["action_type"], opts: LogOptions, sleeveType?: SleeveType): RecordActionInput {
  return {
    friend_id: friendId(opts), action_type: actionType,
    ...(opts.copy ? { copy_id: opts.copy } : { release_id: release }),
    ...(opts.at ? { occurred_at: opts.at } : {}),
    ...(opts.note ? { notes: opts.note } : {}),
    ...(sleeveType ? { sleeve_type: sleeveType } : {}),
    ...(opts.method ? { details: { method: opts.method } } : {}),
  } as RecordActionInput;
}

function actionOptions(command: Command): Command {
  return common(command).option("--copy <id>", "Physical copy ID", positiveInt)
    .option("--at <date>", "When the action happened", dateOption)
    .option("--note <text>", "Action notes");
}

async function logAction(client: GroovenetClient, release: string, actionType: RecordActionInput["action_type"], opts: LogOptions, sleeveType?: SleeveType) {
  if (opts.copy) {
    const copies = await client.listRecordCopies(friendId(opts), release);
    if (!copies.some((copy) => copy.id === opts.copy)) {
      throw new Error(`Copy ${opts.copy} does not belong to release ${release}.`);
    }
  }
  return client.logRecordAction(actionInput(release, actionType, opts, sleeveType));
}

export function addRecordsCommands(program: Command): void {
  const records = program.command("records").description("Manage physical copies and record care");

  actionOptions(records.command("clean <release>").description("Log a cleaning"))
    .option("--method <method>", "Cleaning method", choice(cleaningMethods))
    .action(async (release: string, opts: LogOptions) => handle(async () => {
      const result = await logAction(makeClient(), release, "cleaned", opts);
      if (opts.json) printJson(result); else console.log(`Cleaned ${release} (copy ${result.copy.id}, action ${result.action.id}).`);
    })());

  actionOptions(records.command("sleeve <release> <type>").description("Log an inner sleeve change"))
    .action(async (release: string, type: string, opts: LogOptions) => handle(async () => {
      const sleeveType = choice(sleeveTypes)(type);
      const result = await logAction(makeClient(), release, "sleeved", opts, sleeveType);
      if (opts.json) printJson(result); else console.log(`Sleeved ${release} with ${type} (copy ${result.copy.id}, action ${result.action.id}).`);
    })());

  actionOptions(records.command("log <release> <action>").description("Log an inspection or repair"))
    .action(async (release: string, action: string, opts: LogOptions) => handle(async () => {
      const actionType = choice(["inspected", "repaired"] as const)(action);
      const result = await logAction(makeClient(), release, actionType, opts);
      if (opts.json) printJson(result); else console.log(`Logged ${actionType} for ${release} (copy ${result.copy.id}, action ${result.action.id}).`);
    })());

  const copies = common(records.command("copies").description("List, add, label or remove copies"));
  // Commander assigns duplicate option names to the parent `copies` command,
  // even when they appear after a subcommand. Carry them into child actions.
  const copyOptions = <T extends Common>(opts: T): T => ({ ...copies.opts<Common>(), ...opts });
  copies.argument("[release]").action(async (release: string | undefined, opts: Common) => handle(async () => {
    if (!release) throw new Error("A release ID is required. Use `records copies <release>`.");
    const result = await makeClient().listRecordCopies(friendId(opts), release);
    show(result, !!opts.json, ["ID", "Label", "Default", "Sleeve", "Last cleaned"],
      result.map((c) => [c.id ?? "—", c.label ?? "—", c.is_default ? "yes" : "no", c.inner_sleeve_type ?? "—", c.last_cleaned_at ?? "—"]));
  })());

  common(copies.command("add <release>").description("Add another physical copy"))
    .option("--label <text>", "Copy label").option("--note <text>", "Copy notes")
    .action(async (release: string, opts: Common & { label?: string; note?: string }) => handle(async () => {
      opts = copyOptions(opts);
      const result = await makeClient().createRecordCopy({ friend_id: friendId(opts), release_id: release, label: opts.label, notes: opts.note });
      if (opts.json) printJson(result); else console.log(`Added copy ${result.id} of ${release}.`);
    })());

  common(copies.command("label <release> <label>").description("Label a copy; defaults to the release's default copy"))
    .option("--copy <id>", "Physical copy ID", positiveInt)
    .action(async (release: string, label: string, opts: Common & { copy?: number }) => handle(async () => {
      opts = copyOptions(opts);
      const client = makeClient();
      if (opts.copy) {
        const copies = await client.listRecordCopies(friendId(opts), release);
        if (!copies.some((copy) => copy.id === opts.copy)) {
          throw new Error(`Copy ${opts.copy} does not belong to release ${release}.`);
        }
      }
      const result = opts.copy
        ? await client.updateRecordCopy(opts.copy, { friend_id: friendId(opts), label })
        : await client.updateDefaultRecordCopy({ friend_id: friendId(opts), release_id: release, label });
      if (opts.json) printJson(result); else console.log(`Labeled copy ${result.id} of ${release}.`);
    })());

  common(copies.command("remove <id>").description("Soft-delete a physical copy"))
    .action(async (id: string, opts: Common) => handle(async () => {
      opts = copyOptions(opts);
      const result = await makeClient().deleteRecordCopy(positiveInt(id), friendId(opts));
      if (opts.json) printJson(result); else console.log(`Removed copy ${result.id}.`);
    })());

  common(records.command("history <copy-id>").description("Show a copy's care history"))
    .option("--include-voided", "Include voided actions")
    .option("--limit <n>", "Maximum actions", positiveInt, 50)
    .option("--offset <n>", "Actions to skip", boundedIntOption(0), 0)
    .action(async (id: string, opts: Common & { includeVoided?: boolean; limit: number; offset: number }) => handle(async () => {
      const result = await makeClient().listRecordActions(positiveInt(id), { friend_id: friendId(opts), include_voided: opts.includeVoided, limit: opts.limit, offset: opts.offset });
      show(result, !!opts.json, ["ID", "Action", "When", "Method / sleeve", "Notes", "Voided"],
        result.items.map((a) => [a.id, a.action_type, a.occurred_at, a.sleeve_type ?? a.details.method ?? "—", a.notes ?? "—", a.voided_at ?? "—"]));
    })());

  common(records.command("void <action-id>").description("Void a mistaken care action"))
    .action(async (id: string, opts: Common) => handle(async () => {
      const result = await makeClient().voidRecordAction(positiveInt(id), friendId(opts));
      if (opts.json) printJson(result); else console.log(`Voided action ${result.action.id}.`);
    })());

  common(records.command("care").description("Find records that need care"))
    .option("--status <status>", "Care state", choice(careStatuses))
    .option("--overdue-days <n>", "Cleaning interval in days", positiveInt)
    .option("--needs-sleeve <type>", "Wanted inner sleeve", choice(sleeveTypes))
    .option("--summary", "Show counts by care state and sleeve type")
    .option("--limit <n>", "Maximum records", positiveInt, 50)
    .option("--offset <n>", "Records to skip", boundedIntOption(0), 0)
    .action(async (opts: Common & { status?: RecordCareStatus; overdueDays?: number; needsSleeve?: SleeveType; summary?: boolean; limit: number; offset: number }) => handle(async () => {
      const client = makeClient();
      const query = { friend_id: friendId(opts), overdue_days: opts.overdueDays, needs_sleeve: opts.needsSleeve };
      if (opts.summary) {
        const result = await client.getRecordCareSummary(query);
        show(result, !!opts.json, ["Care state", "Count"], [
          ["Total copies", result.total], ["Never cleaned", result.never_cleaned], ["Overdue", result.overdue], ["Needs sleeve", result.needs_sleeve],
          ...Object.entries(result.by_sleeve_type).map(([type, count]) => [`Sleeve: ${type}`, count]),
        ]);
      } else {
        const result = await client.listRecordCare({ ...query, status: opts.status, limit: opts.limit, offset: opts.offset });
        if (!opts.json) console.log(`${result.total} copy/copies found.`);
        show(result, !!opts.json, ["Release", "Album", "Artist", "Copy", "Sleeve", "Last cleaned"],
          result.items.map((c) => [c.release_id, c.album_title, c.album_artist, c.copy_id ?? "—", c.inner_sleeve_type ?? "—", c.last_cleaned_at ?? "—"]));
      }
    })());
}
